import { createAppDependencies } from '../appDependencies';
import type { OpenRouterFetch } from '../../providers/openRouter/client';
import {
  createDemoHistoryRepository,
  createDemoSettingsRepository,
} from '../../storage/demoAppRepositories';
import type { SecureStoreLike } from '../../storage/secureTokenStore';
import { createSettingsRepository } from '../../storage/settingsRepository';
import { createHistoryRepository } from '../../storage/sqlite/historyRepository';
import { InMemoryLocalSqliteDatabase } from '../../storage/test/InMemoryLocalSqliteDatabase';

function createSecureStore(initialToken: string | null = null): SecureStoreLike {
  let token = initialToken;

  return {
    getItemAsync: jest.fn(async () => token),
    setItemAsync: jest.fn(async (_key: string, value: string) => {
      token = value;
    }),
    deleteItemAsync: jest.fn(async () => {
      token = null;
    }),
  };
}

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  };
}

describe('createAppDependencies', () => {
  it('uses the same SecureStore token store for settings and OpenRouter flow requests', async () => {
    const secureStore = createSecureStore();
    const fetchImpl: jest.MockedFunction<OpenRouterFetch> = jest.fn<
      ReturnType<OpenRouterFetch>,
      Parameters<OpenRouterFetch>
    >(async () =>
      jsonResponse({ choices: [{ message: { content: 'Hola.' } }] }),
    );
    const dependencies = createAppDependencies({
      fetch: fetchImpl,
      historyRepository: createDemoHistoryRepository(),
      secureStore,
      settingsRepository: createDemoSettingsRepository(),
    });

    await dependencies.tokenStore.setToken('  sk-or-v1-live-runtime-token  ');
    const result = await dependencies.recordFlowProcessors.runTranslation({
      sourceType: 'manual',
      text: 'Hello.',
      sourceLanguageId: 'english',
      targetLanguageId: 'spanish',
      modelPresetId: 'balanced',
    });

    expect(result).toMatchObject({
      status: 'success',
      translatedText: 'Hola.',
    });
    expect(secureStore.setItemAsync).toHaveBeenCalledWith(
      'openrouter_token',
      'sk-or-v1-live-runtime-token',
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/chat/completions',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-or-v1-live-runtime-token',
        }),
      }),
    );
  });

  it('wires default history and settings repositories from the local SQLite database factory', async () => {
    const database = new InMemoryLocalSqliteDatabase();
    const createLocalDatabase = jest.fn(() => database);

    const dependencies = createAppDependencies({
      createLocalDatabase,
      fetch: jest.fn(),
      secureStore: createSecureStore(),
    });

    await dependencies.settingsRepository.saveSettings({
      defaultMode: 'translate',
      sourceLanguageId: 'spanish',
      targetLanguageId: 'arabic',
      modelPresetId: 'fast',
      cleanupEnabled: false,
    });
    await dependencies.historyRepository.createHistoryItem({
      id: 'history-sqlite-default',
      primaryText: 'Durable default repository transcript.',
      sourceLanguageId: 'spanish',
      modelPresetId: 'fast',
    });

    await expect(dependencies.settingsRepository.getSettings()).resolves.toMatchObject({
      defaultMode: 'translate',
      sourceLanguageId: 'spanish',
      targetLanguageId: 'arabic',
      modelPresetId: 'fast',
      cleanupEnabled: false,
    });
    await expect(dependencies.historyRepository.listHistoryItems()).resolves.toMatchObject([
      {
        id: 'history-sqlite-default',
        transcript: 'Durable default repository transcript.',
      },
    ]);
    expect(createLocalDatabase).toHaveBeenCalledTimes(1);
  });

  it('does not open production SQLite when both repositories are injected', () => {
    const createLocalDatabase = jest.fn(() => new InMemoryLocalSqliteDatabase());

    createAppDependencies({
      createLocalDatabase,
      fetch: jest.fn(),
      historyRepository: createHistoryRepository(new InMemoryLocalSqliteDatabase()),
      secureStore: createSecureStore(),
      settingsRepository: createSettingsRepository(new InMemoryLocalSqliteDatabase()),
    });

    expect(createLocalDatabase).not.toHaveBeenCalled();
  });
});
