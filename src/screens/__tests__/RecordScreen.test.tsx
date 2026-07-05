import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import {
  createAudioRecordingController,
  type AudioRecorderNativeAdapter,
  AudioRecordingController,
  type AudioRecordingControllerTimer,
  AudioRecordingState,
  type NativeAudioRecordingSession,
} from '../../audio/audioRecorder';
import RecordScreen from '../RecordScreen';

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
  readonly clearTimeout: jest.Mock;
  readonly setTimeout: jest.Mock;
  fireNext: () => Promise<void>;
} {
  const callbacks = new Map<number, () => void>();
  let nextId = 1;

  return {
    clearTimeout: jest.fn((id: number) => {
      callbacks.delete(id);
    }),
    setTimeout: jest.fn((callback: () => void, _delayMs: number) => {
      const id = nextId;
      nextId += 1;
      callbacks.set(id, callback);
      return id;
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

function createNativeSession(input: {
  readonly durationMs?: number;
  readonly uri?: string;
} = {}): NativeAudioRecordingSession {
  const uri = input.uri ?? 'file:///tmp/screen-recording.m4a';

  return {
    getTemporaryFileReference: jest.fn(() => ({ uri })),
    stop: jest.fn().mockResolvedValue({
      durationMs: input.durationMs ?? 1800,
      uri,
    }),
  };
}

function createNativeAdapter(session: NativeAudioRecordingSession): AudioRecorderNativeAdapter {
  return {
    requestRecordingPermission: jest.fn().mockResolvedValue({ granted: true }),
    startRecording: jest.fn().mockResolvedValue(session),
  };
}

function createInjectedRecordingController(input: {
  readonly startError?: Error;
} = {}): AudioRecordingController & {
  readonly start: jest.Mock;
  readonly stop: jest.Mock;
  readonly processStoppedAudio: jest.Mock;
} {
  const listeners = new Set<(state: AudioRecordingState) => void>();
  const audio = {
    uri: 'file:///tmp/screen-recording.m4a',
    base64Audio: 'screen-base64-audio',
    format: 'm4a' as const,
    durationMs: 1800,
  };
  let state: AudioRecordingState = { status: 'idle' };

  function setState(nextState: AudioRecordingState) {
    state = nextState;
    listeners.forEach((listener) => listener(state));
  }

  return {
    cancel: jest.fn(async () => {
      setState({ status: 'idle' });
    }),
    getState: () => state,
    processStoppedAudio: jest.fn(async (processor: (recordedAudio: typeof audio) => Promise<void>) => {
      setState({ audio, status: 'processing' });
      await processor(audio);
      setState({ status: 'stopped' });
    }),
    start: jest.fn(async () => {
      setState({ status: 'requesting_permission' });
      if (input.startError) {
        setState({ error: input.startError, status: 'failed' });
        throw input.startError;
      }

      setState({ status: 'recording' });
    }),
    stop: jest.fn(async () => {
      setState({ status: 'stopping' });
      setState({ audio, status: 'stopped' });
      return audio;
    }),
    subscribe: (listener: (nextState: AudioRecordingState) => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

describe('RecordScreen', () => {
  it('starts in transcribe mode with cleanup wording and a large tap-to-record control', () => {
    render(<RecordScreen />);

    expect(screen.getByRole('button', { name: 'Transcribe' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Translate' })).toBeTruthy();
    expect(screen.getByText('Light cleanup on')).toBeTruthy();
    expect(screen.getByText('Tap to record')).toBeTruthy();
    expect(screen.getByText('60 second max')).toBeTruthy();
    expect(screen.queryByPlaceholderText('Type or paste text to translate')).toBeNull();
  });

  it('disables the recording control while microphone permission is pending', async () => {
    const permissionDeferred = createDeferred<{ readonly granted: boolean }>();
    const nativeRecorder: AudioRecorderNativeAdapter = {
      requestRecordingPermission: jest.fn().mockReturnValue(permissionDeferred.promise),
      startRecording: jest.fn(),
    };
    const recordingController = createAudioRecordingController({
      audioFileReader: { readBase64: jest.fn() },
      nativeRecorder,
      temporaryAudio: { cleanup: jest.fn() },
    });

    render(<RecordScreen recordingController={recordingController} />);

    fireEvent.press(screen.getByRole('button', { name: 'Tap to record' }));

    const busyButton = await screen.findByRole('button', { name: 'Preparing recorder' });
    expect(busyButton.props.accessibilityState).toMatchObject({ disabled: true });

    fireEvent.press(busyButton);
    expect(nativeRecorder.requestRecordingPermission).toHaveBeenCalledTimes(1);

    permissionDeferred.resolve({ granted: false });
    expect(await screen.findByText('Microphone permission is required to record.')).toBeTruthy();
  });

  it('shows manual input and a target language selector in translate mode', () => {
    render(<RecordScreen />);

    fireEvent.press(screen.getByRole('button', { name: 'Translate' }));

    expect(screen.getByPlaceholderText('Type or paste text to translate')).toBeTruthy();
    expect(screen.getByText('Target language')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Spanish' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Translate text' })).toBeTruthy();
  });

  it('shows warm active recording treatment before producing an editable saved result', async () => {
    const recordingController = createInjectedRecordingController();

    render(<RecordScreen recordingController={recordingController} />);

    fireEvent.press(screen.getByRole('button', { name: 'Tap to record' }));

    await waitFor(() => {
      expect(recordingController.start).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByText('Recording in progress')).toBeTruthy();
    expect(screen.getByText('00:00 / 60s max')).toBeTruthy();
    expect(screen.getByLabelText('Mock audio waveform')).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByTestId('recording-panel').props.style)).toMatchObject({
      backgroundColor: '#FFF7ED',
      borderColor: '#FDBA74',
    });

    fireEvent.press(screen.getByRole('button', { name: 'Stop recording' }));

    await waitFor(() => {
      expect(recordingController.stop).toHaveBeenCalledTimes(1);
      expect(recordingController.processStoppedAudio).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByText('Saved to history')).toBeTruthy();
    expect(screen.getByText('Copy')).toBeTruthy();
    expect(screen.getByText('Share')).toBeTruthy();
    expect(screen.getByText('Tags')).toBeTruthy();

    const resultEditor = screen.getByTestId('result-editor');
    expect(resultEditor.props.value).toContain('Cleaned transcript');

    fireEvent.changeText(resultEditor, 'Edited transcript text');

    expect(screen.getByTestId('result-editor').props.value).toBe('Edited transcript text');
  });

  it('processes a max-duration stopped recording into a result and cleans up without another tap', async () => {
    const timer = createManualTimer();
    const cleanup = {
      cleanup: jest.fn().mockResolvedValue(undefined),
    };
    const recordingController = createAudioRecordingController({
      audioFileReader: { readBase64: jest.fn().mockResolvedValue('screen-capped-base64') },
      nativeRecorder: createNativeAdapter(
        createNativeSession({
          durationMs: 60000,
          uri: 'file:///tmp/screen-capped-recording.m4a',
        }),
      ),
      temporaryAudio: cleanup,
      timer,
    });

    render(<RecordScreen recordingController={recordingController} />);

    fireEvent.press(screen.getByRole('button', { name: 'Tap to record' }));

    await waitFor(() => {
      expect(screen.getByText('Recording in progress')).toBeTruthy();
    });

    await act(async () => {
      await timer.fireNext();
    });

    expect(await screen.findByText('Saved to history')).toBeTruthy();
    expect(screen.getByTestId('result-editor').props.value).toContain('Cleaned transcript');
    expect(screen.getByText('Tap to record')).toBeTruthy();
    expect(cleanup.cleanup).toHaveBeenCalledWith({
      uri: 'file:///tmp/screen-capped-recording.m4a',
    });
  });

  it('shows a recorder failure cue without creating a result', async () => {
    const recordingController = createInjectedRecordingController({
      startError: Object.assign(new Error('Microphone permission is required to record.'), {
        code: 'permission_denied',
      }),
    });

    render(<RecordScreen recordingController={recordingController} />);

    fireEvent.press(screen.getByRole('button', { name: 'Tap to record' }));

    expect(await screen.findByText('Microphone permission is required to record.')).toBeTruthy();
    expect(screen.queryByText('Saved to history')).toBeNull();
  });

  it('creates a mocked translation result with emphasized translated output and original text', () => {
    render(<RecordScreen />);

    fireEvent.press(screen.getByRole('button', { name: 'Translate' }));
    fireEvent.changeText(
      screen.getByPlaceholderText('Type or paste text to translate'),
      'Meet me at the office at noon.',
    );
    fireEvent.press(screen.getByRole('button', { name: 'Translate text' }));

    expect(screen.getByText('Translated output')).toBeTruthy();
    expect(screen.getByTestId('result-editor').props.value).toContain('Spanish translation');
    expect(screen.getByText('Original text')).toBeTruthy();
    expect(screen.getByText('Meet me at the office at noon.')).toBeTruthy();
    expect(screen.getByText('Saved to history')).toBeTruthy();
  });
});
