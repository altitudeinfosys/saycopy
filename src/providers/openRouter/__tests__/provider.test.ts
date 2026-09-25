import { createOpenRouterProvider } from '../provider';

describe('OpenRouter provider', () => {
  it('marks an abnormal cleanup completion as non-retryable', async () => {
    const provider = createOpenRouterProvider({
      client: {
        requestTranscription: jest.fn(),
        requestChatCompletion: jest.fn().mockResolvedValue({
          content: 'Partial cleanup',
          finishReason: 'error',
        }),
      },
    });

    await expect(
      provider.cleanupTranscript({
        text: 'The complete raw transcription.',
        sourceLanguageId: 'english',
        modelPresetId: 'balanced',
      }),
    ).rejects.toMatchObject({
      category: 'malformed_response',
      provider: 'openrouter',
      retryable: false,
      cause: { finishReason: 'error' },
    });
  });

  it('rejects an empty normal cleanup response as a retryable provider failure', async () => {
    const provider = createOpenRouterProvider({
      client: {
        requestTranscription: jest.fn(),
        requestChatCompletion: jest.fn().mockResolvedValue({
          content: '   ',
          finishReason: 'stop',
        }),
      },
    });

    await expect(
      provider.cleanupTranscript({
        text: 'The complete raw transcription.',
        sourceLanguageId: 'english',
        modelPresetId: 'balanced',
      }),
    ).rejects.toMatchObject({
      category: 'malformed_response',
      provider: 'openrouter',
      retryable: true,
    });
  });

  it.each([
    [{ content: 'Buenos', finishReason: 'length' }, 'cut the translation short', false],
    [{ content: '  ', finishReason: 'stop' }, 'empty translation', true],
  ] as const)(
    'rejects an unusable translation response (%o)',
    async (response, message, retryable) => {
      const provider = createOpenRouterProvider({
        client: {
          requestTranscription: jest.fn(),
          requestChatCompletion: jest.fn().mockResolvedValue(response),
        },
      });

      await expect(
        provider.translateText({
          text: 'Good morning, everyone.',
          sourceLanguageId: 'english',
          targetLanguageId: 'spanish',
          modelPresetId: 'balanced',
        }),
      ).rejects.toMatchObject({
        category: 'malformed_response',
        message: expect.stringContaining(message),
        retryable,
      });
    },
  );

  it('sends the source language with translation requests', async () => {
    const requestChatCompletion = jest
      .fn()
      .mockResolvedValue({ content: 'Buenos días', finishReason: 'stop' });
    const provider = createOpenRouterProvider({
      client: { requestTranscription: jest.fn(), requestChatCompletion },
    });

    await expect(
      provider.translateText({
        text: 'Good morning',
        sourceLanguageId: 'english',
        targetLanguageId: 'spanish',
        modelPresetId: 'balanced',
      }),
    ).resolves.toEqual({ text: 'Buenos días', modelId: 'openai/gpt-4.1-mini' });
    expect(requestChatCompletion.mock.calls[0][0].body.messages[0].content).toContain(
      'from English into Spanish',
    );
  });
});
