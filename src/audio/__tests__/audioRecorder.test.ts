import type { FlowAudioInput } from '../../flows/types';
import {
  createAudioRecordingController,
  createExpoAudioRecorderAdapter,
  type AudioRecorderNativeAdapter,
  type AudioRecordingControllerTimer,
  type NativeAudioRecordingSession,
} from '../audioRecorder';

const mockExpoRecorder = {
  getStatus: jest.fn(() => ({
    durationMillis: 1000,
    url: 'file:///tmp/expo-recording.m4a',
  })),
  prepareToRecordAsync: jest.fn().mockResolvedValue(undefined),
  record: jest.fn(),
  stop: jest.fn().mockResolvedValue(undefined),
  uri: 'file:///tmp/expo-recording.m4a',
};
const mockExpoAudioRecorderConstructor = jest.fn(() => mockExpoRecorder);
const mockRequestRecordingPermissionsAsync = jest.fn().mockResolvedValue({ granted: true });
const mockSetAudioModeAsync = jest.fn().mockResolvedValue(undefined);
const mockRecordingPreset = {
  android: {
    audioEncoder: 'aac',
    outputFormat: 'mpeg4',
  },
  bitRate: 128000,
  extension: '.m4a',
  ios: {
    audioQuality: 127,
    outputFormat: 'aac ',
  },
  numberOfChannels: 2,
  sampleRate: 44100,
  web: {
    bitsPerSecond: 128000,
    mimeType: 'audio/mp4',
  },
};

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

  it('lets the controller own the duration cap instead of passing forDuration to Expo', async () => {
    const adapter = createExpoAudioRecorderAdapter({
      AudioModule: {
        AudioRecorder: mockExpoAudioRecorderConstructor,
      },
      RecordingPresets: {
        HIGH_QUALITY: mockRecordingPreset,
      },
      requestRecordingPermissionsAsync: mockRequestRecordingPermissionsAsync,
      setAudioModeAsync: mockSetAudioModeAsync,
    });

    await adapter.startRecording();

    expect(mockExpoRecorder.record).toHaveBeenCalledWith();
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
