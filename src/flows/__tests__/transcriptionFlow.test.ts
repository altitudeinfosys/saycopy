import { runTranscriptionFlow } from '../transcriptionFlow';
import { createAppError } from '../../domain/errors';

describe('runTranscriptionFlow', () => {
  it('transcribes audio, cleans the transcript, auto-saves visible text, and cleans up temporary audio', async () => {
    const provider = {
      transcribeAudio: jest.fn().mockResolvedValue({
        text: 'hello world from raw audio',
        modelId: 'openai/whisper-large-v3',
      }),
      cleanupTranscript: jest.fn().mockResolvedValue({
        text: 'Hello world from raw audio.',
        modelId: 'openai/gpt-4.1-mini',
      }),
    };
    const historyRepository = {
      createHistoryItem: jest.fn().mockResolvedValue({
        id: 'history-1',
        mode: 'transcribe',
        sourceType: 'voice',
        sourceLanguageId: 'english',
        transcript: 'Hello world from raw audio.',
        createdAt: '2026-07-05T12:00:00.000Z',
      }),
    };
    const temporaryAudio = {
      cleanup: jest.fn().mockResolvedValue(undefined),
    };

    const result = await runTranscriptionFlow(
      { provider, historyRepository, temporaryAudio },
      {
        audio: {
          uri: 'file:///tmp/recording.m4a',
          base64Audio: 'base64-audio',
          format: 'm4a',
        },
        sourceLanguageId: 'english',
        modelPresetId: 'balanced',
        cleanupEnabled: true,
      },
    );

    expect(provider.transcribeAudio).toHaveBeenCalledWith({
      audio: {
        uri: 'file:///tmp/recording.m4a',
        base64Audio: 'base64-audio',
        format: 'm4a',
      },
      sourceLanguageId: 'english',
      modelPresetId: 'balanced',
    });
    expect(provider.cleanupTranscript).toHaveBeenCalledWith({
      text: 'hello world from raw audio',
      sourceLanguageId: 'english',
      modelPresetId: 'balanced',
    });
    expect(historyRepository.createHistoryItem).toHaveBeenCalledWith({
      mode: 'transcribe',
      sourceType: 'voice',
      sourceLanguageId: 'english',
      primaryText: 'Hello world from raw audio.',
      modelPresetId: 'balanced',
      sttModelId: 'openai/whisper-large-v3',
    });
    expect(temporaryAudio.cleanup).toHaveBeenCalledWith({
      uri: 'file:///tmp/recording.m4a',
      base64Audio: 'base64-audio',
      format: 'm4a',
    });
    expect(result).toEqual({
      status: 'success',
      transcript: 'Hello world from raw audio.',
      historyItem: {
        id: 'history-1',
        mode: 'transcribe',
        sourceType: 'voice',
        sourceLanguageId: 'english',
        transcript: 'Hello world from raw audio.',
        createdAt: '2026-07-05T12:00:00.000Z',
      },
    });
  });

  it('falls back to raw visible text, saves it, and cleans up audio when cleanup fails', async () => {
    const provider = {
      transcribeAudio: jest.fn().mockResolvedValue({
        text: 'raw transcript without cleanup',
        modelId: 'openai/whisper-large-v3',
      }),
      cleanupTranscript: jest.fn().mockRejectedValue(
        createAppError('provider_unavailable', 'OpenRouter is temporarily unavailable.', {
          provider: 'openrouter',
          retryable: true,
        }),
      ),
    };
    const historyRepository = {
      createHistoryItem: jest.fn().mockResolvedValue({
        id: 'history-raw',
        mode: 'transcribe',
        sourceType: 'voice',
        sourceLanguageId: 'auto',
        transcript: 'raw transcript without cleanup',
        createdAt: '2026-07-05T12:05:00.000Z',
      }),
    };
    const temporaryAudio = {
      cleanup: jest.fn().mockResolvedValue(undefined),
    };

    const result = await runTranscriptionFlow(
      { provider, historyRepository, temporaryAudio },
      {
        audio: {
          uri: 'file:///tmp/raw-recording.m4a',
          base64Audio: 'raw-base64-audio',
          format: 'm4a',
        },
        sourceLanguageId: 'auto',
        modelPresetId: 'fast',
        cleanupEnabled: true,
      },
    );

    expect(historyRepository.createHistoryItem).toHaveBeenCalledWith({
      mode: 'transcribe',
      sourceType: 'voice',
      sourceLanguageId: 'auto',
      primaryText: 'raw transcript without cleanup',
      modelPresetId: 'fast',
      sttModelId: 'openai/whisper-large-v3',
    });
    expect(temporaryAudio.cleanup).toHaveBeenCalledWith({
      uri: 'file:///tmp/raw-recording.m4a',
      base64Audio: 'raw-base64-audio',
      format: 'm4a',
    });
    expect(result).toEqual({
      status: 'cleanup_failed',
      transcript: 'raw transcript without cleanup',
      notice: {
        code: 'cleanup_failed',
        message: 'Cleanup failed. Showing the raw transcript.',
      },
      historyItem: {
        id: 'history-raw',
        mode: 'transcribe',
        sourceType: 'voice',
        sourceLanguageId: 'auto',
        transcript: 'raw transcript without cleanup',
        createdAt: '2026-07-05T12:05:00.000Z',
      },
    });
  });

  it('propagates sanitized provider errors without saving raw error payloads', async () => {
    const sanitizedError = createAppError('missing_token', 'OpenRouter API token is required.', {
      provider: 'openrouter',
      retryable: false,
    });
    const provider = {
      transcribeAudio: jest.fn().mockRejectedValue(sanitizedError),
      cleanupTranscript: jest.fn(),
    };
    const historyRepository = {
      createHistoryItem: jest.fn(),
    };
    const temporaryAudio = {
      cleanup: jest.fn().mockResolvedValue(undefined),
    };

    await expect(
      runTranscriptionFlow(
        { provider, historyRepository, temporaryAudio },
        {
          audio: {
            uri: 'file:///tmp/missing-token.m4a',
            base64Audio: 'sensitive-base64-audio',
            format: 'm4a',
          },
          sourceLanguageId: 'auto',
          modelPresetId: 'balanced',
          cleanupEnabled: true,
        },
      ),
    ).rejects.toBe(sanitizedError);

    expect(provider.cleanupTranscript).not.toHaveBeenCalled();
    expect(historyRepository.createHistoryItem).not.toHaveBeenCalled();
    expect(temporaryAudio.cleanup).toHaveBeenCalledWith({
      uri: 'file:///tmp/missing-token.m4a',
      base64Audio: 'sensitive-base64-audio',
      format: 'm4a',
    });
    expect(sanitizedError).toEqual({
      category: 'missing_token',
      message: 'OpenRouter API token is required.',
      provider: 'openrouter',
      retryable: false,
    });
  });
});
