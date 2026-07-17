import type { ConcreteLanguageId, LanguageId } from './languages';

export type TranscriptionLanguageSupport = 'supported' | 'preview' | 'unsupported' | 'unverified';

type ModelLanguageSupport = Partial<
  Readonly<Record<ConcreteLanguageId, Exclude<TranscriptionLanguageSupport, 'unverified'>>>
>;

const VERIFIED_MODEL_LANGUAGE_SUPPORT: Readonly<Record<string, ModelLanguageSupport>> = {
  'deepgram/nova-3': {
    english: 'supported',
    spanish: 'supported',
    arabic: 'supported',
  },
  'google/chirp-3': {
    english: 'supported',
    spanish: 'supported',
    arabic: 'preview',
  },
  'microsoft/mai-transcribe-1.5': {
    english: 'supported',
    spanish: 'supported',
    arabic: 'supported',
  },
  'nvidia/parakeet-tdt-0.6b-v3': {
    english: 'supported',
    spanish: 'supported',
    arabic: 'unsupported',
  },
  'openai/whisper-large-v3': {
    english: 'supported',
    spanish: 'supported',
    arabic: 'supported',
  },
  'openai/whisper-large-v3-turbo': {
    english: 'supported',
    spanish: 'supported',
    arabic: 'supported',
  },
};

const LANGUAGE_LABELS: Readonly<Record<ConcreteLanguageId, string>> = {
  english: 'English',
  spanish: 'Spanish',
  arabic: 'Arabic',
};

export function getTranscriptionLanguageSupport(
  modelId: string,
  sourceLanguageId: LanguageId,
): TranscriptionLanguageSupport {
  if (sourceLanguageId === 'auto') {
    return 'unverified';
  }

  return VERIFIED_MODEL_LANGUAGE_SUPPORT[modelId]?.[sourceLanguageId] ?? 'unverified';
}

export function isKnownCompatibleTranscriptionModel(
  modelId: string,
  sourceLanguageId: LanguageId,
): boolean {
  return getTranscriptionLanguageSupport(modelId, sourceLanguageId) !== 'unsupported';
}

export function getTranscriptionLanguageBadge(
  modelId: string,
  sourceLanguageId: LanguageId,
): string {
  if (sourceLanguageId === 'auto') {
    const support = VERIFIED_MODEL_LANGUAGE_SUPPORT[modelId];
    if (!support) {
      return 'Language support unverified';
    }

    return (Object.keys(LANGUAGE_LABELS) as ConcreteLanguageId[])
      .filter((languageId) => support[languageId] !== 'unsupported')
      .map((languageId) => LANGUAGE_LABELS[languageId])
      .join(' · ');
  }

  const languageLabel = LANGUAGE_LABELS[sourceLanguageId];
  const support = getTranscriptionLanguageSupport(modelId, sourceLanguageId);

  switch (support) {
    case 'supported':
      return `${languageLabel} supported`;
    case 'preview':
      return `${languageLabel} preview`;
    case 'unsupported':
      return `${languageLabel} not supported`;
    default:
      return `${languageLabel} support unverified`;
  }
}
