import { File } from 'expo-file-system';

import type { FlowAudioInput } from '../flows/types';
import {
  createTemporaryAudioFileCleanup,
  type TemporaryAudioFileCleanup,
  type TemporaryAudioFileReference,
} from './fileCleanup';

export const MAX_RECORDING_DURATION_MS = 60_000;

export type AudioRecordingStatus =
  | 'idle'
  | 'requesting_permission'
  | 'recording'
  | 'stopping'
  | 'stopped'
  | 'processing'
  | 'failed';

export type AudioRecordingStopReason = 'manual' | 'max_duration';

export type AudioRecordingState =
  | {
      readonly status: 'idle' | 'requesting_permission' | 'recording' | 'stopping';
    }
  | {
      readonly audio?: FlowAudioInput;
      readonly stopReason?: AudioRecordingStopReason;
      readonly status: 'stopped' | 'processing';
    }
  | {
      readonly error: unknown;
      readonly status: 'failed';
    };

export type AudioRecorderErrorCode =
  | 'permission_denied'
  | 'recording_unavailable'
  | 'recording_not_started';

export class AudioRecorderError extends Error {
  readonly code: AudioRecorderErrorCode;

  constructor(code: AudioRecorderErrorCode, message: string, options?: { readonly cause?: unknown }) {
    super(message);
    this.code = code;
    this.name = 'AudioRecorderError';
    this.cause = options?.cause;
  }
}

export type NativeAudioRecordingStopResult = {
  readonly durationMs?: number;
  readonly uri?: string | null;
};

export type NativeAudioRecordingSession = {
  readonly stop: () => Promise<NativeAudioRecordingStopResult>;
  readonly getTemporaryFileReference?: () => TemporaryAudioFileReference;
};

export type AudioRecorderNativeAdapter = {
  readonly requestRecordingPermission: () => Promise<{ readonly granted: boolean }>;
  readonly startRecording: () => Promise<NativeAudioRecordingSession>;
};

export type AudioFileReader = {
  readonly readBase64: (uri: string) => Promise<string>;
};

export type AudioRecordingControllerTimer = {
  readonly clearTimeout: (id: ReturnType<typeof setTimeout>) => void;
  readonly setTimeout: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
};

export type AudioRecordingStateListener = (state: AudioRecordingState) => void;

export type AudioRecordingController = {
  readonly cancel: () => Promise<void>;
  readonly getState: () => AudioRecordingState;
  readonly processStoppedAudio: (
    processor: (audio: FlowAudioInput) => Promise<void>,
  ) => Promise<void>;
  readonly start: () => Promise<void>;
  readonly stop: () => Promise<FlowAudioInput>;
  readonly subscribe: (listener: AudioRecordingStateListener) => () => void;
};

type ExpoAudioRecorder = {
  readonly getStatus: () => {
    readonly durationMillis?: number;
    readonly url?: string | null;
  };
  readonly prepareToRecordAsync: () => Promise<void>;
  readonly record: () => void;
  readonly stop: () => Promise<void>;
  readonly uri?: string | null;
};

type ExpoAudioModule = {
  readonly AudioModule: {
    readonly AudioRecorder: new (options: Record<string, unknown>) => ExpoAudioRecorder;
  };
  readonly RecordingPresets: {
    readonly HIGH_QUALITY: Record<string, unknown>;
  };
  readonly requestRecordingPermissionsAsync: () => Promise<{ readonly granted: boolean }>;
  readonly setAudioModeAsync: (mode: {
    readonly allowsRecording: boolean;
    readonly playsInSilentMode: boolean;
  }) => Promise<void>;
};

const defaultTimer: AudioRecordingControllerTimer = {
  clearTimeout: (id) => clearTimeout(id),
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
};

const expoAudioFileReader: AudioFileReader = {
  async readBase64(uri) {
    return new File(uri).base64();
  },
};

function getAudioReference(audio: FlowAudioInput | TemporaryAudioFileReference | undefined) {
  const reference = audio as TemporaryAudioFileReference | undefined;

  return {
    path: reference?.path,
    uri: reference?.uri,
  };
}

async function cleanupReference(
  temporaryAudio: TemporaryAudioFileCleanup | undefined,
  reference: TemporaryAudioFileReference | undefined,
) {
  try {
    await temporaryAudio?.cleanup(getAudioReference(reference));
  } catch {
    // Temporary-file cleanup is best-effort and must not replace the primary recorder outcome.
  }
}

function normalizeRecordingError(error: unknown) {
  if (error instanceof Error) {
    return error;
  }

  return new AudioRecorderError('recording_unavailable', 'Recording failed.');
}

async function loadExpoAudioModule(): Promise<ExpoAudioModule> {
  return import('expo-audio') as Promise<ExpoAudioModule>;
}

export function createAudioRecordingController({
  audioFileReader = expoAudioFileReader,
  nativeRecorder = createExpoAudioRecorderAdapter(),
  temporaryAudio = createTemporaryAudioFileCleanup(),
  timer = defaultTimer,
}: {
  readonly audioFileReader?: AudioFileReader;
  readonly nativeRecorder?: AudioRecorderNativeAdapter;
  readonly temporaryAudio?: TemporaryAudioFileCleanup;
  readonly timer?: AudioRecordingControllerTimer;
} = {}): AudioRecordingController {
  let state: AudioRecordingState = { status: 'idle' };
  let session: NativeAudioRecordingSession | undefined;
  let maxDurationTimer: ReturnType<typeof setTimeout> | undefined;
  let stopPromise: Promise<FlowAudioInput> | undefined;
  const listeners = new Set<AudioRecordingStateListener>();

  function emit(nextState: AudioRecordingState) {
    state = nextState;
    listeners.forEach((listener) => listener(state));
  }

  function clearMaxDurationTimer() {
    if (maxDurationTimer) {
      timer.clearTimeout(maxDurationTimer);
      maxDurationTimer = undefined;
    }
  }

  async function stopRecording(stopReason: AudioRecordingStopReason = 'manual') {
    if (stopPromise) {
      return stopPromise;
    }

    if (!session || state.status !== 'recording') {
      throw new AudioRecorderError('recording_not_started', 'No active recording to stop.');
    }

    stopPromise = (async () => {
      const activeSession = session;
      const fallbackReference = activeSession.getTemporaryFileReference?.();
      clearMaxDurationTimer();
      emit({ status: 'stopping' });

      try {
        const stoppedRecording = await activeSession.stop();
        const uri = stoppedRecording.uri ?? fallbackReference?.uri;

        if (!uri) {
          throw new AudioRecorderError('recording_unavailable', 'Recording did not return audio.');
        }

        const audio: FlowAudioInput = {
          uri,
          base64Audio: await audioFileReader.readBase64(uri),
          format: 'm4a',
          ...(stoppedRecording.durationMs !== undefined
            ? { durationMs: stoppedRecording.durationMs }
            : {}),
        };

        session = undefined;
        emit({ audio, status: 'stopped', stopReason });
        return audio;
      } catch (error) {
        session = undefined;
        const primaryError = normalizeRecordingError(error);
        await cleanupReference(temporaryAudio, fallbackReference);
        emit({ error: primaryError, status: 'failed' });
        throw primaryError;
      } finally {
        stopPromise = undefined;
      }
    })();

    return stopPromise;
  }

  async function cleanupStoppedAudio(audio: FlowAudioInput | undefined) {
    await cleanupReference(temporaryAudio, audio);
  }

  return {
    async cancel() {
      clearMaxDurationTimer();

      if (state.status === 'recording' && session) {
        const activeSession = session;
        const fallbackReference = activeSession.getTemporaryFileReference?.();

        try {
          const stoppedRecording = await activeSession.stop();
          await cleanupReference(temporaryAudio, stoppedRecording.uri ? stoppedRecording : fallbackReference);
        } catch {
          await cleanupReference(temporaryAudio, fallbackReference);
        } finally {
          session = undefined;
          stopPromise = undefined;
          emit({ status: 'idle' });
        }
        return;
      }

      if ((state.status === 'stopped' || state.status === 'processing') && state.audio) {
        await cleanupStoppedAudio(state.audio);
      }

      session = undefined;
      stopPromise = undefined;
      emit({ status: 'idle' });
    },
    getState() {
      return state;
    },
    async processStoppedAudio(processor) {
      if ((state.status !== 'stopped' && state.status !== 'processing') || !state.audio) {
        throw new AudioRecorderError('recording_not_started', 'No stopped recording to process.');
      }

      const audio = state.audio;
      const stopReason = state.stopReason;
      emit({ audio, status: 'processing', stopReason });

      try {
        await processor(audio);
        await cleanupStoppedAudio(audio);
        emit({ status: 'stopped' });
      } catch (error) {
        await cleanupStoppedAudio(audio);
        emit({ error, status: 'failed' });
        throw error;
      }
    },
    async start() {
      clearMaxDurationTimer();

      if (state.status === 'stopped' && state.audio) {
        await cleanupStoppedAudio(state.audio);
      }

      emit({ status: 'requesting_permission' });

      try {
        const permission = await nativeRecorder.requestRecordingPermission();

        if (!permission.granted) {
          throw new AudioRecorderError(
            'permission_denied',
            'Microphone permission is required to record.',
          );
        }

        session = await nativeRecorder.startRecording();
        emit({ status: 'recording' });
        maxDurationTimer = timer.setTimeout(() => {
          void stopRecording('max_duration');
        }, MAX_RECORDING_DURATION_MS);
      } catch (error) {
        const primaryError = normalizeRecordingError(error);
        session = undefined;
        emit({ error: primaryError, status: 'failed' });
        throw primaryError;
      }
    },
    stop: stopRecording,
    subscribe(listener) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export function createExpoAudioRecorderAdapter(
  expoAudioModule?: ExpoAudioModule,
): AudioRecorderNativeAdapter {
  async function getExpoAudioModule() {
    return expoAudioModule ?? loadExpoAudioModule();
  }

  return {
    async requestRecordingPermission() {
      const { requestRecordingPermissionsAsync } = await getExpoAudioModule();
      const permission = await requestRecordingPermissionsAsync();
      return { granted: permission.granted };
    },
    async startRecording() {
      const { AudioModule, RecordingPresets, setAudioModeAsync } = await getExpoAudioModule();

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      const recorder = new AudioModule.AudioRecorder({
        ...RecordingPresets.HIGH_QUALITY,
        directory: 'cache',
        extension: '.m4a',
      });

      await recorder.prepareToRecordAsync();
      recorder.record();

      return {
        async stop() {
          await recorder.stop();
          const status = recorder.getStatus();

          return {
            durationMs: status.durationMillis,
            uri: recorder.uri ?? status.url,
          };
        },
        getTemporaryFileReference() {
          return {
            uri: recorder.uri,
          };
        },
      };
    },
  };
}
