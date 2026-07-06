import { createAppDependencies } from '../appDependencies';
import type { OpenRouterFetch } from '../../providers/openRouter/client';
import type { SecureStoreLike } from '../../storage/secureTokenStore';

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
      secureStore,
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
});
