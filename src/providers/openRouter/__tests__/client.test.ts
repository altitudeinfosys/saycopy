import { getModelPreset } from '../../../domain/modelPresets';
import { createOpenRouterClient, type OpenRouterFetch } from '../client';
import {
  buildCleanupChatRequest,
  buildTranscriptionRequest,
  type OpenRouterRequestDescriptor,
} from '../requests';

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

function createFetchMock(response: MockResponse): jest.MockedFunction<OpenRouterFetch> {
  return jest.fn<ReturnType<OpenRouterFetch>, Parameters<OpenRouterFetch>>(async () => response);
}

describe('OpenRouter client', () => {
  const transcriptionRequest = buildTranscriptionRequest({
    base64Audio: 'BASE64_AUDIO',
    format: 'm4a',
    languageId: 'english',
  });

  const chatRequest = buildCleanupChatRequest({
    text: ' hello ',
    modelPreset: getModelPreset('balanced'),
  });

  it('fails before network when the token is missing', async () => {
    const fetchImpl = createFetchMock(jsonResponse({ text: 'ignored' }));
    const client = createOpenRouterClient({
      fetch: fetchImpl,
      getToken: async () => '   ',
    });

    await expect(client.requestTranscription(transcriptionRequest)).rejects.toEqual(
      expect.objectContaining({
        category: 'missing_token',
        provider: 'openrouter',
        retryable: false,
      }),
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('posts transcription requests with auth and parses text responses', async () => {
    const fetchImpl = createFetchMock(jsonResponse({ text: 'Hello world.' }));
    const client = createOpenRouterClient({
      fetch: fetchImpl,
      getToken: async () => 'sk-test-token',
      baseUrl: 'https://openrouter.test',
    });

    await expect(client.requestTranscription(transcriptionRequest)).resolves.toEqual({
      text: 'Hello world.',
    });

    expect(fetchImpl).toHaveBeenCalledWith('https://openrouter.test/api/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer sk-test-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(transcriptionRequest.body),
      signal: expect.any(Object),
    });
  });

  it('posts chat requests with auth and parses assistant content responses', async () => {
    const fetchImpl = createFetchMock(
      jsonResponse({
        choices: [{ message: { content: 'Hello.' } }],
      }),
    );
    const client = createOpenRouterClient({
      fetch: fetchImpl,
      getToken: async () => 'sk-test-token',
      baseUrl: 'https://openrouter.test/',
    });

    await expect(client.requestChatCompletion(chatRequest)).resolves.toEqual({
      content: 'Hello.',
    });

    expect(fetchImpl).toHaveBeenCalledWith('https://openrouter.test/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer sk-test-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(chatRequest.body),
      signal: expect.any(Object),
    });
  });

  it('maps HTTP errors through the OpenRouter error mapper', async () => {
    const fetchImpl = createFetchMock(
      jsonResponse({ error: { message: 'raw sk-test-token payload' } }, 429),
    );
    const client = createOpenRouterClient({
      fetch: fetchImpl,
      getToken: async () => 'sk-test-token',
    });

    await expect(client.requestTranscription(transcriptionRequest)).rejects.toEqual(
      expect.objectContaining({
        category: 'rate_limited',
        provider: 'openrouter',
        retryable: true,
      }),
    );
  });

  it('maps network failures through the OpenRouter error mapper', async () => {
    const fetchImpl = jest.fn(async () => {
      throw new TypeError('Network request failed with sk-test-token');
    });
    const client = createOpenRouterClient({
      fetch: fetchImpl,
      getToken: async () => 'sk-test-token',
    });

    await expect(client.requestTranscription(transcriptionRequest)).rejects.toEqual(
      expect.objectContaining({
        category: 'network_unavailable',
        provider: 'openrouter',
        retryable: true,
      }),
    );
  });

  it('maps malformed JSON and malformed success shapes', async () => {
    const malformedJsonFetch = createFetchMock({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token');
      },
    });
    const malformedShapeFetch = createFetchMock(jsonResponse({ choices: [] }));

    await expect(
      createOpenRouterClient({
        fetch: malformedJsonFetch,
        getToken: async () => 'sk-test-token',
      }).requestTranscription(transcriptionRequest),
    ).rejects.toEqual(expect.objectContaining({ category: 'malformed_response' }));

    await expect(
      createOpenRouterClient({
        fetch: malformedShapeFetch,
        getToken: async () => 'sk-test-token',
      }).requestChatCompletion(chatRequest),
    ).rejects.toEqual(expect.objectContaining({ category: 'malformed_response' }));
  });

  it('aborts requests after the configured timeout', async () => {
    jest.useFakeTimers();

    try {
      const fetchImpl: jest.MockedFunction<OpenRouterFetch> = jest.fn(
        async (_url, init) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => {
              reject(new DOMException('Request aborted', 'AbortError'));
            });
          }),
      );
      const client = createOpenRouterClient({
        fetch: fetchImpl,
        getToken: async () => 'sk-test-token',
        timeoutMs: 50,
      });

      const result = client.requestTranscription(transcriptionRequest);
      await Promise.resolve();
      jest.advanceTimersByTime(50);

      await expect(result).rejects.toEqual(
        expect.objectContaining({
          category: 'timeout',
          provider: 'openrouter',
          retryable: true,
        }),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('preserves request descriptor body typing for callers', () => {
    if (false) {
      const wrongRequest: OpenRouterRequestDescriptor<{ readonly wrong: true }> = {
        path: '/api/v1/audio/transcriptions',
        method: 'POST',
        body: { wrong: true },
      };
      const client = createOpenRouterClient({
        fetch: createFetchMock(jsonResponse({ text: 'ignored' })),
        getToken: async () => 'sk-test-token',
      });

      // @ts-expect-error Transcription calls require a transcription request descriptor.
      client.requestTranscription(wrongRequest);
    }
  });
});
