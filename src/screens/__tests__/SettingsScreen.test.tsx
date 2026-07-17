import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Platform, StyleSheet } from 'react-native';
import type { ReactTestInstance } from 'react-test-renderer';

import type { SecureTokenStore, TokenStatus } from '../../storage/secureTokenStore';
import type { OpenRouterModelCatalog } from '../../providers/openRouter/modelCatalog';
import {
  DEFAULT_APP_SETTINGS,
  type AppSettings,
  type SettingsRepository,
} from '../../storage/settingsRepository';
import SettingsScreen from '../SettingsScreen';

class MemorySettingsRepository implements SettingsRepository {
  settings: AppSettings;

  constructor(settings: AppSettings = DEFAULT_APP_SETTINGS) {
    this.settings = settings;
  }

  getSettings = jest.fn(async (): Promise<AppSettings> => this.settings);

  saveSettings = jest.fn(async (settings: Partial<AppSettings>): Promise<void> => {
    this.settings = { ...this.settings, ...settings };
  });
}

class RejectingSourceLanguageSettingsRepository extends MemorySettingsRepository {
  saveSettings = jest.fn(async (settings: Partial<AppSettings>): Promise<void> => {
    if (settings.sourceLanguageId) {
      throw new Error('Source language save failed');
    }

    this.settings = { ...this.settings, ...settings };
  });
}

class OutOfOrderSourceLanguageSettingsRepository extends MemorySettingsRepository {
  readonly spanishDeferred = createDeferred();
  readonly englishDeferred = createDeferred();

  saveSettings = jest.fn(async (settings: Partial<AppSettings>): Promise<void> => {
    if (settings.sourceLanguageId === 'spanish') {
      await this.spanishDeferred.promise;
      throw new Error('Older Spanish save failed');
    }

    if (settings.sourceLanguageId === 'english') {
      await this.englishDeferred.promise;
    }

    this.settings = { ...this.settings, ...settings };
  });
}

class MemoryTokenStore implements SecureTokenStore {
  token: string | null;

  constructor(token: string | null = null) {
    this.token = token;
  }

  getToken = jest.fn(async (): Promise<string | null> => this.token);

  setToken = jest.fn(async (token: string): Promise<void> => {
    const trimmedToken = token.trim();
    this.token = trimmedToken ? trimmedToken : null;
  });

  clearToken = jest.fn(async (): Promise<void> => {
    this.token = null;
  });

  hasToken = jest.fn(async (): Promise<boolean> => this.token !== null);

  getTokenStatus = jest.fn(async (): Promise<TokenStatus> => ({
    hasToken: this.token !== null,
    statusText: this.token !== null ? 'OpenRouter token saved' : 'OpenRouter token missing',
  }));
}

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((nextResolve) => {
    resolve = nextResolve;
  });

  return { promise, resolve };
}

class DeferredSetTokenStore extends MemoryTokenStore {
  readonly setDeferred = createDeferred();

  setToken = jest.fn(async (token: string): Promise<void> => {
    await this.setDeferred.promise;
    const trimmedToken = token.trim();
    this.token = trimmedToken ? trimmedToken : null;
  });
}

function renderSettingsScreen({
  modelCatalog,
  openExternalUrl,
  settingsRepository = new MemorySettingsRepository(),
  tokenStore = new MemoryTokenStore(),
}: {
  readonly modelCatalog?: OpenRouterModelCatalog;
  readonly openExternalUrl?: (url: string) => Promise<unknown>;
  readonly settingsRepository?: MemorySettingsRepository;
  readonly tokenStore?: MemoryTokenStore;
} = {}) {
  render(
    <SettingsScreen
      modelCatalog={modelCatalog}
      openExternalUrl={openExternalUrl}
      settingsRepository={settingsRepository}
      tokenStore={tokenStore}
    />,
  );

  return { settingsRepository, tokenStore };
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

describe('SettingsScreen', () => {
  it('shows token missing state', async () => {
    renderSettingsScreen({ tokenStore: new MemoryTokenStore(null) });

    expect(await screen.findByText('OpenRouter token missing')).toBeTruthy();
  });

  it('keeps settings controls touchable and token status resilient for large text', async () => {
    renderSettingsScreen({ tokenStore: new MemoryTokenStore(null) });

    const tokenStatus = await screen.findByText('OpenRouter token missing');
    expect(StyleSheet.flatten(tokenStatus.props.style)).toEqual(
      expect.objectContaining({ flexShrink: 1 }),
    );
    expect(tokenStatus.props.accessibilityLiveRegion).toBe('polite');

    expectMinimumTouchTarget(screen.getByRole('button', { name: 'Save token' }));
    expectMinimumTouchTarget(screen.getByRole('button', { name: 'Clear token' }));

    await screen.findByText('Recording defaults');
    expectMinimumTouchTarget(screen.getByRole('button', { name: 'Default mode Translate' }));
    expectMinimumTouchTarget(
      screen.getByRole('button', { name: 'Default source language Arabic' }),
    );
    expectMinimumTouchTarget(
      screen.getByRole('button', { name: 'Default target language Arabic' }),
    );
    expectMinimumTouchTarget(screen.getByRole('button', { name: 'Recommended model Best Quality' }));
  });

  it('shows token present state without rendering the secret token', async () => {
    renderSettingsScreen({ tokenStore: new MemoryTokenStore('sk-or-v1-secret-token') });

    expect(await screen.findByText('OpenRouter token saved')).toBeTruthy();
    expect(screen.queryByText('sk-or-v1-secret-token')).toBeNull();
  });

  it('opens SayCopy setup, privacy, and support resources', async () => {
    const openExternalUrl = jest.fn(async () => undefined);
    renderSettingsScreen({ openExternalUrl });

    await screen.findByText('Help and privacy');

    fireEvent.press(screen.getByRole('link', { name: 'Open SayCopy setup guide' }));
    fireEvent.press(screen.getByRole('link', { name: 'Open SayCopy privacy policy' }));
    fireEvent.press(screen.getByRole('link', { name: 'Open SayCopy support' }));

    await waitFor(() => {
      expect(openExternalUrl).toHaveBeenNthCalledWith(1, 'https://saycopy.app/setup');
      expect(openExternalUrl).toHaveBeenNthCalledWith(2, 'https://saycopy.app/privacy');
      expect(openExternalUrl).toHaveBeenNthCalledWith(3, 'https://saycopy.app/support');
    });
  });

  it('shows an error when a SayCopy resource cannot be opened', async () => {
    renderSettingsScreen({
      openExternalUrl: jest.fn(async () => {
        throw new Error('Website unavailable');
      }),
    });

    await screen.findByText('Help and privacy');
    fireEvent.press(screen.getByRole('link', { name: 'Open SayCopy privacy policy' }));

    expect(await screen.findByText('Could not open the SayCopy website.')).toBeTruthy();
  });

  it('saves a token through the injected token store', async () => {
    const { tokenStore } = renderSettingsScreen();

    await screen.findByText('OpenRouter token missing');

    fireEvent.changeText(screen.getByLabelText('OpenRouter API token'), '  sk-or-v1-test-token  ');
    fireEvent.press(screen.getByRole('button', { name: 'Save token' }));

    await waitFor(() => {
      expect(tokenStore.setToken).toHaveBeenCalledWith('  sk-or-v1-test-token  ');
      expect(tokenStore.token).toBe('sk-or-v1-test-token');
      expect(screen.getByText('OpenRouter token saved')).toBeTruthy();
    });
  });

  it('disables token controls while a token save is pending', async () => {
    const tokenStore = new DeferredSetTokenStore();
    renderSettingsScreen({ tokenStore });

    await screen.findByText('OpenRouter token missing');

    fireEvent.changeText(screen.getByLabelText('OpenRouter API token'), 'sk-or-v1-test-token');
    fireEvent.press(screen.getByRole('button', { name: 'Save token' }));

    await waitFor(() => {
      expect(tokenStore.setToken).toHaveBeenCalledWith('sk-or-v1-test-token');
      expect(screen.getByRole('button', { name: 'Save token' }).props.accessibilityState).toMatchObject({
        disabled: true,
      });
      expect(screen.getByRole('button', { name: 'Clear token' }).props.accessibilityState).toMatchObject({
        disabled: true,
      });
      expect(screen.getByLabelText('OpenRouter API token').props.editable).toBe(false);
    });

    fireEvent.press(screen.getByRole('button', { name: 'Clear token' }));

    expect(tokenStore.clearToken).not.toHaveBeenCalled();

    await act(async () => {
      tokenStore.setDeferred.resolve();
      await tokenStore.setDeferred.promise;
    });

    await waitFor(() => {
      expect(screen.getByText('OpenRouter token saved')).toBeTruthy();
    });
  });

  it('clears a saved token through the injected token store', async () => {
    const { tokenStore } = renderSettingsScreen({
      tokenStore: new MemoryTokenStore('sk-or-v1-secret-token'),
    });

    await screen.findByText('OpenRouter token saved');

    fireEvent.press(screen.getByRole('button', { name: 'Clear token' }));

    await waitFor(() => {
      expect(tokenStore.clearToken).toHaveBeenCalled();
      expect(tokenStore.token).toBeNull();
      expect(screen.getByText('OpenRouter token missing')).toBeTruthy();
    });
  });

  it('persists non-secret default preset and language controls', async () => {
    const { settingsRepository } = renderSettingsScreen();

    await screen.findByText('Recording defaults');

    fireEvent.press(screen.getByRole('button', { name: 'Default mode Translate' }));
    fireEvent.press(screen.getByRole('button', { name: 'Default source language Spanish' }));
    fireEvent.press(screen.getByRole('button', { name: 'Default target language Arabic' }));
    fireEvent.press(screen.getByRole('button', { name: 'Recommended model Fast' }));
    fireEvent.press(screen.getByRole('button', { name: 'Default cleanup Off' }));

    await waitFor(() => {
      expect(settingsRepository.settings).toMatchObject({
        defaultMode: 'translate',
        sourceLanguageId: 'spanish',
        targetLanguageId: 'arabic',
        modelPresetId: 'fast',
        cleanupEnabled: false,
      });
    });
    expect(settingsRepository.saveSettings).toHaveBeenCalledWith({ defaultMode: 'translate' });
    expect(settingsRepository.saveSettings).toHaveBeenCalledWith({ sourceLanguageId: 'spanish' });
    expect(settingsRepository.saveSettings).toHaveBeenCalledWith({ targetLanguageId: 'arabic' });
    expect(settingsRepository.saveSettings).toHaveBeenCalledWith({
      customModelId: '',
      modelPresetId: 'fast',
    });
    expect(settingsRepository.saveSettings).toHaveBeenCalledWith({ cleanupEnabled: false });
  });

  it('shows separate transcription and translation model controls with recommendations and custom IDs', async () => {
    const { settingsRepository } = renderSettingsScreen();

    await screen.findByText('1. Speech-to-text model');

    expect(screen.getByText('Recommended transcription models')).toBeTruthy();
    expect(screen.getByText('2. Text-processing model')).toBeTruthy();
    expect(screen.getByText('openai/gpt-4.1-mini')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Browse OpenRouter transcription models' }),
    ).toBeTruthy();

    fireEvent.press(
      screen.getByRole('button', { name: 'Recommended transcription model Alternative' }),
    );

    await waitFor(() => {
      expect(settingsRepository.settings.transcriptionModelId).toBe('google/chirp-3');
    });
    expect(settingsRepository.saveSettings).toHaveBeenCalledWith({
      transcriptionModelId: 'google/chirp-3',
    });

    fireEvent.press(screen.getByRole('button', { name: 'Recommended model Fast' }));

    await waitFor(() => {
      expect(settingsRepository.settings).toMatchObject({
        customModelId: '',
        modelPresetId: 'fast',
      });
    });
    expect(settingsRepository.saveSettings).toHaveBeenCalledWith({
      customModelId: '',
      modelPresetId: 'fast',
    });

    fireEvent.changeText(
      screen.getByLabelText('Custom OpenRouter translation model ID'),
      '  mistralai/mistral-small-3.2-24b-instruct  ',
    );
    fireEvent.press(screen.getByRole('button', { name: 'Save custom translation model' }));

    await waitFor(() => {
      expect(settingsRepository.settings.customModelId).toBe(
        'mistralai/mistral-small-3.2-24b-instruct',
      );
    });
    expect(settingsRepository.saveSettings).toHaveBeenCalledWith({
      customModelId: 'mistralai/mistral-small-3.2-24b-instruct',
    });

    fireEvent.press(screen.getByRole('button', { name: 'Use recommended preset' }));

    await waitFor(() => {
      expect(settingsRepository.settings.customModelId).toBe('');
    });
    expect(settingsRepository.saveSettings).toHaveBeenCalledWith({ customModelId: '' });
  });

  it('saves custom transcription and translation models from keyboard Done actions', async () => {
    const { settingsRepository } = renderSettingsScreen();

    await screen.findByText('1. Speech-to-text model');

    const transcriptionModelInput = screen.getByLabelText('Custom OpenRouter transcription model ID');
    fireEvent.changeText(transcriptionModelInput, 'openai/whisper-large-v3-turbo');
    fireEvent(transcriptionModelInput, 'submitEditing');

    await waitFor(() => {
      expect(settingsRepository.saveSettings).toHaveBeenCalledWith({
        transcriptionModelId: 'openai/whisper-large-v3-turbo',
      });
    });
    expect(transcriptionModelInput.props.returnKeyType).toBe('done');
    expect(transcriptionModelInput.props.blurOnSubmit).toBe(true);

    const customModelInput = screen.getByLabelText('Custom OpenRouter translation model ID');
    fireEvent.changeText(customModelInput, 'google/gemini-3.1-flash-lite');
    fireEvent(customModelInput, 'submitEditing');

    await waitFor(() => {
      expect(settingsRepository.saveSettings).toHaveBeenCalledWith({
        customModelId: 'google/gemini-3.1-flash-lite',
      });
    });
    expect(customModelInput.props.returnKeyType).toBe('done');
    expect(customModelInput.props.blurOnSubmit).toBe(true);
  });

  it('shows confirmation for each custom model save control', async () => {
    renderSettingsScreen();

    await screen.findByText('1. Speech-to-text model');
    fireEvent.changeText(
      screen.getByLabelText('Custom OpenRouter transcription model ID'),
      'openai/whisper-large-v3-turbo',
    );
    fireEvent.press(screen.getByRole('button', { name: 'Save custom transcription model' }));

    expect(await screen.findByText('Preferred transcription model saved')).toBeTruthy();

    fireEvent.changeText(
      screen.getByLabelText('Custom OpenRouter translation model ID'),
      'google/gemini-3.1-flash-lite',
    );
    fireEvent.press(screen.getByRole('button', { name: 'Save custom translation model' }));

    expect(await screen.findByText('Custom text model saved')).toBeTruthy();
  });

  it('shows save confirmation for one-tap recommended model choices', async () => {
    renderSettingsScreen();

    await screen.findByText('1. Speech-to-text model');
    fireEvent.press(
      screen.getByRole('button', { name: 'Recommended transcription model Alternative' }),
    );
    expect(await screen.findByText('Preferred transcription model saved')).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Recommended model Fast' }));
    expect(await screen.findByText('Fast text-model preset saved')).toBeTruthy();
  });

  it('applies modal safe-area and close-button protection only on Android', async () => {
    const originalPlatformOS = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    const modelCatalog: OpenRouterModelCatalog = {
      listTranscriptionModels: jest.fn(async () => []),
      listTextModels: jest.fn(async () => [
        { id: 'google/gemini-3.1-flash-lite', name: 'Gemini Flash Lite' },
      ]),
    };
    try {
      renderSettingsScreen({ modelCatalog });

      await screen.findByText('2. Text-processing model');
      fireEvent.press(
        screen.getByRole('button', { name: 'Browse OpenRouter translation models' }),
      );

      const safeArea = await screen.findByTestId('model-picker-safe-area');
      expect(safeArea.props.edges).toEqual(expect.arrayContaining(['top', 'bottom']));

      const closeButton = screen.getByRole('button', { name: 'Close Translation model' });
      expectMinimumTouchTarget(closeButton);
      expect(closeButton.props.hitSlop).toBe(8);
      expect(StyleSheet.flatten(closeButton.props.style)).toEqual(
        expect.objectContaining({ borderWidth: 1, paddingHorizontal: 12 }),
      );

      fireEvent.press(closeButton);
      expect(screen.queryByLabelText('Search OpenRouter translation models')).toBeNull();
    } finally {
      Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatformOS });
    }
  });

  it('preserves the native iOS page-sheet close-button appearance', async () => {
    const modelCatalog: OpenRouterModelCatalog = {
      listTranscriptionModels: jest.fn(async () => []),
      listTextModels: jest.fn(async () => []),
    };
    renderSettingsScreen({ modelCatalog });

    await screen.findByText('2. Text-processing model');
    fireEvent.press(screen.getByRole('button', { name: 'Browse OpenRouter translation models' }));

    const safeArea = await screen.findByTestId('model-picker-safe-area');
    expect(safeArea.props.edges).toEqual([]);
    const closeButton = screen.getByRole('button', { name: 'Close Translation model' });
    expect(closeButton.props.hitSlop).toBeUndefined();
    expect(StyleSheet.flatten(closeButton.props.style)?.borderWidth).toBeUndefined();
  });

  it('loads, searches, and activates a translation model selected from OpenRouter', async () => {
    const modelCatalog: OpenRouterModelCatalog = {
      listTranscriptionModels: jest.fn(async () => []),
      listTextModels: jest.fn(async () => [
        { id: 'google/gemini-3.1-flash-lite', name: 'Gemini Flash Lite' },
        { id: 'anthropic/claude-sonnet-4.6', name: 'Claude Sonnet 4.6' },
      ]),
    };
    const { settingsRepository } = renderSettingsScreen({ modelCatalog });

    await screen.findByText('2. Text-processing model');
    fireEvent.press(screen.getByRole('button', { name: 'Browse OpenRouter translation models' }));

    expect(await screen.findByText('Claude Sonnet 4.6')).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('Search OpenRouter translation models'), 'gemini');
    expect(screen.queryByText('Claude Sonnet 4.6')).toBeNull();

    fireEvent.press(
      screen.getByRole('button', { name: 'Translation model google/gemini-3.1-flash-lite' }),
    );

    await waitFor(() => {
      expect(settingsRepository.saveSettings).toHaveBeenCalledWith({
        customModelId: 'google/gemini-3.1-flash-lite',
      });
    });
    expect(screen.queryByLabelText('Search OpenRouter translation models')).toBeNull();
  });

  it('loads, searches, and activates a transcription model selected from OpenRouter', async () => {
    const modelCatalog: OpenRouterModelCatalog = {
      listTranscriptionModels: jest.fn(async () => [
        { id: 'openai/whisper-large-v3', name: 'Whisper Large V3' },
        { id: 'google/chirp-3', name: 'Chirp 3' },
      ]),
      listTextModels: jest.fn(async () => []),
    };
    const { settingsRepository } = renderSettingsScreen({ modelCatalog });

    await screen.findByText('1. Speech-to-text model');
    fireEvent.press(screen.getByRole('button', { name: 'Browse OpenRouter transcription models' }));

    expect(await screen.findByText('Chirp 3')).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('Search OpenRouter transcription models'), 'whisper');
    expect(screen.queryByText('Chirp 3')).toBeNull();

    fireEvent.press(
      screen.getByRole('button', { name: 'Transcription model openai/whisper-large-v3' }),
    );

    await waitFor(() => {
      expect(settingsRepository.saveSettings).toHaveBeenCalledWith({
        transcriptionModelId: 'openai/whisper-large-v3',
      });
    });
    expect(screen.queryByLabelText('Search OpenRouter transcription models')).toBeNull();
  });

  it('filters known incompatible Arabic transcription models and shows language badges', async () => {
    const modelCatalog: OpenRouterModelCatalog = {
      listTranscriptionModels: jest.fn(async () => [
        { id: 'google/chirp-3', name: 'Chirp 3' },
        { id: 'nvidia/parakeet-tdt-0.6b-v3', name: 'Parakeet V3' },
        { id: 'provider/future-model', name: 'Future Model' },
      ]),
      listTextModels: jest.fn(async () => []),
    };
    const settingsRepository = new MemorySettingsRepository({
      ...DEFAULT_APP_SETTINGS,
      sourceLanguageId: 'arabic',
    });
    renderSettingsScreen({ modelCatalog, settingsRepository });

    await screen.findByText('1. Speech-to-text model');
    fireEvent.press(screen.getByRole('button', { name: 'Browse OpenRouter transcription models' }));

    expect(await screen.findByText('Arabic preview')).toBeTruthy();
    expect(screen.getByText('Arabic support unverified')).toBeTruthy();
    expect(screen.queryByText('Parakeet V3')).toBeNull();
  });

  it('keeps the preferred model saved when Auto-detect is selected', async () => {
    const settingsRepository = new MemorySettingsRepository({
      ...DEFAULT_APP_SETTINGS,
      sourceLanguageId: 'arabic',
      transcriptionModelId: 'deepgram/nova-3',
    });
    renderSettingsScreen({ settingsRepository });

    await screen.findByText('Recording defaults');
    fireEvent.press(screen.getByRole('button', { name: 'Default source language Auto-detect' }));

    await waitFor(() => {
      expect(settingsRepository.saveSettings).toHaveBeenCalledWith({
        sourceLanguageId: 'auto',
      });
      expect(settingsRepository.settings).toMatchObject({
        sourceLanguageId: 'auto',
        transcriptionModelId: 'deepgram/nova-3',
      });
    });
  });

  it('keeps every preferred transcription model available while Auto-detect is selected', async () => {
    const modelCatalog: OpenRouterModelCatalog = {
      listTranscriptionModels: jest.fn(async () => [
        { id: 'deepgram/nova-3', name: 'Nova-3' },
        { id: 'openai/whisper-large-v3', name: 'Whisper Large V3' },
        { id: 'openai/gpt-4o-transcribe', name: 'GPT-4o Transcribe' },
      ]),
      listTextModels: jest.fn(async () => []),
    };
    renderSettingsScreen({ modelCatalog });

    await screen.findByText('1. Speech-to-text model');
    fireEvent.press(screen.getByRole('button', { name: 'Browse OpenRouter transcription models' }));

    expect(await screen.findByText('Nova-3')).toBeTruthy();
    expect(screen.getByText('Whisper Large V3')).toBeTruthy();
    expect(screen.getByText('GPT-4o Transcribe')).toBeTruthy();
  });

  it('blocks a known incompatible custom transcription model', async () => {
    const settingsRepository = new MemorySettingsRepository({
      ...DEFAULT_APP_SETTINGS,
      sourceLanguageId: 'arabic',
    });
    renderSettingsScreen({ settingsRepository });

    await screen.findByText('1. Speech-to-text model');
    fireEvent.changeText(
      screen.getByLabelText('Custom OpenRouter transcription model ID'),
      'nvidia/parakeet-tdt-0.6b-v3',
    );
    fireEvent.press(screen.getByRole('button', { name: 'Save custom transcription model' }));

    expect(
      await screen.findByText(
        'nvidia/parakeet-tdt-0.6b-v3 does not support Arabic. Choose another transcription model.',
      ),
    ).toBeTruthy();
    expect(settingsRepository.saveSettings).not.toHaveBeenCalledWith({
      transcriptionModelId: 'nvidia/parakeet-tdt-0.6b-v3',
    });
  });

  it('explains that a custom text model overrides presets and cleanup off skips only cleanup', async () => {
    const settingsRepository = new MemorySettingsRepository({
      ...DEFAULT_APP_SETTINGS,
      customModelId: 'aion-labs/aion-2.0',
      cleanupEnabled: false,
    });
    renderSettingsScreen({ settingsRepository });

    expect(await screen.findByText('2. Text-processing model')).toBeTruthy();
    expect(screen.getByText('Active custom model: aion-labs/aion-2.0')).toBeTruthy();
    expect(
      screen.getByText(
        'Presets are inactive while a custom model is active. Tap a preset to switch back to it.',
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        'Off: Transcribe returns the raw speech-to-text result and skips the second model call. Translation still uses the active text model.',
      ),
    ).toBeTruthy();
  });

  it('restores both model selections to the recommended defaults', async () => {
    const settingsRepository = new MemorySettingsRepository({
      ...DEFAULT_APP_SETTINGS,
      transcriptionModelId: 'google/chirp-3',
      customModelId: 'aion-labs/aion-2.0',
      modelPresetId: 'best_quality',
    });
    renderSettingsScreen({ settingsRepository });

    await screen.findByText('AI model choices');
    fireEvent.press(screen.getByRole('button', { name: 'Use recommended model defaults' }));

    await waitFor(() => {
      expect(settingsRepository.saveSettings).toHaveBeenCalledWith({
        transcriptionModelId: 'openai/whisper-large-v3',
        customModelId: '',
        modelPresetId: 'balanced',
      });
      expect(settingsRepository.settings).toMatchObject({
        transcriptionModelId: 'openai/whisper-large-v3',
        customModelId: '',
        modelPresetId: 'balanced',
      });
    });
  });


  it('does not roll back an unrelated saved default when a later default save fails', async () => {
    const settingsRepository = new RejectingSourceLanguageSettingsRepository();
    renderSettingsScreen({ settingsRepository });

    await screen.findByText('Recording defaults');

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Default mode Translate' }));
      fireEvent.press(screen.getByRole('button', { name: 'Default source language Spanish' }));
    });

    await waitFor(() => {
      expect(screen.getByText('Could not save settings.')).toBeTruthy();
      expect(settingsRepository.settings.defaultMode).toBe('translate');
      expect(
        screen.getByRole('button', { name: 'Default mode Translate' }).props.accessibilityState,
      ).toMatchObject({ selected: true });
      expect(
        screen.getByRole('button', { name: 'Default source language Auto-detect' }).props
          .accessibilityState,
      ).toMatchObject({ selected: true });
    });
  });

  it('does not roll back a newer same-setting selection when an older save fails later', async () => {
    const settingsRepository = new OutOfOrderSourceLanguageSettingsRepository();
    renderSettingsScreen({ settingsRepository });

    await screen.findByText('Recording defaults');

    fireEvent.press(screen.getByRole('button', { name: 'Default source language Spanish' }));
    fireEvent.press(screen.getByRole('button', { name: 'Default source language English' }));

    await act(async () => {
      settingsRepository.englishDeferred.resolve();
      await settingsRepository.englishDeferred.promise;
    });

    await waitFor(() => {
      expect(settingsRepository.settings.sourceLanguageId).toBe('english');
      expect(
        screen.getByRole('button', { name: 'Default source language English' }).props
          .accessibilityState,
      ).toMatchObject({ selected: true });
    });

    await act(async () => {
      settingsRepository.spanishDeferred.resolve();
      await settingsRepository.spanishDeferred.promise;
    });

    await waitFor(() => {
      expect(screen.getByText('Could not save settings.')).toBeTruthy();
      expect(settingsRepository.settings.sourceLanguageId).toBe('english');
      expect(
        screen.getByRole('button', { name: 'Default source language English' }).props
          .accessibilityState,
      ).toMatchObject({ selected: true });
      expect(
        screen.getByRole('button', { name: 'Default source language Auto-detect' }).props
          .accessibilityState,
      ).toMatchObject({ selected: false });
    });
  });
});
