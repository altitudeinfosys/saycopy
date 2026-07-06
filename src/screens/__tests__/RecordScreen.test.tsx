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
import { createAppError } from '../../domain/errors';
import type { HistoryItem } from '../../domain/history';
import type { FlowTextResult, TranscriptionProvider, TranslationProvider } from '../../flows/types';
import {
  createRecordFlowProcessors as createRuntimeRecordFlowProcessors,
  type RecordFlowProcessors,
} from '../../runtime/appDependencies';
import type {
  CreateHistoryItemInput,
  HistoryRepository,
} from '../../storage/sqlite/historyRepository';
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

function createScreenRecordFlowProcessors(
  overrides: Partial<RecordFlowProcessors> = {},
): RecordFlowProcessors {
  const runTranscription: jest.MockedFunction<RecordFlowProcessors['runTranscription']> = jest.fn<
    ReturnType<RecordFlowProcessors['runTranscription']>,
    Parameters<RecordFlowProcessors['runTranscription']>
  >(async () => ({
    status: 'success',
    transcript: 'Live cleaned transcript from OpenRouter.',
    historyItem: {
      id: 'record-screen-transcript',
      mode: 'transcribe',
      sourceType: 'voice',
      sourceLanguageId: 'auto',
      transcript: 'Live cleaned transcript from OpenRouter.',
      createdAt: '2026-07-05T18:30:00.000Z',
      updatedAt: '2026-07-05T18:30:00.000Z',
    },
  }));
  const runTranslation: jest.MockedFunction<RecordFlowProcessors['runTranslation']> = jest.fn<
    ReturnType<RecordFlowProcessors['runTranslation']>,
    Parameters<RecordFlowProcessors['runTranslation']>
  >(async (input) => {
    const sourceText = input.sourceType === 'manual' ? input.text : 'Recorded source text.';

    return {
      status: 'success',
      sourceType: input.sourceType,
      sourceText,
      translatedText: 'Live translated text.',
      primaryText: 'Live translated text.',
      historyItem: {
        id: 'record-screen-translation',
        mode: 'translate',
        sourceType: input.sourceType,
        sourceLanguageId: input.sourceLanguageId,
        targetLanguageId: input.targetLanguageId,
        transcript: sourceText,
        translatedText: 'Live translated text.',
        createdAt: '2026-07-05T18:31:00.000Z',
        updatedAt: '2026-07-05T18:31:00.000Z',
      },
    };
  });

  return {
    runTranscription,
    runTranslation,
    ...overrides,
  };
}

function createHistoryItemFromInput(input: CreateHistoryItemInput): HistoryItem {
  const timestamp = '2026-07-05T18:40:00.000Z';

  if (input.mode === 'translate') {
    return {
      id: 'history-translation',
      mode: 'translate',
      sourceType: input.sourceType ?? 'manual',
      sourceLanguageId: input.sourceLanguageId ?? 'auto',
      targetLanguageId: input.targetLanguageId ?? 'spanish',
      transcript: input.sourceText ?? '',
      translatedText: input.translatedText ?? input.primaryText,
      createdAt: timestamp,
      updatedAt: timestamp,
      tags: [],
    };
  }

  return {
    id: 'history-transcription',
    mode: 'transcribe',
    sourceType: input.sourceType ?? 'voice',
    sourceLanguageId: input.sourceLanguageId ?? 'auto',
    transcript: input.primaryText,
    createdAt: timestamp,
    updatedAt: timestamp,
    tags: [],
  };
}

function createHistoryRepositoryMock(): HistoryRepository {
  return {
    createHistoryItem: jest.fn(async (input) => createHistoryItemFromInput(input)),
    getHistoryItem: jest.fn(async () => null),
    listHistoryItems: jest.fn(async () => []),
    updateHistoryText: jest.fn(async () => null),
    deleteHistoryItem: jest.fn(async () => undefined),
    deleteAllHistoryItems: jest.fn(async () => undefined),
    createTag: jest.fn(async (name: string) => ({ id: `tag-${name}`, label: name })),
    findTag: jest.fn(async () => null),
    assignTag: jest.fn(async (historyItemId: string, tagName: string) => ({
      id: `${historyItemId}-${tagName}`,
      label: tagName,
    })),
    removeTag: jest.fn(async () => undefined),
    searchHistory: jest.fn(async () => []),
  };
}

function createProviderMock(
  overrides: Partial<TranscriptionProvider & TranslationProvider> = {},
): TranscriptionProvider & TranslationProvider {
  return {
    cleanupTranscript: jest.fn(async () => {
      throw new Error('Unexpected cleanupTranscript call');
    }),
    transcribeAudio: jest.fn(async () => {
      throw new Error('Unexpected transcribeAudio call');
    }),
    translateText: jest.fn(async () => {
      throw new Error('Unexpected translateText call');
    }),
    ...overrides,
  };
}

async function flushMicrotasks(count = 5): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await Promise.resolve();
  }
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
    const recordFlowProcessors = createScreenRecordFlowProcessors();

    render(
      <RecordScreen
        recordFlowProcessors={recordFlowProcessors}
        recordingController={recordingController}
      />,
    );

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

    expect(recordFlowProcessors.runTranscription).toHaveBeenCalledWith(
      {
        audio: {
          uri: 'file:///tmp/screen-recording.m4a',
          base64Audio: 'screen-base64-audio',
          format: 'm4a',
          durationMs: 1800,
        },
        sourceLanguageId: 'auto',
        modelPresetId: 'balanced',
        cleanupEnabled: true,
      },
      { isCurrent: expect.any(Function) },
    );
    expect(screen.getByText('Saved to history')).toBeTruthy();
    expect(screen.getByText('Copy')).toBeTruthy();
    expect(screen.getByText('Share')).toBeTruthy();
    expect(screen.getByText('Tags')).toBeTruthy();

    const resultEditor = screen.getByTestId('result-editor');
    expect(resultEditor.props.value).toContain('Live cleaned transcript');

    fireEvent.changeText(resultEditor, 'Edited transcript text');

    expect(screen.getByTestId('result-editor').props.value).toBe('Edited transcript text');
  });

  it('processes a max-duration stopped recording into a result and cleans up without another tap', async () => {
    const timer = createManualTimer();
    const recordFlowProcessors = createScreenRecordFlowProcessors();
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

    render(
      <RecordScreen
        recordFlowProcessors={recordFlowProcessors}
        recordingController={recordingController}
      />,
    );

    fireEvent.press(screen.getByRole('button', { name: 'Tap to record' }));

    await waitFor(() => {
      expect(screen.getByText('Recording in progress')).toBeTruthy();
    });

    await act(async () => {
      await timer.fireNext();
    });

    expect(await screen.findByText('Saved to history')).toBeTruthy();
    expect(screen.getByTestId('result-editor').props.value).toContain('Live cleaned transcript');
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

  it('creates a live manual translation result with emphasized translated output and original text', async () => {
    const recordFlowProcessors = createScreenRecordFlowProcessors();

    render(<RecordScreen recordFlowProcessors={recordFlowProcessors} />);

    fireEvent.press(screen.getByRole('button', { name: 'Translate' }));
    fireEvent.changeText(
      screen.getByPlaceholderText('Type or paste text to translate'),
      'Meet me at the office at noon.',
    );
    fireEvent.press(screen.getByRole('button', { name: 'Translate text' }));

    await waitFor(() => {
      expect(recordFlowProcessors.runTranslation).toHaveBeenCalledWith(
        {
          sourceType: 'manual',
          text: 'Meet me at the office at noon.',
          sourceLanguageId: 'auto',
          targetLanguageId: 'spanish',
          modelPresetId: 'balanced',
        },
        { isCurrent: expect.any(Function) },
      );
      expect(screen.getByText('Translated output')).toBeTruthy();
    });
    expect(screen.getByTestId('result-editor').props.value).toContain('Live translated text');
    expect(screen.getByText('Original text')).toBeTruthy();
    expect(screen.getByText('Meet me at the office at noon.')).toBeTruthy();
    expect(screen.getByText('Saved to history')).toBeTruthy();
  });

  it('surfaces missing token errors without saving manual translation history', async () => {
    const missingTokenError = createAppError('missing_token', 'OpenRouter API token is required.', {
      provider: 'openrouter',
      retryable: false,
    });
    const recordFlowProcessors = createScreenRecordFlowProcessors({
      runTranslation: jest.fn().mockRejectedValue(missingTokenError),
    });

    render(<RecordScreen recordFlowProcessors={recordFlowProcessors} />);

    fireEvent.press(screen.getByRole('button', { name: 'Translate' }));
    fireEvent.changeText(screen.getByPlaceholderText('Type or paste text to translate'), 'Hello.');
    fireEvent.press(screen.getByRole('button', { name: 'Translate text' }));

    expect(await screen.findByText('OpenRouter API token is required.')).toBeTruthy();
    expect(screen.queryByText('Saved to history')).toBeNull();
    expect(screen.queryByTestId('result-editor')).toBeNull();
  });

  it('does not save or show stale manual translation after mode changes before provider resolves', async () => {
    const translationDeferred = createDeferred<FlowTextResult>();
    const historyRepository = createHistoryRepositoryMock();
    const provider = createProviderMock({
      translateText: jest.fn(() => translationDeferred.promise),
    });
    const recordFlowProcessors = createRuntimeRecordFlowProcessors({
      historyRepository,
      provider,
    });

    render(<RecordScreen recordFlowProcessors={recordFlowProcessors} />);

    fireEvent.press(screen.getByRole('button', { name: 'Translate' }));
    fireEvent.changeText(screen.getByPlaceholderText('Type or paste text to translate'), 'Hello.');
    fireEvent.press(screen.getByRole('button', { name: 'Translate text' }));

    await waitFor(() => {
      expect(provider.translateText).toHaveBeenCalledTimes(1);
    });

    fireEvent.press(screen.getByRole('button', { name: 'Transcribe' }));

    await act(async () => {
      translationDeferred.resolve({
        text: 'Stale translated text.',
        modelId: 'openai/gpt-4.1-mini',
      });
      await translationDeferred.promise;
      await flushMicrotasks();
    });

    expect(historyRepository.createHistoryItem).not.toHaveBeenCalled();
    expect(screen.queryByText('Saved to history')).toBeNull();
    expect(screen.queryByTestId('result-editor')).toBeNull();
  });

  it('does not save or show stale voice transcription after reset before history save', async () => {
    const cleanupDeferred = createDeferred<FlowTextResult>();
    const recordingController = createInjectedRecordingController();
    const historyRepository = createHistoryRepositoryMock();
    const provider = createProviderMock({
      transcribeAudio: jest.fn(async () => ({
        text: 'raw stale transcript',
        modelId: 'openai/whisper-large-v3',
      })),
      cleanupTranscript: jest.fn(() => cleanupDeferred.promise),
    });
    const recordFlowProcessors = createRuntimeRecordFlowProcessors({
      historyRepository,
      provider,
    });

    render(
      <RecordScreen
        recordFlowProcessors={recordFlowProcessors}
        recordingController={recordingController}
      />,
    );

    fireEvent.press(screen.getByRole('button', { name: 'Tap to record' }));
    await waitFor(() => {
      expect(recordingController.start).toHaveBeenCalledTimes(1);
    });

    fireEvent.press(screen.getByRole('button', { name: 'Stop recording' }));
    await waitFor(() => {
      expect(provider.cleanupTranscript).toHaveBeenCalledTimes(1);
    });

    fireEvent.press(screen.getByRole('button', { name: 'Translate' }));

    await act(async () => {
      cleanupDeferred.resolve({
        text: 'Stale cleaned transcript.',
        modelId: 'openai/gpt-4.1-mini',
      });
      await cleanupDeferred.promise;
      await flushMicrotasks();
    });

    expect(historyRepository.createHistoryItem).not.toHaveBeenCalled();
    expect(screen.queryByText('Saved to history')).toBeNull();
    expect(screen.queryByTestId('result-editor')).toBeNull();
  });

  it('does not save or show stale voice translation after reset before history save', async () => {
    const translationDeferred = createDeferred<FlowTextResult>();
    const recordingController = createInjectedRecordingController();
    const historyRepository = createHistoryRepositoryMock();
    const provider = createProviderMock({
      transcribeAudio: jest.fn(async () => ({
        text: 'voice source text',
        modelId: 'openai/whisper-large-v3',
      })),
      translateText: jest.fn(() => translationDeferred.promise),
    });
    const recordFlowProcessors = createRuntimeRecordFlowProcessors({
      historyRepository,
      provider,
    });

    render(
      <RecordScreen
        recordFlowProcessors={recordFlowProcessors}
        recordingController={recordingController}
      />,
    );

    fireEvent.press(screen.getByRole('button', { name: 'Translate' }));
    fireEvent.press(screen.getByRole('button', { name: 'Tap to record' }));
    await waitFor(() => {
      expect(recordingController.start).toHaveBeenCalledTimes(1);
    });

    fireEvent.press(screen.getByRole('button', { name: 'Stop recording' }));
    await waitFor(() => {
      expect(provider.translateText).toHaveBeenCalledTimes(1);
    });

    fireEvent.press(screen.getByRole('button', { name: 'Transcribe' }));

    await act(async () => {
      translationDeferred.resolve({
        text: 'Stale voice translation.',
        modelId: 'openai/gpt-4.1-mini',
      });
      await translationDeferred.promise;
      await flushMicrotasks();
    });

    expect(historyRepository.createHistoryItem).not.toHaveBeenCalled();
    expect(screen.queryByText('Saved to history')).toBeNull();
    expect(screen.queryByTestId('result-editor')).toBeNull();
  });

  it('cancels stale voice processing silently when a manual translation starts in translate mode', async () => {
    const staleVoiceTranslationDeferred = createDeferred<FlowTextResult>();
    const currentManualTranslationDeferred = createDeferred<FlowTextResult>();
    const historyRepository = createHistoryRepositoryMock();
    const translateText = jest.fn((input) =>
      input.text === 'voice source text'
        ? staleVoiceTranslationDeferred.promise
        : currentManualTranslationDeferred.promise,
    );
    const provider = createProviderMock({
      transcribeAudio: jest.fn(async () => ({
        text: 'voice source text',
        modelId: 'openai/whisper-large-v3',
      })),
      translateText,
    });
    const recordingController = createAudioRecordingController({
      audioFileReader: { readBase64: jest.fn().mockResolvedValue('voice-translation-base64') },
      nativeRecorder: createNativeAdapter(
        createNativeSession({
          uri: 'file:///tmp/voice-translation-cancelled.m4a',
        }),
      ),
      temporaryAudio: { cleanup: jest.fn().mockResolvedValue(undefined) },
    });
    const recordFlowProcessors = createRuntimeRecordFlowProcessors({
      historyRepository,
      provider,
    });

    render(
      <RecordScreen
        recordFlowProcessors={recordFlowProcessors}
        recordingController={recordingController}
      />,
    );

    fireEvent.press(screen.getByRole('button', { name: 'Translate' }));
    fireEvent.press(screen.getByRole('button', { name: 'Tap to record' }));

    await waitFor(() => {
      expect(screen.getByText('Recording in progress')).toBeTruthy();
    });

    fireEvent.press(screen.getByRole('button', { name: 'Stop recording' }));

    await waitFor(() => {
      expect(translateText).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'voice source text' }),
      );
    });

    fireEvent.changeText(screen.getByPlaceholderText('Type or paste text to translate'), 'Manual now.');
    fireEvent.press(screen.getByRole('button', { name: 'Translate text' }));

    await waitFor(() => {
      expect(translateText).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'Manual now.' }),
      );
    });

    await act(async () => {
      staleVoiceTranslationDeferred.resolve({
        text: 'Stale voice translated text.',
        modelId: 'openai/gpt-4.1-mini',
      });
      await staleVoiceTranslationDeferred.promise;
      await flushMicrotasks();
    });

    expect(screen.queryByText('OpenRouter operation was cancelled.')).toBeNull();
    expect(historyRepository.createHistoryItem).not.toHaveBeenCalled();
    expect(screen.queryByText('Saved to history')).toBeNull();
  });

  it('clears pending manual translation state immediately when recording starts', async () => {
    const currentManualTranslationDeferred = createDeferred<FlowTextResult>();
    const recordingController = createInjectedRecordingController();
    const recordFlowProcessors = createRuntimeRecordFlowProcessors({
      historyRepository: createHistoryRepositoryMock(),
      provider: createProviderMock({
        translateText: jest.fn(() => currentManualTranslationDeferred.promise),
      }),
    });

    render(
      <RecordScreen
        recordFlowProcessors={recordFlowProcessors}
        recordingController={recordingController}
      />,
    );

    fireEvent.press(screen.getByRole('button', { name: 'Translate' }));
    fireEvent.changeText(screen.getByPlaceholderText('Type or paste text to translate'), 'Manual now.');
    fireEvent.press(screen.getByRole('button', { name: 'Translate text' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Translating' }).props.accessibilityState).toMatchObject({
        disabled: true,
      });
    });

    fireEvent.press(screen.getByRole('button', { name: 'Tap to record' }));

    await waitFor(() => {
      expect(recordingController.start).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: 'Translate text' }).props.accessibilityState).toMatchObject({
        disabled: false,
      });
    });
  });

  it('still saves and displays current manual translation results', async () => {
    const historyRepository = createHistoryRepositoryMock();
    const provider = createProviderMock({
      translateText: jest.fn(async () => ({
        text: 'Current translated text.',
        modelId: 'openai/gpt-4.1-mini',
      })),
    });
    const recordFlowProcessors = createRuntimeRecordFlowProcessors({
      historyRepository,
      provider,
    });

    render(<RecordScreen recordFlowProcessors={recordFlowProcessors} />);

    fireEvent.press(screen.getByRole('button', { name: 'Translate' }));
    fireEvent.changeText(screen.getByPlaceholderText('Type or paste text to translate'), 'Hello.');
    fireEvent.press(screen.getByRole('button', { name: 'Translate text' }));

    expect(await screen.findByText('Saved to history')).toBeTruthy();
    expect(screen.getByTestId('result-editor').props.value).toBe('Current translated text.');
    expect(historyRepository.createHistoryItem).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'translate',
        sourceType: 'manual',
        primaryText: 'Current translated text.',
        sourceText: 'Hello.',
        translatedText: 'Current translated text.',
      }),
    );
  });
});
