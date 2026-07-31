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
});
