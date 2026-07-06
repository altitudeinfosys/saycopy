import {
  RecordingPresets,
  requestRecordingPermissionsAsync as requestExpoRecordingPermissionsAsync,
  setAudioModeAsync as setExpoAudioModeAsync,
  useAudioRecorder,
  type AudioRecorder as ExpoAudioRecorder,
} from 'expo-audio';
import { File } from 'expo-file-system';
import { useMemo } from 'react';

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

type ExpoAudioRecorderInstance = Pick<
  ExpoAudioRecorder,
  'getStatus' | 'prepareToRecordAsync' | 'record' | 'stop'
> & {
  readonly uri?: string | null;
};

export type ExpoAudioRecorderAdapterDependencies = {
  readonly recorder: ExpoAudioRecorderInstance;
  readonly requestRecordingPermissionsAsync?: () => Promise<{ readonly granted: boolean }>;
  readonly setAudioModeAsync?: (mode: {
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

function createUnavailableNativeRecorder(): AudioRecorderNativeAdapter {
  async function throwUnavailable(): Promise<never> {
    throw new AudioRecorderError(
      'recording_unavailable',
      'Recording is not configured for this screen.',
    );
  }

  return {
    requestRecordingPermission: throwUnavailable,
    startRecording: throwUnavailable,
  };
}

export function createAudioRecordingController({
  audioFileReader = expoAudioFileReader,
  nativeRecorder = createUnavailableNativeRecorder(),
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
  let cancelPromise: Promise<void> | undefined;
  let startPromise: Promise<void> | undefined;
  let stopPromise: Promise<FlowAudioInput> | undefined;
  let transitionGeneration = 0;
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
    if (cancelPromise) {
      throw new AudioRecorderError('recording_not_started', 'Recording cancellation is in progress.');
    }

    if (stopPromise) {
      return stopPromise;
    }

    if (!session || state.status !== 'recording') {
      throw new AudioRecorderError('recording_not_started', 'No active recording to stop.');
    }

    stopPromise = (async () => {
      const operationGeneration = transitionGeneration;
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
        if (operationGeneration !== transitionGeneration) {
          return audio;
        }

        emit({ audio, status: 'stopped', stopReason });
        return audio;
      } catch (error) {
        session = undefined;
        const primaryError = normalizeRecordingError(error);
        await cleanupReference(temporaryAudio, fallbackReference);

        if (operationGeneration === transitionGeneration) {
          emit({ error: primaryError, status: 'failed' });
        }

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

  async function stopAndCleanupSession(activeSession: NativeAudioRecordingSession) {
    const fallbackReference = activeSession.getTemporaryFileReference?.();

    try {
      const stoppedRecording = await activeSession.stop();
      await cleanupReference(
        temporaryAudio,
        stoppedRecording.uri ? stoppedRecording : fallbackReference,
      );
    } catch {
      await cleanupReference(temporaryAudio, fallbackReference);
    }
  }

  return {
    async cancel() {
      if (cancelPromise) {
        return cancelPromise;
      }

      transitionGeneration += 1;
      const cancelGeneration = transitionGeneration;
      clearMaxDurationTimer();

      if (stopPromise) {
        cancelPromise = (async () => {
          try {
            const audio = await stopPromise;
            await cleanupStoppedAudio(audio);
          } catch {
            // The stop path already performs best-effort fallback cleanup.
          } finally {
            session = undefined;
            stopPromise = undefined;

            if (transitionGeneration === cancelGeneration) {
              emit({ status: 'idle' });
            }

            cancelPromise = undefined;
          }
        })();

        return cancelPromise;
      }

      if (state.status === 'recording' && session) {
        const activeSession = session;
        session = undefined;
        emit({ status: 'stopping' });
        cancelPromise = (async () => {
          try {
            await stopAndCleanupSession(activeSession);
          } finally {
            stopPromise = undefined;

            if (transitionGeneration === cancelGeneration) {
              emit({ status: 'idle' });
            }

            cancelPromise = undefined;
          }
        })();

        return cancelPromise;
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

      const operationGeneration = transitionGeneration;
      const audio = state.audio;
      const stopReason = state.stopReason;
      emit({ audio, status: 'processing', stopReason });

      try {
        await processor(audio);
        if (operationGeneration !== transitionGeneration) {
          return;
        }

        await cleanupStoppedAudio(audio);
        if (operationGeneration !== transitionGeneration) {
          return;
        }

        emit({ status: 'stopped' });
      } catch (error) {
        if (operationGeneration !== transitionGeneration) {
          throw error;
        }

        await cleanupStoppedAudio(audio);
        emit({ error, status: 'failed' });
        throw error;
      }
    },
    async start() {
      if (startPromise) {
        return startPromise;
      }

      startPromise = (async () => {
        const operationGeneration = transitionGeneration;
        clearMaxDurationTimer();

        if (state.status === 'recording' || state.status === 'stopping' || state.status === 'processing') {
          return;
        }

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

          const startedSession = await nativeRecorder.startRecording();

          if (operationGeneration !== transitionGeneration) {
            await stopAndCleanupSession(startedSession);
            return;
          }

          session = startedSession;
          emit({ status: 'recording' });
          maxDurationTimer = timer.setTimeout(() => {
            void stopRecording('max_duration');
          }, MAX_RECORDING_DURATION_MS);
        } catch (error) {
          const primaryError = normalizeRecordingError(error);
          session = undefined;

          if (operationGeneration === transitionGeneration) {
            emit({ error: primaryError, status: 'failed' });
          }

          throw primaryError;
        } finally {
          startPromise = undefined;
        }
      })();

      return startPromise;
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

export function createExpoAudioRecorderAdapter({
  recorder,
  requestRecordingPermissionsAsync = requestExpoRecordingPermissionsAsync,
  setAudioModeAsync = setExpoAudioModeAsync,
}: ExpoAudioRecorderAdapterDependencies): AudioRecorderNativeAdapter {
  return {
    async requestRecordingPermission() {
      const permission = await requestRecordingPermissionsAsync();
      return { granted: permission.granted };
    },
    async startRecording() {
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
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
          const status = recorder.getStatus();

          return {
            uri: recorder.uri ?? status.url,
          };
        },
      };
    },
  };
}

export function useExpoAudioRecordingController(): AudioRecordingController {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  return useMemo(
    () =>
      createAudioRecordingController({
        nativeRecorder: createExpoAudioRecorderAdapter({ recorder }),
      }),
    [recorder],
  );
}
