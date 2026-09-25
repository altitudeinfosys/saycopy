import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactTestInstance } from 'react-test-renderer';
import { ScrollView, StyleSheet } from 'react-native';

import {
  createAudioRecordingController,
  type AudioRecorderNativeAdapter,
  AudioRecordingController,
  type AudioRecordingControllerTimer,
  AudioRecordingState,
  type NativeAudioRecordingSession,
} from '../../audio/audioRecorder';
import { createAppError } from '../../domain/errors';
import type { HistoryItem, Tag } from '../../domain/history';
import type { TranscriptionFlowResult } from '../../flows/transcriptionFlow';
import type { FlowTextResult, TranscriptionProvider, TranslationProvider } from '../../flows/types';
import {
  createRecordFlowProcessors as createRuntimeRecordFlowProcessors,
  type RecordFlowProcessors,
} from '../../runtime/appDependencies';
import {
  createDemoHistoryRepository,
  createDemoSettingsRepository,
} from '../../storage/demoAppRepositories';
import {
  DEFAULT_APP_SETTINGS,
  type AppSettings,
  type SettingsRepository,
} from '../../storage/settingsRepository';
import type {
  CreateHistoryItemInput,
  HistoryRepository,
} from '../../storage/sqlite/historyRepository';
import HistoryScreen from '../HistoryScreen';
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

function createSettingsRepositoryMock(settings: AppSettings): SettingsRepository {
  return createDemoSettingsRepository(settings);
}

function createDeferredSettingsRepository() {
  const settingsDeferred = createDeferred<AppSettings>();
  const settingsRepository: SettingsRepository = {
    getSettings: jest.fn(() => settingsDeferred.promise),
    saveSettings: jest.fn(async () => undefined),
  };

  return { settingsDeferred, settingsRepository };
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

function expectMinimumTouchTarget(instance: ReactTestInstance): void {
  const style = StyleSheet.flatten(instance.props.style);
  const targetHeight =
    typeof style?.minHeight === 'number'
      ? style.minHeight
      : typeof style?.height === 'number'
        ? style.height
        : 0;

  expect(targetHeight).toBeGreaterThanOrEqual(44);
}

function expandRecordingOptions(): void {
  const showOptionsButton = screen.queryByRole('button', { name: 'Show language options' });

  if (showOptionsButton) {
    fireEvent.press(showOptionsButton);
  }
}

async function renderVoiceTranscriptionResult({
  historyRepository,
  recordFlowProcessors = createScreenRecordFlowProcessors(),
  resultActions,
}: {
  readonly historyRepository?: HistoryRepository;
  readonly recordFlowProcessors?: RecordFlowProcessors;
  readonly resultActions?: {
    readonly copyText: jest.Mock;
    readonly shareText: jest.Mock;
  };
} = {}) {
  const recordingController = createInjectedRecordingController();

  render(
    <RecordScreen
      historyRepository={historyRepository}
      recordFlowProcessors={recordFlowProcessors}
      recordingController={recordingController}
      resultActions={resultActions}
    />,
  );

  fireEvent.press(screen.getByRole('button', { name: 'Tap to record' }));
  fireEvent.press(await screen.findByRole('button', { name: 'Stop recording' }));

  await screen.findByText('Transcript');

  return { recordFlowProcessors, recordingController };
}

function createSequentialTranscriptions(texts: readonly string[]) {
  let call = 0;

  return jest.fn(async () => {
    const index = Math.min(call, texts.length - 1);
    call += 1;

    return {
      status: 'success' as const,
      transcript: texts[index],
      historyItem: {
        id: `history-${index + 1}`,
        mode: 'transcribe' as const,
        sourceType: 'voice' as const,
        sourceLanguageId: 'auto' as const,
        transcript: texts[index],
        createdAt: '2026-07-05T18:50:00.000Z',
        updatedAt: '2026-07-05T18:50:00.000Z',
      },
    };
  });
}

describe('RecordScreen', () => {
  it('is transcribe-only with cleanup wording and a large tap-to-record control', () => {
    render(<RecordScreen />);

    expect(screen.getByText('Transcribe')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Translate' })).toBeNull();
    expect(screen.getByText('Light cleanup on')).toBeTruthy();
    expect(screen.getByText('Tap to record')).toBeTruthy();
    expect(screen.getByText('3 min max')).toBeTruthy();
    expectMinimumTouchTarget(screen.getByRole('button', { name: 'Show language options' }));
    expect(screen.getByText('Recording language')).toBeTruthy();
    expect(screen.getByText('Source: Auto-detect')).toBeTruthy();
    expect(screen.queryByText('Source language')).toBeNull();
    expect(screen.queryByText('Model preset')).toBeNull();
    expect(screen.queryByPlaceholderText('Type or paste text to translate')).toBeNull();

    const scrollView = screen.UNSAFE_getByType(ScrollView);
    expect(scrollView.props.keyboardShouldPersistTaps).toBe('handled');
    expect(scrollView.props.automaticallyAdjustKeyboardInsets).toBe(true);
  });

  it('lets users expand transcribe language options without showing model controls', () => {
    render(<RecordScreen />);

    fireEvent.press(screen.getByRole('button', { name: 'Show language options' }));

    expect(screen.getByRole('button', { name: 'Hide language options' })).toBeTruthy();
    expect(screen.getByText('Source language')).toBeTruthy();
    expect(screen.queryByText('To language')).toBeNull();
    expect(screen.queryByText('Model preset')).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: 'Hide language options' }));

    expect(screen.queryByText('Source language')).toBeNull();
    expect(screen.queryByText('Model preset')).toBeNull();
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

  it('uses changed source language for the next voice transcription', async () => {
    const recordingController = createInjectedRecordingController();
    const recordFlowProcessors = createScreenRecordFlowProcessors();

    render(
      <RecordScreen
        recordFlowProcessors={recordFlowProcessors}
        recordingController={recordingController}
      />,
    );

    expandRecordingOptions();
    fireEvent.press(screen.getByRole('button', { name: 'Source language Arabic' }));

    expect(screen.getByText('Source: Arabic')).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Tap to record' }));
    await waitFor(() => {
      expect(recordingController.start).toHaveBeenCalledTimes(1);
    });

    fireEvent.press(screen.getByRole('button', { name: 'Stop recording' }));

    await waitFor(() => {
      expect(recordFlowProcessors.runTranscription).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceLanguageId: 'arabic',
        }),
        { isCurrent: expect.any(Function) },
      );
    });
  });

  it('persists a changed recording language across Record screen remounts', async () => {
    const settingsRepository = createSettingsRepositoryMock({
      ...DEFAULT_APP_SETTINGS,
      sourceLanguageId: 'english',
    });
    const saveSettings = jest.spyOn(settingsRepository, 'saveSettings');
    const firstRender = render(
      <RecordScreen
        recordingController={createInjectedRecordingController()}
        settingsRepository={settingsRepository}
      />,
    );

    await waitFor(() => expect(screen.getByText('Source: English')).toBeTruthy());
    expandRecordingOptions();
    fireEvent.press(screen.getByRole('button', { name: 'Source language Auto-detect' }));

    await waitFor(() => {
      expect(saveSettings).toHaveBeenCalledWith({
        sourceLanguageId: 'auto',
      });
    });

    firstRender.unmount();
    render(
      <RecordScreen
        recordingController={createInjectedRecordingController()}
        settingsRepository={settingsRepository}
      />,
    );

    await waitFor(() => expect(screen.getByText('Source: Auto-detect')).toBeTruthy());
  });

  it('loads saved defaults into Record controls and voice transcription inputs', async () => {
    const recordingController = createInjectedRecordingController();
    const recordFlowProcessors = createScreenRecordFlowProcessors();
    const settingsRepository = createSettingsRepositoryMock({
      sourceLanguageId: 'spanish',
      translateSourceLanguageId: 'auto',
      targetLanguageId: 'arabic',
      modelPresetId: 'fast',
      customModelId: 'google/gemini-2.5-flash',
      transcriptionModelId: 'openai/gpt-4o-transcribe',
      cleanupEnabled: false,
    });

    render(
      <RecordScreen
        recordFlowProcessors={recordFlowProcessors}
        recordingController={recordingController}
        settingsRepository={settingsRepository}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Source: Spanish')).toBeTruthy();
      expect(screen.getByText('Light cleanup off')).toBeTruthy();
    });

    expandRecordingOptions();

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Source language Spanish' }).props.accessibilityState,
      ).toMatchObject({ selected: true });
      expect(screen.queryByText('Model preset')).toBeNull();
    });

    fireEvent.press(screen.getByRole('button', { name: 'Tap to record' }));
    await waitFor(() => {
      expect(recordingController.start).toHaveBeenCalledTimes(1);
    });

    fireEvent.press(screen.getByRole('button', { name: 'Stop recording' }));

    await waitFor(() => {
      expect(recordFlowProcessors.runTranscription).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceLanguageId: 'spanish',
          modelPresetId: 'fast',
          customModelId: 'google/gemini-2.5-flash',
          cleanupEnabled: false,
          transcriptionModelId: 'openai/gpt-4o-transcribe',
        }),
        { isCurrent: expect.any(Function) },
      );
    });
  });

  it('explains the reliable original-language model used for Auto', async () => {
    const settingsRepository = createSettingsRepositoryMock({
      ...DEFAULT_APP_SETTINGS,
      sourceLanguageId: 'auto',
      transcriptionModelId: 'deepgram/nova-3',
    });

    render(
      <RecordScreen
        recordingController={createInjectedRecordingController()}
        settingsRepository={settingsRepository}
      />,
    );

    await waitFor(() => expect(screen.getByText('Source: Auto-detect')).toBeTruthy());
    expandRecordingOptions();

    expect(
      screen.getByText(
        'Auto-detect uses GPT-4o Transcribe to preserve the detected language. Select a language to use deepgram/nova-3 instead.',
      ),
    ).toBeTruthy();
  });

  it('blocks voice recording until saved settings finish loading', async () => {
    const recordingController = createInjectedRecordingController();
    const recordFlowProcessors = createScreenRecordFlowProcessors();
    const { settingsDeferred, settingsRepository } = createDeferredSettingsRepository();

    render(
      <RecordScreen
        recordFlowProcessors={recordFlowProcessors}
        recordingController={recordingController}
        settingsRepository={settingsRepository}
      />,
    );

    expect(screen.getByText('Loading default settings')).toBeTruthy();
    const loadingRecordButton = screen.getByRole('button', { name: 'Loading settings' });
    expect(loadingRecordButton.props.accessibilityState).toMatchObject({ disabled: true });

    fireEvent.press(loadingRecordButton);

    expect(recordingController.start).not.toHaveBeenCalled();
    expect(recordFlowProcessors.runTranscription).not.toHaveBeenCalled();

    await act(async () => {
      settingsDeferred.resolve({
          sourceLanguageId: 'spanish',
        translateSourceLanguageId: 'auto',
        targetLanguageId: 'arabic',
        modelPresetId: 'fast',
        customModelId: 'google/gemini-2.5-flash',
        transcriptionModelId: 'openai/whisper-large-v3',
        cleanupEnabled: false,
      });
      await settingsDeferred.promise;
    });

    expandRecordingOptions();

    await waitFor(() => {
      expect(screen.queryByText('Loading default settings')).toBeNull();
      expect(
        screen.getByRole('button', { name: 'Source language Spanish' }).props.accessibilityState,
      ).toMatchObject({ selected: true });
    });

    fireEvent.press(screen.getByRole('button', { name: 'Tap to record' }));
    await waitFor(() => {
      expect(recordingController.start).toHaveBeenCalledTimes(1);
    });

    fireEvent.press(screen.getByRole('button', { name: 'Stop recording' }));

    await waitFor(() => {
      expect(recordFlowProcessors.runTranscription).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceLanguageId: 'spanish',
          modelPresetId: 'fast',
          customModelId: 'google/gemini-2.5-flash',
          cleanupEnabled: false,
        }),
        { isCurrent: expect.any(Function) },
      );
    });
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
    expect(screen.getByText('00:00 / 3 min max')).toBeTruthy();
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
        customModelId: '',
        cleanupEnabled: true,
      },
      { isCurrent: expect.any(Function) },
    );
    expect(screen.getByText('Saved to history')).toBeTruthy();
    expect(screen.getByText('Record again')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tap to record' })).toBeTruthy();
    expect(screen.getByText('Copy')).toBeTruthy();
    expect(screen.getByText('Share')).toBeTruthy();
    expect(screen.getByText('Tags')).toBeTruthy();

    const resultEditor = screen.getByTestId('result-editor');
    expect(resultEditor.props.value).toContain('Live cleaned transcript');

    fireEvent.changeText(resultEditor, 'Edited transcript text');

    expect(screen.getByTestId('result-editor').props.value).toBe('Edited transcript text');
  });

  it('shows transcription progress until voice processing finishes', async () => {
    const transcriptionDeferred = createDeferred<TranscriptionFlowResult>();
    const recordingController = createInjectedRecordingController();
    const recordFlowProcessors = createScreenRecordFlowProcessors({
      runTranscription: jest.fn(() => transcriptionDeferred.promise),
    });

    render(
      <RecordScreen
        recordFlowProcessors={recordFlowProcessors}
        recordingController={recordingController}
      />,
    );

    fireEvent.press(screen.getByRole('button', { name: 'Tap to record' }));
    await waitFor(() => expect(recordingController.start).toHaveBeenCalledTimes(1));
    fireEvent.press(screen.getByRole('button', { name: 'Stop recording' }));

    expect(await screen.findByLabelText('Transcribing your recording')).toBeTruthy();

    await act(async () => {
      transcriptionDeferred.resolve({
        status: 'success',
        transcript: 'Finished transcript.',
        historyItem: {
          id: 'finished-transcript',
          mode: 'transcribe',
          sourceType: 'voice',
          sourceLanguageId: 'auto',
          transcript: 'Finished transcript.',
          createdAt: '2026-07-11T18:00:00.000Z',
          updatedAt: '2026-07-11T18:00:00.000Z',
        },
      });
      await transcriptionDeferred.promise;
    });

    await waitFor(() => {
      expect(screen.queryByLabelText('Transcribing your recording')).toBeNull();
      expect(screen.getByTestId('result-editor').props.value).toBe('Finished transcript.');
    });
  });

  it('cancels an active recording without sending audio for processing', async () => {
    const recordingController = createInjectedRecordingController();
    const recordFlowProcessors = createScreenRecordFlowProcessors();

    render(
      <RecordScreen
        recordFlowProcessors={recordFlowProcessors}
        recordingController={recordingController}
      />,
    );

    fireEvent.press(screen.getByRole('button', { name: 'Tap to record' }));
    expect(await screen.findByRole('button', { name: 'Cancel recording' })).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Cancel recording' }));

    await waitFor(() => {
      expect(recordingController.cancel).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: 'Tap to record' })).toBeTruthy();
    });
    expect(recordingController.stop).not.toHaveBeenCalled();
    expect(recordingController.processStoppedAudio).not.toHaveBeenCalled();
    expect(recordFlowProcessors.runTranscription).not.toHaveBeenCalled();
  });

  it('updates the active recording timer and waveform while recording', async () => {
    jest.useFakeTimers();

    try {
      const recordingController = createInjectedRecordingController();

      render(<RecordScreen recordingController={recordingController} />);

      fireEvent.press(screen.getByRole('button', { name: 'Tap to record' }));

      await waitFor(() => {
        expect(recordingController.start).toHaveBeenCalledTimes(1);
      });

      expect(screen.getByText('00:00 / 3 min max')).toBeTruthy();
      const initialBarHeight = StyleSheet.flatten(screen.getByTestId('waveform-bar-0').props.style)
        ?.height;

      act(() => {
        jest.advanceTimersByTime(1000);
      });

      expect(screen.getByText('00:01 / 3 min max')).toBeTruthy();
      expect(
        StyleSheet.flatten(screen.getByTestId('waveform-bar-0').props.style)?.height,
      ).not.toBe(initialBarHeight);
    } finally {
      jest.useRealTimers();
    }
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

    const permissionAlert = await screen.findByText('Microphone permission is required to record.');
    expect(permissionAlert.props.accessibilityRole).toBe('alert');
    expect(permissionAlert.props.accessibilityLiveRegion).toBe('assertive');
    expect(screen.queryByText('Saved to history')).toBeNull();
  });

  it.each([
    [
      'missing token',
      createAppError('missing_token', 'OpenRouter API token is required.', {
        provider: 'openrouter',
        retryable: false,
      }),
    ],
    [
      'offline/network failure',
      createAppError('network_unavailable', 'Network connection to OpenRouter failed.', {
        provider: 'openrouter',
        retryable: true,
      }),
    ],
    [
      'provider auth error',
      createAppError('auth_error', 'OpenRouter authentication failed.', {
        provider: 'openrouter',
        retryable: false,
      }),
    ],
    [
      'provider payment error',
      createAppError('payment_required', 'OpenRouter account credits are required.', {
        provider: 'openrouter',
        retryable: false,
      }),
    ],
    [
      'retryable rate limit overload',
      createAppError('rate_limited', 'OpenRouter rate limit was reached. Try again shortly.', {
        provider: 'openrouter',
        retryable: true,
      }),
    ],
    [
      'retryable provider overload',
      createAppError('provider_unavailable', 'OpenRouter is temporarily unavailable.', {
        provider: 'openrouter',
        retryable: true,
      }),
    ],
  ])('surfaces %s as an alert without saving history', async (_label, appError) => {
    const recordFlowProcessors = createScreenRecordFlowProcessors({
      runTranscription: jest.fn().mockRejectedValue(appError),
    });
    const recordingController = createAudioRecordingController({
      audioFileReader: { readBase64: jest.fn().mockResolvedValue('failing-base64') },
      nativeRecorder: createNativeAdapter(createNativeSession()),
    });

    render(
      <RecordScreen
        recordFlowProcessors={recordFlowProcessors}
        recordingController={recordingController}
      />,
    );

    fireEvent.press(screen.getByRole('button', { name: 'Tap to record' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Stop recording' }));

    const alert = await screen.findByText(appError.message);
    expect(alert.props.accessibilityRole).toBe('alert');
    expect(alert.props.accessibilityLiveRegion).toBe('assertive');
    expect(screen.getByRole('button', { name: 'Tap to record' })).toBeTruthy();
    expect(screen.queryByText('Saved to history')).toBeNull();
    expect(screen.queryByTestId('result-editor')).toBeNull();
  });

  it('does not save a stale voice transcription after the screen closes', async () => {
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

    const { unmount } = render(
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

    unmount();

    await act(async () => {
      cleanupDeferred.resolve({
        text: 'Stale cleaned transcript.',
        modelId: 'openai/gpt-4.1-mini',
      });
      await cleanupDeferred.promise;
      await flushMicrotasks();
    });

    expect(historyRepository.createHistoryItem).not.toHaveBeenCalled();
  });

  it('copies the currently edited result text', async () => {
    const copyText = jest.fn().mockResolvedValue(undefined);
    const shareText = jest.fn().mockResolvedValue(undefined);

    await renderVoiceTranscriptionResult({
      resultActions: { copyText, shareText },
    });

    fireEvent.changeText(screen.getByTestId('result-editor'), 'Edited text for clipboard.');
    fireEvent.press(screen.getByRole('button', { name: 'Copy' }));

    await waitFor(() => {
      expect(copyText).toHaveBeenCalledWith('Edited text for clipboard.');
    });
    expect(shareText).not.toHaveBeenCalled();
  });

  it('shares the currently edited result text', async () => {
    const copyText = jest.fn().mockResolvedValue(undefined);
    const shareText = jest.fn().mockResolvedValue(undefined);

    await renderVoiceTranscriptionResult({
      resultActions: { copyText, shareText },
    });

    fireEvent.changeText(screen.getByTestId('result-editor'), 'Edited text for native share.');
    fireEvent.press(screen.getByRole('button', { name: 'Share' }));

    await waitFor(() => {
      expect(shareText).toHaveBeenCalledWith('Edited text for native share.');
    });
    expect(copyText).not.toHaveBeenCalled();
  });

  it('keeps the saved result card visible when edited text becomes empty', async () => {
    await renderVoiceTranscriptionResult();

    fireEvent.changeText(screen.getByTestId('result-editor'), '');

    await waitFor(() => {
      expect(screen.getByTestId('result-editor').props.value).toBe('');
    });
    expect(screen.getByText('Transcript')).toBeTruthy();
  });

  it('persists edited voice transcription text to the saved history preview', async () => {
    const historyRepository = createDemoHistoryRepository();
    const recordingController = createInjectedRecordingController();
    const provider = createProviderMock({
      transcribeAudio: jest.fn(async () => ({
        text: 'Raw transcript for edit.',
        modelId: 'openai/whisper-large-v3',
      })),
      cleanupTranscript: jest.fn(async () => ({
        text: 'Original saved transcript.',
        modelId: 'openai/gpt-4.1-mini',
      })),
    });
    const recordFlowProcessors = createRuntimeRecordFlowProcessors({
      historyRepository,
      provider,
    });

    const { unmount } = render(
      <RecordScreen
        historyRepository={historyRepository}
        recordFlowProcessors={recordFlowProcessors}
        recordingController={recordingController}
      />,
    );

    fireEvent.press(screen.getByRole('button', { name: 'Tap to record' }));
    await waitFor(() => {
      expect(recordingController.start).toHaveBeenCalledTimes(1);
    });
    fireEvent.press(screen.getByRole('button', { name: 'Stop recording' }));

    expect(await screen.findByDisplayValue('Original saved transcript.')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('result-editor'), 'Edited persisted transcript.');

    await waitFor(async () => {
      await expect(historyRepository.listHistoryItems()).resolves.toMatchObject([
        {
          transcript: 'Edited persisted transcript.',
        },
      ]);
    });

    unmount();
    render(<HistoryScreen repository={historyRepository} />);

    expect(await screen.findByText('Edited persisted transcript.')).toBeTruthy();
    expect(screen.queryByText('Original saved transcript.')).toBeNull();
  });

  it('adds result card tags through the shared repository so History can filter by them', async () => {
    const historyRepository = createDemoHistoryRepository();
    const provider = createProviderMock({
      transcribeAudio: jest.fn(async () => ({
        text: 'Shared repository transcript.',
        modelId: 'openai/whisper-large-v3-turbo',
      })),
    });
    const recordFlowProcessors = createRuntimeRecordFlowProcessors({
      historyRepository,
      provider,
    });
    const recordingController = createInjectedRecordingController();

    const { unmount } = render(
      <RecordScreen
        historyRepository={historyRepository}
        recordFlowProcessors={recordFlowProcessors}
        recordingController={recordingController}
      />,
    );

    fireEvent.press(screen.getByRole('button', { name: 'Tap to record' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Stop recording' }));

    expect(await screen.findByText('Transcript')).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Tags' }));
    fireEvent.changeText(screen.getByPlaceholderText('Add a tag'), 'Client');
    fireEvent.press(screen.getByRole('button', { name: 'Add tag' }));

    await waitFor(() => {
      expect(screen.getByText('Client')).toBeTruthy();
    });

    unmount();
    render(<HistoryScreen repository={historyRepository} />);

    expect(await screen.findByRole('button', { name: 'Filter by Client' })).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Filter by Client' }));

    await waitFor(() => {
      expect(screen.getByText('Shared repository transcript.')).toBeTruthy();
    });
  });

  it('shows a tag error without adding the failed tag locally', async () => {
    const historyRepository = createHistoryRepositoryMock();
    (historyRepository.assignTag as jest.Mock).mockRejectedValue(new Error('tag write failed'));

    await renderVoiceTranscriptionResult({ historyRepository });

    fireEvent.press(screen.getByRole('button', { name: 'Tags' }));
    fireEvent.changeText(screen.getByPlaceholderText('Add a tag'), 'Blocked');
    fireEvent.press(screen.getByRole('button', { name: 'Add tag' }));

    expect(await screen.findByText('Could not add tag.')).toBeTruthy();
    expect(screen.queryByText('Blocked')).toBeNull();
  });

  it('ignores stale tag completions after a newer result is visible', async () => {
    const staleTagDeferred = createDeferred<Tag>();
    const historyRepository = createHistoryRepositoryMock();
    (historyRepository.assignTag as jest.Mock).mockReturnValue(staleTagDeferred.promise);
    const recordingController = createInjectedRecordingController();
    const recordFlowProcessors = createScreenRecordFlowProcessors({
      runTranscription: createSequentialTranscriptions(['First visible result.', 'Second visible result.']),
    });

    render(
      <RecordScreen
        historyRepository={historyRepository}
        recordFlowProcessors={recordFlowProcessors}
        recordingController={recordingController}
      />,
    );

    fireEvent.press(screen.getByRole('button', { name: 'Tap to record' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Stop recording' }));

    expect(await screen.findByDisplayValue('First visible result.')).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Tags' }));
    fireEvent.changeText(screen.getByPlaceholderText('Add a tag'), 'Stale tag');
    fireEvent.press(screen.getByRole('button', { name: 'Add tag' }));

    await waitFor(() => {
      expect(historyRepository.assignTag).toHaveBeenCalledWith('history-1', 'Stale tag');
    });

    fireEvent.press(screen.getByRole('button', { name: 'Tap to record' }));

    await waitFor(() => {
      expect(recordingController.start).toHaveBeenCalledTimes(2);
    });

    fireEvent.press(screen.getByRole('button', { name: 'Stop recording' }));

    expect(await screen.findByDisplayValue('Second visible result.')).toBeTruthy();
    expect(screen.queryByPlaceholderText('Add a tag')).toBeNull();

    await act(async () => {
      staleTagDeferred.resolve({ id: 'tag-stale', label: 'Stale tag' });
      await staleTagDeferred.promise;
      await flushMicrotasks();
    });

    expect(screen.queryByText('Stale tag')).toBeNull();
    expect(screen.queryByDisplayValue('Stale tag')).toBeNull();
    expect(screen.queryByText('Could not add tag.')).toBeNull();
    expect(screen.getByTestId('result-editor').props.value).toBe('Second visible result.');

    fireEvent.press(screen.getByRole('button', { name: 'Tags' }));

    expect(screen.getByPlaceholderText('Add a tag').props.value).toBe('');
  });

  it('keeps stale tag failures silent after a newer result is visible', async () => {
    const staleTagDeferred = createDeferred<Tag>();
    const historyRepository = createHistoryRepositoryMock();
    (historyRepository.assignTag as jest.Mock).mockReturnValue(staleTagDeferred.promise);
    const recordingController = createInjectedRecordingController();
    const recordFlowProcessors = createScreenRecordFlowProcessors({
      runTranscription: createSequentialTranscriptions(['First failure result.', 'Second failure result.']),
    });

    render(
      <RecordScreen
        historyRepository={historyRepository}
        recordFlowProcessors={recordFlowProcessors}
        recordingController={recordingController}
      />,
    );

    fireEvent.press(screen.getByRole('button', { name: 'Tap to record' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Stop recording' }));

    expect(await screen.findByDisplayValue('First failure result.')).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Tags' }));
    fireEvent.changeText(screen.getByPlaceholderText('Add a tag'), 'Failing tag');
    fireEvent.press(screen.getByRole('button', { name: 'Add tag' }));

    await waitFor(() => {
      expect(historyRepository.assignTag).toHaveBeenCalledWith('history-1', 'Failing tag');
    });

    fireEvent.press(screen.getByRole('button', { name: 'Tap to record' }));

    await waitFor(() => {
      expect(recordingController.start).toHaveBeenCalledTimes(2);
    });

    fireEvent.press(screen.getByRole('button', { name: 'Stop recording' }));

    expect(await screen.findByDisplayValue('Second failure result.')).toBeTruthy();

    await act(async () => {
      staleTagDeferred.reject(new Error('stale tag write failed'));
      await flushMicrotasks();
    });

    expect(screen.queryByText('Could not add tag.')).toBeNull();
    expect(screen.queryByDisplayValue('Failing tag')).toBeNull();
    expect(screen.getByTestId('result-editor').props.value).toBe('Second failure result.');
  });
});
