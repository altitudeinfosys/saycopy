import type { ConcreteLanguageId, LanguageId } from './languages';

export type TranscriptionLanguageSupport = 'supported' | 'preview' | 'unsupported' | 'unverified';

export const AUTO_DETECT_TRANSCRIPTION_MODEL_ID = 'openai/whisper-large-v3';

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

const VERIFIED_AUTO_DETECT_MODELS: ReadonlySet<string> = new Set([
  'google/chirp-3',
  'microsoft/mai-transcribe-1.5',
  AUTO_DETECT_TRANSCRIPTION_MODEL_ID,
  'openai/whisper-large-v3-turbo',
]);

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
    if (VERIFIED_AUTO_DETECT_MODELS.has(modelId)) {
      return modelId === 'google/chirp-3' ? 'preview' : 'supported';
    }

    return VERIFIED_MODEL_LANGUAGE_SUPPORT[modelId] ? 'unsupported' : 'unverified';
  }

  return VERIFIED_MODEL_LANGUAGE_SUPPORT[modelId]?.[sourceLanguageId] ?? 'unverified';
}

export function isKnownCompatibleTranscriptionModel(
  modelId: string,
  sourceLanguageId: LanguageId,
): boolean {
  const support = getTranscriptionLanguageSupport(modelId, sourceLanguageId);

  if (sourceLanguageId === 'auto') {
    return support === 'supported' || support === 'preview';
  }

  return support !== 'unsupported';
}

export function resolveTranscriptionModelId(
  modelId: string | undefined,
  sourceLanguageId: LanguageId,
): string {
  const requestedModelId = modelId?.trim() || AUTO_DETECT_TRANSCRIPTION_MODEL_ID;

  if (
    sourceLanguageId === 'auto' &&
    !isKnownCompatibleTranscriptionModel(requestedModelId, sourceLanguageId)
  ) {
    return AUTO_DETECT_TRANSCRIPTION_MODEL_ID;
  }

  return requestedModelId;
}

export function getTranscriptionLanguageBadge(
  modelId: string,
  sourceLanguageId: LanguageId,
): string {
  if (sourceLanguageId === 'auto') {
    const support = getTranscriptionLanguageSupport(modelId, sourceLanguageId);

    switch (support) {
      case 'supported':
        return 'Auto-detect supported';
      case 'preview':
        return 'Auto-detect preview';
      case 'unsupported':
        return 'Choose a language';
      default:
        return 'Auto-detect unverified';
    }
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
