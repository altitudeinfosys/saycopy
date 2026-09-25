import {
  createAppDependencies,
  createTranslateProcessors,
  isStaleOpenRouterOperationError,
} from '../appDependencies';
import type { OpenRouterFetch } from '../../providers/openRouter/client';
import {
  createDemoHistoryRepository,
  createDemoSettingsRepository,
} from '../../storage/demoAppRepositories';
import type { SecureStoreLike } from '../../storage/secureTokenStore';
import { createSettingsRepository } from '../../storage/settingsRepository';
import { createHistoryRepository } from '../../storage/sqlite/historyRepository';
import { createSqlJsLocalDatabase } from '../../storage/test/sqlJsLocalDatabase';

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
    const database = await createSqlJsLocalDatabase();
    const createLocalDatabase = jest.fn(() => database);

    const dependencies = createAppDependencies({
      createLocalDatabase,
      fetch: jest.fn(),
      secureStore: createSecureStore(),
    });

    await dependencies.settingsRepository.saveSettings({
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

  it('does not open production SQLite when both repositories are injected', async () => {
    const database = await createSqlJsLocalDatabase();
    const createLocalDatabase = jest.fn(() => database);

    createAppDependencies({
      createLocalDatabase,
      fetch: jest.fn(),
      historyRepository: createHistoryRepository(database),
      secureStore: createSecureStore(),
      settingsRepository: createSettingsRepository(database),
    });

    expect(createLocalDatabase).not.toHaveBeenCalled();
  });

  describe('translate processors', () => {
    function createProvider() {
      return {
        cleanupTranscript: jest.fn(),
        transcribeAudio: jest.fn(async () => ({ text: 'Hola', modelId: 'stt-model' })),
        translateText: jest.fn(async () => ({ text: 'Hello', modelId: 'text-model' })),
      };
    }

    it('translates text through the provider', async () => {
      const provider = createProvider();
      const processors = createTranslateProcessors({ provider });

      await expect(
        processors.translate({
          text: 'Hola',
          sourceLanguageId: 'spanish',
          targetLanguageId: 'english',
          modelPresetId: 'balanced',
        }),
      ).resolves.toEqual({ text: 'Hello', modelId: 'text-model' });
    });

    it('transcribes speech and always cleans up the temporary recording', async () => {
      const provider = createProvider();
      const temporaryAudio = { cleanup: jest.fn(async () => undefined) };
      const processors = createTranslateProcessors({ provider, temporaryAudio });
      const audio = { uri: 'file:///tmp/clip.m4a', base64Audio: 'AAA', format: 'm4a' as const };

      await expect(
        processors.transcribe({ audio, sourceLanguageId: 'spanish' }),
      ).resolves.toEqual({ text: 'Hola', modelId: 'stt-model' });
      expect(temporaryAudio.cleanup).toHaveBeenCalledWith({ uri: 'file:///tmp/clip.m4a' });

      provider.transcribeAudio.mockRejectedValueOnce(new Error('network'));
      await expect(processors.transcribe({ audio, sourceLanguageId: 'spanish' })).rejects.toThrow(
        'network',
      );
      expect(temporaryAudio.cleanup).toHaveBeenCalledTimes(2);
    });

    it('rejects results for operations that are no longer current', async () => {
      const processors = createTranslateProcessors({ provider: createProvider() });

      const error = await processors
        .translate(
          {
            text: 'Hola',
            sourceLanguageId: 'spanish',
            targetLanguageId: 'english',
            modelPresetId: 'balanced',
          },
          { isCurrent: () => false },
        )
        .catch((caught: unknown) => caught);

      expect(isStaleOpenRouterOperationError(error)).toBe(true);
    });
  });
});
