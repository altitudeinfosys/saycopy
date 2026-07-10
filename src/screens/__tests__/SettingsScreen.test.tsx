import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import type { ReactTestInstance } from 'react-test-renderer';

import type { SecureTokenStore, TokenStatus } from '../../storage/secureTokenStore';
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
  settingsRepository = new MemorySettingsRepository(),
  tokenStore = new MemoryTokenStore(),
}: {
  readonly settingsRepository?: MemorySettingsRepository;
  readonly tokenStore?: MemoryTokenStore;
} = {}) {
  render(<SettingsScreen settingsRepository={settingsRepository} tokenStore={tokenStore} />);

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

    await screen.findByText('Defaults');
    expectMinimumTouchTarget(screen.getByRole('button', { name: 'Default mode Translate' }));
    expectMinimumTouchTarget(
      screen.getByRole('button', { name: 'Default source language Arabic' }),
    );
    expectMinimumTouchTarget(
      screen.getByRole('button', { name: 'Default target language Arabic' }),
    );
    expectMinimumTouchTarget(screen.getByRole('button', { name: 'Default preset Best Quality' }));
  });

  it('shows token present state without rendering the secret token', async () => {
    renderSettingsScreen({ tokenStore: new MemoryTokenStore('sk-or-v1-secret-token') });

    expect(await screen.findByText('OpenRouter token saved')).toBeTruthy();
    expect(screen.queryByText('sk-or-v1-secret-token')).toBeNull();
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

    await screen.findByText('Defaults');

    fireEvent.press(screen.getByRole('button', { name: 'Default mode Translate' }));
    fireEvent.press(screen.getByRole('button', { name: 'Default source language Spanish' }));
    fireEvent.press(screen.getByRole('button', { name: 'Default target language Arabic' }));
    fireEvent.press(screen.getByRole('button', { name: 'Default preset Fast' }));
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
    expect(settingsRepository.saveSettings).toHaveBeenCalledWith({ modelPresetId: 'fast' });
    expect(settingsRepository.saveSettings).toHaveBeenCalledWith({ cleanupEnabled: false });
  });

  it('shows separate transcription and translation model controls with recommendations and custom IDs', async () => {
    const { settingsRepository } = renderSettingsScreen();

    await screen.findByText('Transcription model');

    expect(screen.getByText('Recommended transcription models')).toBeTruthy();
    expect(screen.getByText('Translation and cleanup model')).toBeTruthy();
    expect(screen.getByText('openai/gpt-4.1-mini')).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Recommended transcription model Best Quality' }));

    await waitFor(() => {
      expect(settingsRepository.settings.transcriptionModelId).toBe('openai/gpt-4o-transcribe');
    });
    expect(settingsRepository.saveSettings).toHaveBeenCalledWith({
      transcriptionModelId: 'openai/gpt-4o-transcribe',
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

    await screen.findByText('Transcription model');

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

  it('does not roll back an unrelated saved default when a later default save fails', async () => {
    const settingsRepository = new RejectingSourceLanguageSettingsRepository();
    renderSettingsScreen({ settingsRepository });

    await screen.findByText('Defaults');

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

    await screen.findByText('Defaults');

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
