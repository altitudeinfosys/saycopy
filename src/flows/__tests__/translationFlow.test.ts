import { runTranslationFlow } from '../translationFlow';
import { createAppError } from '../../domain/errors';

describe('runTranslationFlow', () => {
  it('transcribes voice input, translates it, saves translated primary text, and cleans up audio', async () => {
    const provider = {
      transcribeAudio: jest.fn().mockResolvedValue({
        text: 'good morning',
        modelId: 'openai/whisper-large-v3',
      }),
      translateText: jest.fn().mockResolvedValue({
        text: 'Buenos dias',
        modelId: 'openai/gpt-4.1-mini',
      }),
    };
    const historyRepository = {
      createHistoryItem: jest.fn().mockResolvedValue({
        id: 'translation-1',
        mode: 'translate',
        sourceType: 'voice',
        sourceLanguageId: 'english',
        targetLanguageId: 'spanish',
        transcript: 'good morning',
        translatedText: 'Buenos dias',
        createdAt: '2026-07-05T12:10:00.000Z',
      }),
    };
    const temporaryAudio = {
      cleanup: jest.fn().mockResolvedValue(undefined),
    };

    const result = await runTranslationFlow(
      { provider, historyRepository, temporaryAudio },
      {
        sourceType: 'voice',
        audio: {
          uri: 'file:///tmp/translate-voice.m4a',
          base64Audio: 'voice-base64',
          format: 'm4a',
        },
        sourceLanguageId: 'english',
        targetLanguageId: 'spanish',
        modelPresetId: 'balanced',
      },
    );

    expect(provider.transcribeAudio).toHaveBeenCalledWith({
      audio: {
        uri: 'file:///tmp/translate-voice.m4a',
        base64Audio: 'voice-base64',
        format: 'm4a',
      },
      sourceLanguageId: 'english',
      modelPresetId: 'balanced',
    });
    expect(provider.translateText).toHaveBeenCalledWith({
      text: 'good morning',
      sourceLanguageId: 'english',
      targetLanguageId: 'spanish',
      modelPresetId: 'balanced',
    });
    expect(historyRepository.createHistoryItem).toHaveBeenCalledWith({
      mode: 'translate',
      sourceType: 'voice',
      sourceLanguageId: 'english',
      targetLanguageId: 'spanish',
      primaryText: 'Buenos dias',
      sourceText: 'good morning',
      translatedText: 'Buenos dias',
      modelPresetId: 'balanced',
      sttModelId: 'openai/whisper-large-v3',
      textModelId: 'openai/gpt-4.1-mini',
    });
    expect(temporaryAudio.cleanup).toHaveBeenCalledWith({
      uri: 'file:///tmp/translate-voice.m4a',
      base64Audio: 'voice-base64',
      format: 'm4a',
    });
    expect(result).toEqual({
      status: 'success',
      sourceType: 'voice',
      sourceText: 'good morning',
      translatedText: 'Buenos dias',
      primaryText: 'Buenos dias',
      historyItem: {
        id: 'translation-1',
        mode: 'translate',
        sourceType: 'voice',
        sourceLanguageId: 'english',
        targetLanguageId: 'spanish',
        transcript: 'good morning',
        translatedText: 'Buenos dias',
        createdAt: '2026-07-05T12:10:00.000Z',
      },
    });
  });

  it('translates manual text, saves translated primary text, and does not call STT', async () => {
    const provider = {
      transcribeAudio: jest.fn(),
      translateText: jest.fn().mockResolvedValue({
        text: 'Buenos dias',
        modelId: 'openai/gpt-4.1-mini',
      }),
    };
    const historyRepository = {
      createHistoryItem: jest.fn().mockResolvedValue({
        id: 'translation-manual',
        mode: 'translate',
        sourceType: 'manual',
        sourceLanguageId: 'english',
        targetLanguageId: 'spanish',
        transcript: 'good morning',
        translatedText: 'Buenos dias',
        createdAt: '2026-07-05T12:15:00.000Z',
      }),
    };
    const temporaryAudio = {
      cleanup: jest.fn().mockResolvedValue(undefined),
    };

    const result = await runTranslationFlow(
      { provider, historyRepository, temporaryAudio },
      {
        sourceType: 'manual',
        text: 'good morning',
        sourceLanguageId: 'english',
        targetLanguageId: 'spanish',
        modelPresetId: 'best_quality',
      },
    );

    expect(provider.transcribeAudio).not.toHaveBeenCalled();
    expect(provider.translateText).toHaveBeenCalledWith({
      text: 'good morning',
      sourceLanguageId: 'english',
      targetLanguageId: 'spanish',
      modelPresetId: 'best_quality',
    });
    expect(historyRepository.createHistoryItem).toHaveBeenCalledWith({
      mode: 'translate',
      sourceType: 'manual',
      sourceLanguageId: 'english',
      targetLanguageId: 'spanish',
      primaryText: 'Buenos dias',
      sourceText: 'good morning',
      translatedText: 'Buenos dias',
      modelPresetId: 'best_quality',
      textModelId: 'openai/gpt-4.1-mini',
    });
    expect(temporaryAudio.cleanup).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 'success',
      sourceType: 'manual',
      sourceText: 'good morning',
      translatedText: 'Buenos dias',
      primaryText: 'Buenos dias',
      historyItem: {
        id: 'translation-manual',
        mode: 'translate',
        sourceType: 'manual',
        sourceLanguageId: 'english',
        targetLanguageId: 'spanish',
        transcript: 'good morning',
        translatedText: 'Buenos dias',
        createdAt: '2026-07-05T12:15:00.000Z',
      },
    });
  });

  it('returns original voice transcription for retry without saving when translation fails after STT', async () => {
    const translationError = createAppError(
      'rate_limited',
      'OpenRouter rate limit was reached. Try again shortly.',
      {
        provider: 'openrouter',
        retryable: true,
        cause: { httpStatus: 429, providerErrorCode: 'rate_limit' },
      },
    );
    const provider = {
      transcribeAudio: jest.fn().mockResolvedValue({
        text: 'retry this original text',
        modelId: 'openai/whisper-large-v3',
      }),
      translateText: jest.fn().mockRejectedValue(translationError),
    };
    const historyRepository = {
      createHistoryItem: jest.fn(),
    };
    const temporaryAudio = {
      cleanup: jest.fn().mockResolvedValue(undefined),
    };

    const result = await runTranslationFlow(
      { provider, historyRepository, temporaryAudio },
      {
        sourceType: 'voice',
        audio: {
          uri: 'file:///tmp/failed-translation.m4a',
          base64Audio: 'failed-translation-base64',
          format: 'm4a',
        },
        sourceLanguageId: 'english',
        targetLanguageId: 'spanish',
        modelPresetId: 'fast',
      },
    );

    expect(historyRepository.createHistoryItem).not.toHaveBeenCalled();
    expect(temporaryAudio.cleanup).toHaveBeenCalledWith({
      uri: 'file:///tmp/failed-translation.m4a',
      base64Audio: 'failed-translation-base64',
      format: 'm4a',
    });
    expect(result).toEqual({
      status: 'translation_failed',
      sourceType: 'voice',
      sourceText: 'retry this original text',
      primaryText: 'retry this original text',
      retry: {
        canRetry: true,
        text: 'retry this original text',
      },
      copyOriginal: {
        text: 'retry this original text',
      },
      error: translationError,
    });
  });

  it('preserves translation_failed retry result when temporary audio cleanup also fails', async () => {
    const translationError = createAppError(
      'provider_unavailable',
      'OpenRouter is temporarily unavailable.',
      {
        provider: 'openrouter',
        retryable: true,
      },
    );
    const cleanupError = new Error('Could not delete temporary audio');
    const provider = {
      transcribeAudio: jest.fn().mockResolvedValue({
        text: 'keep the original text',
        modelId: 'openai/whisper-large-v3',
      }),
      translateText: jest.fn().mockRejectedValue(translationError),
    };
    const historyRepository = {
      createHistoryItem: jest.fn(),
    };
    const temporaryAudio = {
      cleanup: jest.fn().mockRejectedValue(cleanupError),
    };
    const audio = {
      uri: 'file:///tmp/translation-cleanup-fails.m4a',
      base64Audio: 'translation-cleanup-fails-base64',
      format: 'm4a' as const,
    };

    const result = await runTranslationFlow(
      { provider, historyRepository, temporaryAudio },
      {
        sourceType: 'voice',
        audio,
        sourceLanguageId: 'english',
        targetLanguageId: 'spanish',
        modelPresetId: 'balanced',
      },
    );

    expect(historyRepository.createHistoryItem).not.toHaveBeenCalled();
    expect(temporaryAudio.cleanup).toHaveBeenCalledWith(audio);
    expect(result).toEqual({
      status: 'translation_failed',
      sourceType: 'voice',
      sourceText: 'keep the original text',
      primaryText: 'keep the original text',
      retry: {
        canRetry: true,
        text: 'keep the original text',
      },
      copyOriginal: {
        text: 'keep the original text',
      },
      error: translationError,
    });
  });
});
