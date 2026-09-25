import * as Speech from 'expo-speech';

import { toOpenRouterLanguageCode, type ConcreteLanguageId } from '../domain/languages';

export type SpeakOutcome = 'started' | 'no_voice';

export type SpeechPlayer = {
  /** Reads text aloud in the language's voice, stopping anything already playing. */
  readonly speak: (text: string, languageId: ConcreteLanguageId) => Promise<SpeakOutcome>;
  readonly stop: () => Promise<void>;
};

type SpeechModule = Pick<typeof Speech, 'getAvailableVoicesAsync' | 'speak' | 'stop'>;

export const SPEECH_LOCALES: Readonly<Record<ConcreteLanguageId, string>> = {
  english: 'en-US',
  spanish: 'es-ES',
  arabic: 'ar-SA',
  french: 'fr-FR',
  german: 'de-DE',
  italian: 'it-IT',
  portuguese: 'pt-BR',
  chinese: 'zh-CN',
  japanese: 'ja-JP',
  korean: 'ko-KR',
  hindi: 'hi-IN',
};

function voiceMatchesLanguage(voiceLanguage: string, languageCode: string): boolean {
  const normalized = voiceLanguage.toLowerCase().replace('_', '-');

  return normalized === languageCode || normalized.startsWith(`${languageCode}-`);
}

export function createSpeechPlayer(speech: SpeechModule = Speech): SpeechPlayer {
  return {
    async speak(text, languageId) {
      const languageCode = toOpenRouterLanguageCode(languageId) ?? 'en';

      await speech.stop();

      let voices: readonly { readonly language: string }[] = [];
      try {
        voices = await speech.getAvailableVoicesAsync();
      } catch {
        // Some devices cannot list voices; let the system pick one.
      }

      // An empty list means the platform did not report voices, not that none exist.
      const hasMatchingVoice = voices.some((voice) =>
        voiceMatchesLanguage(voice.language, languageCode),
      );
      if (voices.length > 0 && !hasMatchingVoice) {
        return 'no_voice';
      }

      speech.speak(text, { language: SPEECH_LOCALES[languageId] });

      return 'started';
    },
    async stop() {
      await speech.stop();
    },
  };
}
