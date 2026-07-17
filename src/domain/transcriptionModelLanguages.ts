import type { ConcreteLanguageId, LanguageId } from './languages';
import { DEFAULT_TRANSCRIPTION_MODEL_ID } from './modelPresets';

export type TranscriptionLanguageSupport = 'supported' | 'preview' | 'unsupported' | 'unverified';

export const AUTO_DETECT_TRANSCRIPTION_MODEL_ID = 'openai/gpt-4o-transcribe';

type ModelLanguageSupport = Partial<
  Readonly<Record<ConcreteLanguageId, Exclude<TranscriptionLanguageSupport, 'unverified'>>>
>;

const VERIFIED_MODEL_LANGUAGE_SUPPORT: Readonly<Record<string, ModelLanguageSupport>> = {
  'openai/gpt-4o-transcribe': {
    english: 'supported',
    spanish: 'supported',
    arabic: 'supported',
  },
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
    return 'supported';
  }

  return VERIFIED_MODEL_LANGUAGE_SUPPORT[modelId]?.[sourceLanguageId] ?? 'unverified';
}

export function isKnownCompatibleTranscriptionModel(
  modelId: string,
  sourceLanguageId: LanguageId,
): boolean {
  if (sourceLanguageId === 'auto') {
    return true;
  }

  const support = getTranscriptionLanguageSupport(modelId, sourceLanguageId);
  return support !== 'unsupported';
}

export function resolveTranscriptionModelId(
  modelId: string | undefined,
  sourceLanguageId: LanguageId,
): string {
  if (sourceLanguageId === 'auto') {
    return AUTO_DETECT_TRANSCRIPTION_MODEL_ID;
  }

  return modelId?.trim() || DEFAULT_TRANSCRIPTION_MODEL_ID;
}

export function getTranscriptionLanguageBadge(
  modelId: string,
  sourceLanguageId: LanguageId,
): string {
  if (sourceLanguageId === 'auto') {
    return 'Preferred model for selected languages';
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
