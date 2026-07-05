import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

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

describe('SettingsScreen', () => {
  it('shows token missing state', async () => {
    renderSettingsScreen({ tokenStore: new MemoryTokenStore(null) });

    expect(await screen.findByText('OpenRouter token missing')).toBeTruthy();
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

    await waitFor(() => {
      expect(settingsRepository.settings).toMatchObject({
        defaultMode: 'translate',
        sourceLanguageId: 'spanish',
        targetLanguageId: 'arabic',
        modelPresetId: 'fast',
      });
    });
    expect(settingsRepository.saveSettings).toHaveBeenCalledWith({ defaultMode: 'translate' });
    expect(settingsRepository.saveSettings).toHaveBeenCalledWith({ sourceLanguageId: 'spanish' });
    expect(settingsRepository.saveSettings).toHaveBeenCalledWith({ targetLanguageId: 'arabic' });
    expect(settingsRepository.saveSettings).toHaveBeenCalledWith({ modelPresetId: 'fast' });
  });
});
