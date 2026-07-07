import { renderHook } from '@testing-library/react-native';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';

import type { FlowAudioInput } from '../../flows/types';
import {
  createAudioRecordingController,
  createExpoAudioRecorderAdapter,
  type AudioRecorderNativeAdapter,
  type AudioRecordingControllerTimer,
  type NativeAudioRecordingSession,
  useExpoAudioRecordingController,
} from '../audioRecorder';

jest.mock('expo-audio', () => ({
  RecordingPresets: {
    HIGH_QUALITY: {
      extension: '.m4a',
      sampleRate: 44100,
    },
  },
  requestRecordingPermissionsAsync: jest.fn(),
  setAudioModeAsync: jest.fn(),
  useAudioRecorder: jest.fn(),
}));

const mockExpoRecorder = {
  getStatus: jest.fn(() => ({
    canRecord: false,
    durationMillis: 1000,
    isRecording: false,
    mediaServicesDidReset: false,
    url: 'file:///tmp/expo-recording.m4a',
  })),
  prepareToRecordAsync: jest.fn().mockResolvedValue(undefined),
  record: jest.fn(),
  stop: jest.fn().mockResolvedValue(undefined),
  uri: 'file:///tmp/expo-recording.m4a',
};
const mockRequestRecordingPermissionsAsync = jest.fn().mockResolvedValue({ granted: true });
const mockSetAudioModeAsync = jest.fn().mockResolvedValue(undefined);

function createDeferred<T>() {
  let reject!: (reason?: unknown) => void;
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return {
    promise,
    reject,
    resolve,
  };
}

function createManualTimer(): AudioRecordingControllerTimer & {
  readonly setTimeout: jest.Mock;
  readonly clearTimeout: jest.Mock;
  fireNext: () => Promise<void>;
} {
  const callbacks = new Map<number, () => void>();
  let nextId = 1;

  return {
    setTimeout: jest.fn((callback: () => void, _delayMs: number) => {
      const id = nextId;
      nextId += 1;
      callbacks.set(id, callback);
      return id;
    }),
    clearTimeout: jest.fn((id: number) => {
      callbacks.delete(id);
    }),
    async fireNext() {
      const [id, callback] = callbacks.entries().next().value ?? [];
      if (id === undefined || callback === undefined) {
        return;
      }

      callbacks.delete(id);
      callback();
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

function createSession(input: {
  readonly uri?: string;
  readonly durationMs?: number;
  readonly stopError?: Error;
} = {}): NativeAudioRecordingSession {
  const uri = input.uri ?? 'file:///tmp/recording.m4a';
  const durationMs = input.durationMs ?? 1250;

  return {
    stop: jest.fn(async () => {
      if (input.stopError) {
        throw input.stopError;
      }

      return { durationMs, uri };
    }),
    getTemporaryFileReference: jest.fn(() => ({ uri })),
  };
}

function createNativeAdapter(session: NativeAudioRecordingSession): AudioRecorderNativeAdapter {
  return {
    requestRecordingPermission: jest.fn().mockResolvedValue({ granted: true }),
    startRecording: jest.fn().mockResolvedValue(session),
  };
}

describe('createAudioRecordingController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('moves through permission, recording, stopping, stopped, and processing states', async () => {
    const session = createSession({ durationMs: 2345 });
    const nativeRecorder = createNativeAdapter(session);
    const timer = createManualTimer();
    const cleanup = {
      cleanup: jest.fn().mockResolvedValue(undefined),
    };
    const controller = createAudioRecordingController({
      audioFileReader: { readBase64: jest.fn().mockResolvedValue('base64-audio') },
      nativeRecorder,
      temporaryAudio: cleanup,
      timer,
    });
    const states = [controller.getState().status];
    controller.subscribe((state) => states.push(state.status));

    await controller.start();
    const audio = await controller.stop();
    await controller.processStoppedAudio(async (stoppedAudio) => {
      expect(stoppedAudio).toEqual(audio);
    });

    expect(states).toEqual([
      'idle',
      'requesting_permission',
      'recording',
      'stopping',
      'stopped',
      'processing',
      'stopped',
    ]);
    expect(nativeRecorder.startRecording).toHaveBeenCalledWith();
    expect(audio).toEqual({
      uri: 'file:///tmp/recording.m4a',
      base64Audio: 'base64-audio',
      format: 'm4a',
      durationMs: 2345,
    });
  });

  it('enters failed state when microphone permission is denied', async () => {
    const nativeRecorder: AudioRecorderNativeAdapter = {
      requestRecordingPermission: jest.fn().mockResolvedValue({ granted: false }),
      startRecording: jest.fn(),
    };
    const controller = createAudioRecordingController({
      audioFileReader: { readBase64: jest.fn() },
      nativeRecorder,
      temporaryAudio: { cleanup: jest.fn() },
    });
    const states = [controller.getState().status];
    controller.subscribe((state) => states.push(state.status));

    await expect(controller.start()).rejects.toMatchObject({
      code: 'permission_denied',
    });

    expect(states).toEqual(['idle', 'requesting_permission', 'failed']);
    expect(nativeRecorder.startRecording).not.toHaveBeenCalled();
  });

  it('serializes concurrent start calls into one native session and one timer', async () => {
    const session = createSession();
    const startDeferred = createDeferred<NativeAudioRecordingSession>();
    const nativeRecorder: AudioRecorderNativeAdapter = {
      requestRecordingPermission: jest.fn().mockResolvedValue({ granted: true }),
      startRecording: jest.fn().mockReturnValue(startDeferred.promise),
    };
    const timer = createManualTimer();
    const controller = createAudioRecordingController({
      audioFileReader: { readBase64: jest.fn().mockResolvedValue('serialized-start-base64') },
      nativeRecorder,
      temporaryAudio: { cleanup: jest.fn() },
      timer,
    });

    const firstStart = controller.start();
    const secondStart = controller.start();
    startDeferred.resolve(session);
    await Promise.all([firstStart, secondStart]);

    expect(nativeRecorder.requestRecordingPermission).toHaveBeenCalledTimes(1);
    expect(nativeRecorder.startRecording).toHaveBeenCalledTimes(1);
    expect(timer.setTimeout).toHaveBeenCalledTimes(1);

    await controller.cancel();
  });

  it('auto-stops recording at the 60 second cap', async () => {
    const session = createSession({ durationMs: 60000 });
    const nativeRecorder = createNativeAdapter(session);
    const timer = createManualTimer();
    const controller = createAudioRecordingController({
      audioFileReader: { readBase64: jest.fn().mockResolvedValue('capped-base64') },
      nativeRecorder,
      temporaryAudio: { cleanup: jest.fn() },
      timer,
    });

    await controller.start();
    await timer.fireNext();

    expect(timer.setTimeout).toHaveBeenCalledWith(expect.any(Function), 60000);
    expect(session.stop).toHaveBeenCalledTimes(1);
    expect(controller.getState()).toMatchObject({
      audio: {
        durationMs: 60000,
        uri: 'file:///tmp/recording.m4a',
      },
      stopReason: 'max_duration',
      status: 'stopped',
    });
  });

  it('cleans abandoned stopped audio before starting a new recording', async () => {
    const firstSession = createSession({ uri: 'file:///tmp/abandoned-recording.m4a' });
    const secondSession = createSession({ uri: 'file:///tmp/next-recording.m4a' });
    const nativeRecorder: AudioRecorderNativeAdapter = {
      requestRecordingPermission: jest.fn().mockResolvedValue({ granted: true }),
      startRecording: jest.fn().mockResolvedValueOnce(firstSession).mockResolvedValueOnce(secondSession),
    };
    const cleanup = {
      cleanup: jest.fn().mockResolvedValue(undefined),
    };
    const timer = createManualTimer();
    const controller = createAudioRecordingController({
      audioFileReader: { readBase64: jest.fn().mockResolvedValue('abandoned-base64') },
      nativeRecorder,
      temporaryAudio: cleanup,
      timer,
    });

    await controller.start();
    await controller.stop();
    await controller.start();

    expect(cleanup.cleanup).toHaveBeenCalledWith({
      uri: 'file:///tmp/abandoned-recording.m4a',
    });
    expect(nativeRecorder.startRecording).toHaveBeenCalledTimes(2);
    expect(controller.getState()).toEqual({ status: 'recording' });

    await controller.cancel();
  });

  it('blocks a new start while stopped audio cancellation cleanup is pending', async () => {
    const cleanupDeferred = createDeferred<void>();
    const firstSession = createSession({ uri: 'file:///tmp/cancel-before-restart.m4a' });
    const secondSession = createSession({ uri: 'file:///tmp/restart-after-cancel.m4a' });
    const nativeRecorder: AudioRecorderNativeAdapter = {
      requestRecordingPermission: jest.fn().mockResolvedValue({ granted: true }),
      startRecording: jest.fn().mockResolvedValueOnce(firstSession).mockResolvedValueOnce(secondSession),
    };
    const cleanup = {
      cleanup: jest.fn().mockReturnValueOnce(cleanupDeferred.promise).mockResolvedValue(undefined),
    };
    const controller = createAudioRecordingController({
      audioFileReader: { readBase64: jest.fn().mockResolvedValue('cancel-before-restart-base64') },
      nativeRecorder,
      temporaryAudio: cleanup,
    });

    await controller.start();
    await controller.stop();

    const cancelPromise = controller.cancel();
    expect(controller.getState()).toEqual({ status: 'stopping' });

    await controller.start();

    expect(nativeRecorder.startRecording).toHaveBeenCalledTimes(1);
    expect(controller.getState()).toEqual({ status: 'stopping' });

    cleanupDeferred.resolve();
    await cancelPromise;

    expect(cleanup.cleanup).toHaveBeenCalledWith({
      uri: 'file:///tmp/cancel-before-restart.m4a',
    });
    expect(controller.getState()).toEqual({ status: 'idle' });

    await controller.start();

    expect(nativeRecorder.startRecording).toHaveBeenCalledTimes(2);
    expect(controller.getState()).toEqual({ status: 'recording' });

    await controller.cancel();
  });

  it('does not open a native session when cancel interrupts restart cleanup', async () => {
    const cleanupBeforeRestart = createDeferred<void>();
    const firstSession = createSession({ uri: 'file:///tmp/restart-cancel-first.m4a' });
    const secondSession = createSession({ uri: 'file:///tmp/restart-cancel-second.m4a' });
    const nativeRecorder: AudioRecorderNativeAdapter = {
      requestRecordingPermission: jest.fn().mockResolvedValue({ granted: true }),
      startRecording: jest.fn().mockResolvedValueOnce(firstSession).mockResolvedValueOnce(secondSession),
    };
    const cleanup = {
      cleanup: jest.fn().mockReturnValueOnce(cleanupBeforeRestart.promise).mockResolvedValue(undefined),
    };
    const controller = createAudioRecordingController({
      audioFileReader: { readBase64: jest.fn().mockResolvedValue('restart-cancel-base64') },
      nativeRecorder,
      temporaryAudio: cleanup,
    });

    await controller.start();
    await controller.stop();

    const restartPromise = controller.start();
    expect(cleanup.cleanup).toHaveBeenCalledWith({
      uri: 'file:///tmp/restart-cancel-first.m4a',
    });

    const cancelPromise = controller.cancel();
    expect(controller.getState()).toEqual({ status: 'stopping' });

    cleanupBeforeRestart.resolve();
    await Promise.all([restartPromise, cancelPromise]);

    expect(nativeRecorder.requestRecordingPermission).toHaveBeenCalledTimes(1);
    expect(nativeRecorder.startRecording).toHaveBeenCalledTimes(1);
    expect(secondSession.stop).not.toHaveBeenCalled();
    expect(controller.getState()).toEqual({ status: 'idle' });
  });

  it('adapts an explicit public Expo recorder instance without the private AudioModule constructor', async () => {
    const adapter = createExpoAudioRecorderAdapter({
      recorder: mockExpoRecorder,
      requestRecordingPermissionsAsync: mockRequestRecordingPermissionsAsync,
      setAudioModeAsync: mockSetAudioModeAsync,
    });

    const permission = await adapter.requestRecordingPermission();
    const session = await adapter.startRecording();
    const stoppedRecording = await session.stop();

    expect(permission).toEqual({ granted: true });
    expect(mockSetAudioModeAsync).toHaveBeenCalledWith({
      allowsRecording: true,
      playsInSilentMode: true,
    });
    expect(mockExpoRecorder.prepareToRecordAsync).toHaveBeenCalledWith();
    expect(mockExpoRecorder.record).toHaveBeenCalledWith();
    expect(stoppedRecording).toEqual({
      durationMs: 1000,
      uri: 'file:///tmp/expo-recording.m4a',
    });
  });

  it('creates the default recording controller from the public Expo audio hook and preset', () => {
    const mockedUseAudioRecorder = useAudioRecorder as jest.MockedFunction<
      typeof useAudioRecorder
    >;
    mockedUseAudioRecorder.mockReturnValue(mockExpoRecorder as never);

    const { result } = renderHook(() => useExpoAudioRecordingController());

    expect(mockedUseAudioRecorder).toHaveBeenCalledWith(RecordingPresets.HIGH_QUALITY);
    expect(requestRecordingPermissionsAsync).toBeDefined();
    expect(setAudioModeAsync).toBeDefined();
    expect(result.current?.getState()).toEqual({ status: 'idle' });
  });

  it('cleans temporary audio after successful result creation', async () => {
    const session = createSession();
    const cleanup = {
      cleanup: jest.fn().mockResolvedValue(undefined),
    };
    const controller = createAudioRecordingController({
      audioFileReader: { readBase64: jest.fn().mockResolvedValue('success-base64') },
      nativeRecorder: createNativeAdapter(session),
      temporaryAudio: cleanup,
    });

    await controller.start();
    await controller.stop();
    await controller.processStoppedAudio(async () => undefined);

    expect(cleanup.cleanup).toHaveBeenCalledWith({ uri: 'file:///tmp/recording.m4a' });
  });

  it('cleans temporary audio when recording is canceled', async () => {
    const session = createSession();
    const cleanup = {
      cleanup: jest.fn().mockResolvedValue(undefined),
    };
    const controller = createAudioRecordingController({
      audioFileReader: { readBase64: jest.fn().mockResolvedValue('unused-base64') },
      nativeRecorder: createNativeAdapter(session),
      temporaryAudio: cleanup,
    });

    await controller.start();
    await controller.cancel();

    expect(session.stop).toHaveBeenCalledTimes(1);
    expect(cleanup.cleanup).toHaveBeenCalledWith({ uri: 'file:///tmp/recording.m4a' });
    expect(controller.getState()).toEqual({ status: 'idle' });
  });

  it('serializes repeated cancel calls while native stop is pending', async () => {
    const stopDeferred = createDeferred<{
      readonly durationMs: number;
      readonly uri: string;
    }>();
    const session: NativeAudioRecordingSession = {
      getTemporaryFileReference: jest.fn(() => ({ uri: 'file:///tmp/repeated-cancel.m4a' })),
      stop: jest.fn().mockReturnValue(stopDeferred.promise),
    };
    const cleanup = {
      cleanup: jest.fn().mockResolvedValue(undefined),
    };
    const controller = createAudioRecordingController({
      audioFileReader: { readBase64: jest.fn().mockResolvedValue('unused-repeated-cancel') },
      nativeRecorder: createNativeAdapter(session),
      temporaryAudio: cleanup,
    });

    await controller.start();
    const firstCancel = controller.cancel();
    const secondCancel = controller.cancel();

    stopDeferred.resolve({
      durationMs: 1200,
      uri: 'file:///tmp/repeated-cancel.m4a',
    });

    await Promise.all([firstCancel, secondCancel]);

    expect(session.stop).toHaveBeenCalledTimes(1);
    expect(cleanup.cleanup).toHaveBeenCalledWith({
      uri: 'file:///tmp/repeated-cancel.m4a',
    });
    expect(controller.getState()).toEqual({ status: 'idle' });
  });

  it('does not call native stop twice when stop is requested during cancel', async () => {
    const stopDeferred = createDeferred<{
      readonly durationMs: number;
      readonly uri: string;
    }>();
    const session: NativeAudioRecordingSession = {
      getTemporaryFileReference: jest.fn(() => ({ uri: 'file:///tmp/cancel-then-stop.m4a' })),
      stop: jest.fn().mockReturnValue(stopDeferred.promise),
    };
    const cleanup = {
      cleanup: jest.fn().mockResolvedValue(undefined),
    };
    const controller = createAudioRecordingController({
      audioFileReader: { readBase64: jest.fn().mockResolvedValue('cancel-then-stop-base64') },
      nativeRecorder: createNativeAdapter(session),
      temporaryAudio: cleanup,
    });

    await controller.start();
    const cancelPromise = controller.cancel();
    const stopPromise = controller.stop().catch((error: unknown) => error);

    stopDeferred.resolve({
      durationMs: 1300,
      uri: 'file:///tmp/cancel-then-stop.m4a',
    });

    await Promise.all([cancelPromise, stopPromise]);

    expect(session.stop).toHaveBeenCalledTimes(1);
    expect(cleanup.cleanup).toHaveBeenCalledWith({
      uri: 'file:///tmp/cancel-then-stop.m4a',
    });
    expect(controller.getState()).toEqual({ status: 'idle' });
  });

  it('cancels during an in-flight stop by cleaning the stopped audio and staying idle', async () => {
    const stopDeferred = createDeferred<{
      readonly durationMs: number;
      readonly uri: string;
    }>();
    const readDeferred = createDeferred<string>();
    const session: NativeAudioRecordingSession = {
      getTemporaryFileReference: jest.fn(() => ({ uri: 'file:///tmp/cancel-during-stop.m4a' })),
      stop: jest.fn().mockReturnValue(stopDeferred.promise),
    };
    const cleanup = {
      cleanup: jest.fn().mockResolvedValue(undefined),
    };
    const controller = createAudioRecordingController({
      audioFileReader: { readBase64: jest.fn().mockReturnValue(readDeferred.promise) },
      nativeRecorder: createNativeAdapter(session),
      temporaryAudio: cleanup,
    });

    await controller.start();
    const stopPromise = controller.stop();
    const cancelPromise = controller.cancel();

    stopDeferred.resolve({
      durationMs: 987,
      uri: 'file:///tmp/cancel-during-stop.m4a',
    });
    readDeferred.resolve('cancel-during-stop-base64');

    await Promise.all([stopPromise, cancelPromise]);

    expect(cleanup.cleanup).toHaveBeenCalledWith({
      uri: 'file:///tmp/cancel-during-stop.m4a',
    });
    expect(controller.getState()).toEqual({ status: 'idle' });
  });

  it('suppresses processing completion state after cancellation', async () => {
    const processorDeferred = createDeferred<void>();
    const cleanup = {
      cleanup: jest.fn().mockResolvedValue(undefined),
    };
    const controller = createAudioRecordingController({
      audioFileReader: { readBase64: jest.fn().mockResolvedValue('processing-cancel-base64') },
      nativeRecorder: createNativeAdapter(
        createSession({ uri: 'file:///tmp/processing-cancel.m4a' }),
      ),
      temporaryAudio: cleanup,
    });

    await controller.start();
    await controller.stop();
    const processingPromise = controller.processStoppedAudio(async () => {
      await processorDeferred.promise;
    });
    const cancelPromise = controller.cancel();

    processorDeferred.resolve();
    await Promise.all([processingPromise, cancelPromise]);

    expect(cleanup.cleanup).toHaveBeenCalledWith({
      uri: 'file:///tmp/processing-cancel.m4a',
    });
    expect(controller.getState()).toEqual({ status: 'idle' });
  });

  it('cleans temporary audio and preserves the primary error for unrecoverable failures', async () => {
    const primaryError = new Error('mock result creation failed');
    const audio: FlowAudioInput = {
      uri: 'file:///tmp/unrecoverable.m4a',
      base64Audio: 'unrecoverable-base64',
      format: 'm4a',
    };
    const cleanup = {
      cleanup: jest.fn().mockResolvedValue(undefined),
    };
    const controller = createAudioRecordingController({
      audioFileReader: { readBase64: jest.fn().mockResolvedValue(audio.base64Audio) },
      nativeRecorder: createNativeAdapter(createSession({ uri: audio.uri })),
      temporaryAudio: cleanup,
    });

    await controller.start();
    await controller.stop();

    await expect(
      controller.processStoppedAudio(async () => {
        throw primaryError;
      }),
    ).rejects.toBe(primaryError);

    expect(cleanup.cleanup).toHaveBeenCalledWith({ uri: 'file:///tmp/unrecoverable.m4a' });
    expect(controller.getState()).toMatchObject({
      error: primaryError,
      status: 'failed',
    });
  });
});
