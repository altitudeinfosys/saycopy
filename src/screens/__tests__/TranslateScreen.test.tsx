import * as Clipboard from 'expo-clipboard';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';

import type { AudioRecordingController, AudioRecordingState } from '../../audio/audioRecorder';
import type { TranslateProcessors } from '../../runtime/appDependencies';
import type { SpeechPlayer } from '../../speech/speechPlayer';
import { createSettingsRepository } from '../../storage/settingsRepository';
import { createHistoryRepository } from '../../storage/sqlite/historyRepository';
import { createSqlJsLocalDatabase } from '../../storage/test/sqlJsLocalDatabase';
import TranslateScreen from '../TranslateScreen';

function createRecordingController(): AudioRecordingController & {
  readonly start: jest.Mock;
  readonly stop: jest.Mock;
} {
  const listeners = new Set<(state: AudioRecordingState) => void>();
  const audio = {
    uri: 'file:///tmp/translate-recording.m4a',
    base64Audio: 'translate-audio',
    format: 'm4a' as const,
  };
  let state: AudioRecordingState = { status: 'idle' };

  function setState(nextState: AudioRecordingState) {
    state = nextState;
    listeners.forEach((listener) => listener(state));
  }

  return {
    cancel: jest.fn(async () => setState({ status: 'idle' })),
    getState: () => state,
    processStoppedAudio: jest.fn(async (processor) => {
      setState({ audio, status: 'processing' });
      await processor(audio);
      setState({ status: 'stopped' });
    }),
    start: jest.fn(async () => setState({ status: 'recording' })),
    stop: jest.fn(async () => {
      setState({ audio, status: 'stopped' });
      return audio;
    }),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

function createProcessors(): TranslateProcessors & {
  readonly transcribe: jest.Mock;
  readonly translate: jest.Mock;
} {
  return {
    transcribe: jest.fn(async () => ({ text: '¿Dónde está la estación?', modelId: 'stt' })),
    translate: jest.fn(async ({ text }: { readonly text: string }) => ({
      text: text === 'Good morning' ? 'Buenos días' : 'Where is the station?',
      modelId: 'openai/gpt-4.1-mini',
    })),
  };
}

function createSpeechPlayer(): SpeechPlayer & { readonly speak: jest.Mock } {
  return {
    speak: jest.fn(async () => 'started' as const),
    stop: jest.fn(async () => undefined),
  };
}

async function renderTranslateScreen() {
  const database = await createSqlJsLocalDatabase();
  const historyRepository = createHistoryRepository(database);
  const settingsRepository = createSettingsRepository(database);
  await settingsRepository.saveSettings({
    translateSourceLanguageId: 'english',
    targetLanguageId: 'spanish',
  });
  const processors = createProcessors();
  const speechPlayer = createSpeechPlayer();
  const recordingController = createRecordingController();

  render(
    <TranslateScreen
      historyRepository={historyRepository}
      recordingController={recordingController}
      resultActions={{ copyText: jest.fn(async () => undefined), shareText: jest.fn() }}
      settingsRepository={settingsRepository}
      speechPlayer={speechPlayer}
      translateProcessors={processors}
    />,
  );
  await screen.findByRole('button', { name: 'From language: English' });

  return { historyRepository, processors, recordingController, settingsRepository, speechPlayer };
}

async function translate(text: string) {
  fireEvent.changeText(screen.getByLabelText('Text to translate'), text);
  fireEvent.press(screen.getByRole('button', { name: 'Translate' }));
  await screen.findByTestId('translation-result');
}

describe('TranslateScreen', () => {
  beforeEach(() => {
    jest.mocked(Clipboard.getStringAsync).mockResolvedValue('');
  });

  it('translates typed text without saving it until Save is tapped', async () => {
    const { historyRepository, processors } = await renderTranslateScreen();

    await translate('Good morning');

    expect(processors.translate).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Good morning',
        sourceLanguageId: 'english',
        targetLanguageId: 'spanish',
      }),
      expect.anything(),
    );
    expect(within(screen.getByTestId('translation-result')).getByText('Buenos días')).toBeTruthy();
    await expect(historyRepository.listHistoryItems()).resolves.toEqual([]);

    fireEvent.press(screen.getByRole('button', { name: 'Save translation' }));

    expect(await screen.findByRole('button', { name: 'Saved' })).toBeTruthy();
    await expect(historyRepository.listHistoryItems()).resolves.toMatchObject([
      {
        mode: 'translate',
        sourceType: 'manual',
        sourceLanguageId: 'english',
        targetLanguageId: 'spanish',
        transcript: 'Good morning',
        translatedText: 'Buenos días',
      },
    ]);
    fireEvent.press(screen.getByRole('button', { name: 'Saved translations, 1 item' }));
    expect(await screen.findByRole('button', { name: 'Open saved translation Good morning' })).toBeTruthy();
  });

  it('tags a saved translation and filters the saved list by tag', async () => {
    const { historyRepository } = await renderTranslateScreen();

    await translate('Good morning');
    fireEvent.press(screen.getByRole('button', { name: 'Save translation' }));
    await screen.findByRole('button', { name: 'Saved' });
    fireEvent.changeText(screen.getByLabelText('Tag name'), 'greetings');
    fireEvent.press(screen.getByRole('button', { name: 'Add tag' }));

    fireEvent.press(screen.getByRole('button', { name: 'Saved translations, 1 item' }));
    expect(await screen.findByRole('button', { name: 'Filter saved translations by greetings' })).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Close saved translations' }));
    const [item] = await historyRepository.listHistoryItems({ tag: 'greetings' });
    expect(item).toMatchObject({ transcript: 'Good morning' });

    await historyRepository.createHistoryItem({
      mode: 'translate',
      sourceLanguageId: 'english',
      targetLanguageId: 'spanish',
      primaryText: 'Gracias',
      sourceText: 'Thanks',
      translatedText: 'Gracias',
    });
    await translate('Where is it?');
    fireEvent.press(screen.getByRole('button', { name: 'Save translation' }));
    await screen.findByRole('button', { name: 'Saved' });
    fireEvent.press(screen.getByRole('button', { name: 'Saved translations, 3 items' }));
    await screen.findByRole('button', { name: 'Open saved translation Where is it?' });

    fireEvent.press(
      screen.getByRole('button', { name: 'Filter saved translations by greetings' }),
    );

    expect(screen.getByRole('button', { name: 'Open saved translation Good morning' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Open saved translation Where is it?' })).toBeNull();
  });

  it('swaps languages and moves the translation into the input to translate back', async () => {
    const { settingsRepository } = await renderTranslateScreen();

    await translate('Good morning');
    fireEvent.press(screen.getByRole('button', { name: 'Swap languages' }));

    expect(screen.getByRole('button', { name: 'From language: Spanish' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'To language: English' })).toBeTruthy();
    expect(screen.getByLabelText('Text to translate').props.value).toBe('Buenos días');
    expect(screen.queryByTestId('translation-result')).toBeNull();
    await waitFor(async () => {
      await expect(settingsRepository.getSettings()).resolves.toMatchObject({
        translateSourceLanguageId: 'spanish',
        targetLanguageId: 'english',
      });
    });
  });

  it('disables swapping while From is Auto-detect', async () => {
    await renderTranslateScreen();

    fireEvent.press(screen.getByRole('button', { name: 'From language: English' }));
    fireEvent.press(screen.getByRole('button', { name: 'From Auto-detect' }));

    const swapButton = screen.getByRole('button', { name: 'Swap languages' });
    expect(swapButton.props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('puts spoken words into the input so they can be corrected before translating', async () => {
    const { processors, recordingController } = await renderTranslateScreen();

    fireEvent.press(screen.getByRole('button', { name: 'Speak' }));
    await waitFor(() => expect(recordingController.start).toHaveBeenCalled());
    fireEvent.press(await screen.findByRole('button', { name: 'Stop recording' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Text to translate').props.value).toBe(
        '¿Dónde está la estación?',
      );
    });
    expect(processors.transcribe).toHaveBeenCalledWith(
      expect.objectContaining({ sourceLanguageId: 'english' }),
      expect.anything(),
    );
    expect(processors.translate).not.toHaveBeenCalled();
  });

  it('reads the translation aloud and explains a missing voice', async () => {
    const { speechPlayer } = await renderTranslateScreen();

    await translate('Good morning');
    fireEvent.press(screen.getByRole('button', { name: 'Listen to translation' }));

    await waitFor(() => expect(speechPlayer.speak).toHaveBeenCalledWith('Buenos días', 'spanish'));

    speechPlayer.speak.mockResolvedValueOnce('no_voice');
    fireEvent.press(screen.getByRole('button', { name: 'Listen to translation' }));

    expect(await screen.findByText(/No Spanish voice is installed on this device/u)).toBeTruthy();
  });

  it('asks for text and for two different languages', async () => {
    const { processors } = await renderTranslateScreen();

    fireEvent.press(screen.getByRole('button', { name: 'Translate' }));
    expect(await screen.findByText('Type or speak something to translate.')).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'To language: Spanish' }));
    fireEvent.press(screen.getByRole('button', { name: 'To English' }));
    fireEvent.changeText(screen.getByLabelText('Text to translate'), 'Hello');
    fireEvent.press(screen.getByRole('button', { name: 'Translate' }));

    expect(await screen.findByText('Choose two different languages.')).toBeTruthy();
    expect(processors.translate).not.toHaveBeenCalled();
  });

  it('reopens a saved translation with its languages', async () => {
    const { historyRepository } = await renderTranslateScreen();
    await historyRepository.createHistoryItem({
      mode: 'translate',
      sourceLanguageId: 'french',
      targetLanguageId: 'english',
      primaryText: 'Good evening',
      sourceText: 'Bonsoir',
      translatedText: 'Good evening',
    });

    await translate('Good morning');
    fireEvent.press(screen.getByRole('button', { name: 'Save translation' }));
    await screen.findByRole('button', { name: 'Saved' });
    fireEvent.press(screen.getByRole('button', { name: 'Saved translations, 2 items' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Open saved translation Bonsoir' }));

    expect(screen.getByRole('button', { name: 'From language: French' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'To language: English' })).toBeTruthy();
    expect(screen.getByLabelText('Text to translate').props.value).toBe('Bonsoir');
    expect(screen.getByRole('button', { name: 'Saved' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Saved translations, 2 items' }).props.accessibilityState)
      .toMatchObject({ expanded: false });
  });

  it('pastes clipboard text into the current input and clears the old result', async () => {
    await renderTranslateScreen();
    await translate('Good morning');
    jest.mocked(Clipboard.getStringAsync).mockResolvedValueOnce('  Text from another app  ');

    fireEvent.press(screen.getByRole('button', { name: 'Paste text from clipboard' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Text to translate').props.value).toBe('Text from another app');
    });
    expect(screen.queryByTestId('translation-result')).toBeNull();
  });

  it('shows a clear message when the clipboard has no text', async () => {
    await renderTranslateScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Paste text from clipboard' }));
    expect(await screen.findByText('Clipboard has no text to paste.')).toBeTruthy();
  });
});
