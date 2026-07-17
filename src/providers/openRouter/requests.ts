import {
  LANGUAGE_OPTIONS,
  toOpenRouterLanguageCode,
  type ConcreteLanguageId,
  type LanguageId,
} from '../../domain/languages';

export type OpenRouterAudioFormat = 'm4a';

export type OpenRouterRequestDescriptor<TBody> = {
  readonly path: string;
  readonly method: 'POST';
  readonly body: TBody;
};

export type OpenRouterTranscriptionRequestBody = {
  readonly model: string;
  readonly input_audio: {
    readonly data: string;
    readonly format: OpenRouterAudioFormat;
  };
  readonly language?: 'en' | 'es' | 'ar';
  readonly provider: OpenRouterProviderPreferences;
};

export type OpenRouterChatMessage = {
  readonly role: 'system' | 'user';
  readonly content: string;
};

export type OpenRouterChatRequestBody = {
  readonly model: string;
  readonly temperature: number;
  readonly messages: readonly OpenRouterChatMessage[];
  readonly provider: OpenRouterProviderPreferences;
};

export type OpenRouterProviderPreferences = {
  readonly zdr: true;
};

const TRANSCRIPTION_PATH = '/api/v1/audio/transcriptions';
const CHAT_COMPLETIONS_PATH = '/api/v1/chat/completions';
const WHISPER_MODEL = 'openai/whisper-large-v3';
const LOW_TEMPERATURE = 0.1;

export function buildTranscriptionRequest({
  base64Audio,
  format,
  languageId,
  modelId = WHISPER_MODEL,
}: {
  readonly base64Audio: string;
  readonly format: OpenRouterAudioFormat;
  readonly languageId: LanguageId;
  readonly modelId?: string;
}): OpenRouterRequestDescriptor<OpenRouterTranscriptionRequestBody> {
  const language = toOpenRouterLanguageCode(languageId);

  return {
    path: TRANSCRIPTION_PATH,
    method: 'POST',
    body: {
      model: modelId,
      input_audio: { data: base64Audio, format },
      ...(language ? { language } : {}),
      provider: { zdr: true },
    },
  };
}

export function buildCleanupChatRequest({
  modelId,
  text,
}: {
  readonly modelId: string;
  readonly text: string;
}): OpenRouterRequestDescriptor<OpenRouterChatRequestBody> {
  return buildChatRequest({
    modelId,
    systemPrompt:
      'Lightly clean up the transcription without translating it. Detect the language of the ' +
      'written input and return the result in exactly the same language and script. If the input ' +
      'is Arabic, keep it Arabic; if Spanish, keep it Spanish; if English, keep it English. ' +
      'Fix only punctuation, capitalization, spacing, obvious filler, and small transcription ' +
      'artifacts while you preserve meaning. Return only the cleaned text.',
    text,
  });
}

export function buildTranslationChatRequest({
  modelId,
  text,
  targetLanguageId,
}: {
  readonly modelId: string;
  readonly text: string;
  readonly targetLanguageId: ConcreteLanguageId;
}): OpenRouterRequestDescriptor<OpenRouterChatRequestBody> {
  const targetLanguage = getConcreteLanguageLabel(targetLanguageId);

  return buildChatRequest({
    modelId,
    systemPrompt: `Translate the user text into ${targetLanguage}. Return only the translated text.`,
    text,
  });
}

function buildChatRequest({
  modelId,
  systemPrompt,
  text,
}: {
  readonly modelId: string;
  readonly systemPrompt: string;
  readonly text: string;
}): OpenRouterRequestDescriptor<OpenRouterChatRequestBody> {
  return {
    path: CHAT_COMPLETIONS_PATH,
    method: 'POST',
    body: {
      model: modelId,
      temperature: LOW_TEMPERATURE,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
      provider: { zdr: true },
    },
  };
}

function getConcreteLanguageLabel(languageId: ConcreteLanguageId): string {
  const language = LANGUAGE_OPTIONS.find((option) => option.id === languageId);

  if (!language || language.id === 'auto') {
    throw new Error(`Unknown concrete language: ${languageId}`);
  }

  return language.label;
}
