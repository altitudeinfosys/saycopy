import { getModelPreset } from '../../../domain/modelPresets';
import {
  buildCleanupChatRequest,
  buildTranscriptionRequest,
  buildTranslationChatRequest,
} from '../requests';

describe('OpenRouter request builders', () => {
  describe('buildTranscriptionRequest', () => {
    it('builds the required English transcription request body', () => {
      expect(
        buildTranscriptionRequest({
          base64Audio: 'BASE64_AUDIO',
          format: 'm4a',
          languageId: 'english',
        }),
      ).toEqual({
        path: '/api/v1/audio/transcriptions',
        method: 'POST',
        body: {
          model: 'openai/whisper-large-v3',
          input_audio: { data: 'BASE64_AUDIO', format: 'm4a' },
          language: 'en',
        },
      });
    });

    it('includes OpenRouter language codes for concrete STT languages', () => {
      expect(
        buildTranscriptionRequest({
          base64Audio: 'AUDIO',
          format: 'm4a',
          languageId: 'spanish',
        }).body,
      ).toMatchObject({ language: 'es' });

      expect(
        buildTranscriptionRequest({
          base64Audio: 'AUDIO',
          format: 'm4a',
          languageId: 'arabic',
        }).body,
      ).toMatchObject({ language: 'ar' });
    });

    it('omits language for auto-detect transcription', () => {
      expect(
        buildTranscriptionRequest({
          base64Audio: 'AUDIO',
          format: 'm4a',
          languageId: 'auto',
        }).body,
      ).not.toHaveProperty('language');
    });
  });

  describe('buildCleanupChatRequest', () => {
    it('builds a low-temperature chat request with the selected model preset', () => {
      const request = buildCleanupChatRequest({
        text: ' um hello world ',
        modelPreset: getModelPreset('fast'),
      });

      expect(request.path).toBe('/api/v1/chat/completions');
      expect(request.method).toBe('POST');
      expect(request.body.model).toBe('google/gemini-3.1-flash-lite');
      expect(request.body.temperature).toBeLessThanOrEqual(0.2);
      expect(request.body.messages).toEqual([
        {
          role: 'system',
          content: expect.stringContaining('Return only the cleaned text'),
        },
        { role: 'user', content: ' um hello world ' },
      ]);
      expect(request.body.messages[0]?.content).toEqual(
        expect.stringContaining('punctuation, capitalization, spacing'),
      );
      expect(request.body.messages[0]?.content).toEqual(expect.stringContaining('preserve meaning'));
    });
  });

  describe('buildTranslationChatRequest', () => {
    it('builds a low-temperature chat request that requires a concrete target language', () => {
      const request = buildTranslationChatRequest({
        text: 'Good morning',
        targetLanguageId: 'arabic',
        modelPreset: getModelPreset('balanced'),
      });

      expect(request).toEqual({
        path: '/api/v1/chat/completions',
        method: 'POST',
        body: {
          model: 'openai/gpt-4.1-mini',
          temperature: expect.any(Number),
          messages: [
            {
              role: 'system',
              content: expect.stringContaining('Translate the user text into Arabic'),
            },
            { role: 'user', content: 'Good morning' },
          ],
        },
      });
      expect(request.body.temperature).toBeLessThanOrEqual(0.2);
      expect(request.body.messages[0]?.content).toEqual(
        expect.stringContaining('Return only the translated text'),
      );
    });

    it('does not accept auto-detect as a translation target at compile time', () => {
      if (false) {
        buildTranslationChatRequest({
          text: 'Hello',
          modelPreset: getModelPreset('balanced'),
          // @ts-expect-error Translation targets must be concrete languages.
          targetLanguageId: 'auto',
        });
      }
    });
  });
});
