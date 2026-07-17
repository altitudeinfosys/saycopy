import { runTranscriptionFlow } from '../transcriptionFlow';
import { runTranslationFlow } from '../translationFlow';
import { createOpenRouterClient, type OpenRouterFetch } from '../../providers/openRouter/client';
import { createOpenRouterProvider } from '../../providers/openRouter/provider';

type MockResponse = {
  readonly ok: boolean;
  readonly status: number;
  readonly json: () => Promise<unknown>;
};

function jsonResponse(body: unknown, status = 200): MockResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function createFetchMock(...responses: readonly MockResponse[]): jest.MockedFunction<OpenRouterFetch> {
  let responseIndex = 0;

  return jest.fn<ReturnType<OpenRouterFetch>, Parameters<OpenRouterFetch>>(async () => {
    const response = responses[responseIndex] ?? responses[responses.length - 1];
    responseIndex += 1;

    return response;
  });
}

function createHistoryRepository() {
  return {
    createHistoryItem: jest.fn(async (input) => ({
      id: 'history-live-flow',
      createdAt: '2026-07-05T18:00:00.000Z',
      updatedAt: '2026-07-05T18:00:00.000Z',
      ...(input.mode === 'translate'
        ? {
            mode: 'translate' as const,
            sourceType: input.sourceType ?? 'manual',
            sourceLanguageId: input.sourceLanguageId ?? 'auto',
            targetLanguageId: input.targetLanguageId ?? 'spanish',
            transcript: input.sourceText,
            translatedText: input.translatedText,
          }
        : {
            mode: 'transcribe' as const,
            sourceType: input.sourceType ?? 'voice',
            sourceLanguageId: input.sourceLanguageId ?? 'auto',
            transcript: input.primaryText,
          }),
    })),
  };
}

function createProvider({
  fetchImpl,
  token = 'sk-or-v1-test-token',
}: {
  readonly fetchImpl: OpenRouterFetch;
  readonly token?: string | null;
}) {
  return createOpenRouterProvider({
    client: createOpenRouterClient({
      fetch: fetchImpl,
      getToken: async () => token,
      baseUrl: 'https://openrouter.test',
    }),
  });
}

function expectSerializedErrorToBeSanitized(error: unknown) {
  const serialized = JSON.stringify(error);

  expect(serialized).not.toContain('sk-or-v1-test-token');
  expect(serialized).not.toContain('Bearer');
  expect(serialized).not.toContain('BASE64_AUDIO_PAYLOAD');
  expect(serialized).not.toContain('private transcript text');
  expect(serialized).not.toContain('raw provider payload');
}

describe('OpenRouter live flow integration with mocked fetch', () => {
  it('runs successful STT cleanup through OpenRouter and saves the cleaned transcript', async () => {
    const fetchImpl = createFetchMock(
      jsonResponse({ text: 'hello from raw audio' }),
      jsonResponse({ choices: [{ message: { content: 'Hello from raw audio.' } }] }),
    );
    const historyRepository = createHistoryRepository();
    const provider = createProvider({ fetchImpl });

    const result = await runTranscriptionFlow(
      { provider, historyRepository },
      {
        audio: {
          uri: 'file:///tmp/openrouter-stt.m4a',
          base64Audio: 'BASE64_AUDIO_PAYLOAD',
          format: 'm4a',
        },
        sourceLanguageId: 'english',
        modelPresetId: 'balanced',
        cleanupEnabled: true,
      },
    );

    expect(result).toMatchObject({
      status: 'success',
      transcript: 'Hello from raw audio.',
    });
    expect(historyRepository.createHistoryItem).toHaveBeenCalledWith({
      mode: 'transcribe',
      sourceType: 'voice',
      sourceLanguageId: 'english',
      primaryText: 'Hello from raw audio.',
      modelPresetId: 'balanced',
      sttModelId: 'openai/whisper-large-v3',
    });
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      'https://openrouter.test/api/v1/audio/transcriptions',
      expect.objectContaining({
        body: expect.stringContaining('"model":"openai/whisper-large-v3"'),
      }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'https://openrouter.test/api/v1/chat/completions',
      expect.objectContaining({
        body: expect.stringContaining('"model":"openai/gpt-4.1-mini"'),
      }),
    );
  });

  it('uses Whisper for Auto when the selected model requires an explicit language', async () => {
    const fetchImpl = createFetchMock(jsonResponse({ text: 'مرحبا بالعالم' }));
    const historyRepository = createHistoryRepository();
    const provider = createProvider({ fetchImpl });

    const result = await runTranscriptionFlow(
      { provider, historyRepository },
      {
        audio: {
          uri: 'file:///tmp/openrouter-auto.m4a',
          base64Audio: 'BASE64_AUDIO_PAYLOAD',
          format: 'm4a',
        },
        sourceLanguageId: 'auto',
        transcriptionModelId: 'deepgram/nova-3',
        modelPresetId: 'balanced',
        cleanupEnabled: false,
      },
    );

    expect(result).toMatchObject({ status: 'success', transcript: 'مرحبا بالعالم' });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://openrouter.test/api/v1/audio/transcriptions',
      expect.objectContaining({
        body: expect.stringContaining('"model":"openai/whisper-large-v3"'),
      }),
    );
    expect(historyRepository.createHistoryItem).toHaveBeenCalledWith(
      expect.objectContaining({ sttModelId: 'openai/whisper-large-v3' }),
    );
  });

  it('runs successful manual translation through OpenRouter and saves text-only history', async () => {
    const fetchImpl = createFetchMock(
      jsonResponse({ choices: [{ message: { content: 'Buenos dias.' } }] }),
    );
    const historyRepository = createHistoryRepository();
    const provider = createProvider({ fetchImpl });

    const result = await runTranslationFlow(
      { provider, historyRepository },
      {
        sourceType: 'manual',
        text: 'Good morning.',
        sourceLanguageId: 'english',
        targetLanguageId: 'spanish',
        modelPresetId: 'fast',
      },
    );

    expect(result).toMatchObject({
      status: 'success',
      sourceType: 'manual',
      sourceText: 'Good morning.',
      translatedText: 'Buenos dias.',
    });
    expect(historyRepository.createHistoryItem).toHaveBeenCalledWith({
      mode: 'translate',
      sourceType: 'manual',
      sourceLanguageId: 'english',
      targetLanguageId: 'spanish',
      primaryText: 'Buenos dias.',
      sourceText: 'Good morning.',
      translatedText: 'Buenos dias.',
      modelPresetId: 'fast',
      textModelId: 'google/gemini-3.1-flash-lite',
    });
  });

  it('fails before fetch when auth token is missing and does not save history', async () => {
    const fetchImpl = createFetchMock(jsonResponse({ text: 'ignored' }));
    const historyRepository = createHistoryRepository();
    const provider = createProvider({ fetchImpl, token: null });

    await expect(
      runTranscriptionFlow(
        { provider, historyRepository },
        {
          audio: {
            uri: 'file:///tmp/openrouter-missing-token.m4a',
            base64Audio: 'BASE64_AUDIO_PAYLOAD',
            format: 'm4a',
          },
          sourceLanguageId: 'auto',
          modelPresetId: 'balanced',
          cleanupEnabled: true,
        },
      ),
    ).rejects.toEqual(
      expect.objectContaining({
        category: 'missing_token',
        provider: 'openrouter',
        retryable: false,
      }),
    );

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(historyRepository.createHistoryItem).not.toHaveBeenCalled();
  });

  it('maps OpenRouter authentication failures without exposing token or provider payload details', async () => {
    const fetchImpl = createFetchMock(
      jsonResponse(
        {
          error: {
            code: 'invalid_api_key',
            message: 'Bearer sk-or-v1-test-token is invalid for private transcript text',
          },
        },
        401,
      ),
    );
    const historyRepository = createHistoryRepository();
    const provider = createProvider({ fetchImpl });

    let caughtError: unknown;
    try {
      await runTranscriptionFlow(
        { provider, historyRepository },
        {
          audio: {
            uri: 'file:///tmp/openrouter-auth-failure.m4a',
            base64Audio: 'BASE64_AUDIO_PAYLOAD',
            format: 'm4a',
          },
          sourceLanguageId: 'auto',
          modelPresetId: 'balanced',
          cleanupEnabled: false,
        },
      );
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toEqual(
      expect.objectContaining({
        category: 'auth_error',
        provider: 'openrouter',
        retryable: false,
      }),
    );
    expectSerializedErrorToBeSanitized(caughtError);
    expect(historyRepository.createHistoryItem).not.toHaveBeenCalled();
  });

  it('maps OpenRouter rate limits without exposing token or provider payload details', async () => {
    const fetchImpl = createFetchMock(
      jsonResponse(
        {
          error: {
            code: 'rate_limit_exceeded',
            message:
              'raw provider payload Bearer sk-or-v1-test-token BASE64_AUDIO_PAYLOAD private transcript text',
          },
        },
        429,
      ),
    );
    const historyRepository = createHistoryRepository();
    const provider = createProvider({ fetchImpl });

    let caughtError: unknown;
    try {
      await runTranslationFlow(
        { provider, historyRepository },
        {
          sourceType: 'manual',
          text: 'private transcript text',
          sourceLanguageId: 'english',
          targetLanguageId: 'spanish',
          modelPresetId: 'balanced',
        },
      );
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toEqual(
      expect.objectContaining({
        category: 'rate_limited',
        provider: 'openrouter',
        retryable: true,
      }),
    );
    expectSerializedErrorToBeSanitized(caughtError);
    expect(historyRepository.createHistoryItem).not.toHaveBeenCalled();
  });

  it('maps malformed OpenRouter responses without exposing raw response payloads', async () => {
    const fetchImpl = createFetchMock(
      jsonResponse({
        choices: [{ message: { content: { text: 'raw provider payload sk-or-v1-test-token' } } }],
      }),
    );
    const historyRepository = createHistoryRepository();
    const provider = createProvider({ fetchImpl });

    let caughtError: unknown;
    try {
      await runTranslationFlow(
        { provider, historyRepository },
        {
          sourceType: 'manual',
          text: 'private transcript text',
          sourceLanguageId: 'english',
          targetLanguageId: 'arabic',
          modelPresetId: 'best_quality',
        },
      );
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toEqual(
      expect.objectContaining({
        category: 'malformed_response',
        provider: 'openrouter',
        retryable: false,
      }),
    );
    expectSerializedErrorToBeSanitized(caughtError);
    expect(historyRepository.createHistoryItem).not.toHaveBeenCalled();
  });
});
