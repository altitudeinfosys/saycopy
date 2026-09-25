import {
  CONCRETE_LANGUAGE_IDS,
  getLanguageLabel,
  type ConcreteLanguageId,
  type LanguageId,
} from './languages';
import { DEFAULT_TRANSCRIPTION_MODEL_ID, TRANSCRIPTION_MODEL_RECOMMENDATIONS } from './modelPresets';

export type TranscriptionLanguageSupport = 'supported' | 'preview' | 'unsupported' | 'unverified';

export const AUTO_DETECT_TRANSCRIPTION_MODEL_ID = 'openai/gpt-4o-transcribe';

type ModelLanguageSupport = Partial<
  Readonly<Record<ConcreteLanguageId, Exclude<TranscriptionLanguageSupport, 'unverified'>>>
>;

const ALL_SUPPORTED: ModelLanguageSupport = {
  english: 'supported',
  spanish: 'supported',
  arabic: 'supported',
  french: 'supported',
  german: 'supported',
  italian: 'supported',
  portuguese: 'supported',
  chinese: 'supported',
  japanese: 'supported',
  korean: 'supported',
  hindi: 'supported',
};

// Checked against provider documentation on 2026-09-25. Languages a provider does not
// document stay out of this table so the app labels them "unverified" instead of guessing.
const VERIFIED_MODEL_LANGUAGE_SUPPORT: Readonly<Record<string, ModelLanguageSupport>> = {
  'openai/gpt-4o-transcribe': ALL_SUPPORTED,
  'deepgram/nova-3': ALL_SUPPORTED,
  'google/chirp-3': {
    ...ALL_SUPPORTED,
    arabic: 'preview',
  },
  'microsoft/mai-transcribe-1.5': ALL_SUPPORTED,
  'nvidia/parakeet-tdt-0.6b-v3': {
    english: 'supported',
    spanish: 'supported',
    french: 'supported',
    german: 'supported',
    italian: 'supported',
    portuguese: 'supported',
    arabic: 'unsupported',
    chinese: 'unsupported',
    japanese: 'unsupported',
    korean: 'unsupported',
    hindi: 'unsupported',
  },
  'openai/whisper-large-v3': ALL_SUPPORTED,
  'openai/whisper-large-v3-turbo': ALL_SUPPORTED,
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

  const languageLabel = getLanguageLabel(sourceLanguageId);
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

export type TranscriptionLanguageCoverage = {
  /** Languages the provider documents as supported, including preview. */
  readonly supportedCount: number;
  readonly totalCount: number;
  readonly unsupported: readonly ConcreteLanguageId[];
  readonly unverified: readonly ConcreteLanguageId[];
};

export function getTranscriptionLanguageCoverage(modelId: string): TranscriptionLanguageCoverage {
  const supportByLanguage = CONCRETE_LANGUAGE_IDS.map((languageId) => ({
    languageId,
    support: getTranscriptionLanguageSupport(modelId, languageId),
  }));

  return {
    supportedCount: supportByLanguage.filter(
      ({ support }) => support === 'supported' || support === 'preview',
    ).length,
    totalCount: CONCRETE_LANGUAGE_IDS.length,
    unsupported: supportByLanguage
      .filter(({ support }) => support === 'unsupported')
      .map(({ languageId }) => languageId),
    unverified: supportByLanguage
      .filter(({ support }) => support === 'unverified')
      .map(({ languageId }) => languageId),
  };
}

export function getTranscriptionLanguageCoverageLabel(modelId: string): string {
  const coverage = getTranscriptionLanguageCoverage(modelId);

  if (coverage.unverified.length === coverage.totalCount) {
    return 'Language coverage unverified';
  }

  if (coverage.supportedCount === coverage.totalCount) {
    return `All ${coverage.totalCount} app languages`;
  }

  const summary = `${coverage.supportedCount} of ${coverage.totalCount} app languages`;

  return coverage.unsupported.length > 0
    ? `${summary} · no ${coverage.unsupported.map(getLanguageLabel).join(', ')}`
    : summary;
}

/** Widest verified coverage first; ties keep their original order. */
export function sortByTranscriptionLanguageCoverage<T extends { readonly id: string }>(
  models: readonly T[],
): T[] {
  return models
    .map((model, index) => ({
      model,
      index,
      supportedCount: getTranscriptionLanguageCoverage(model.id).supportedCount,
    }))
    .sort((left, right) => right.supportedCount - left.supportedCount || left.index - right.index)
    .map(({ model }) => model);
}

/** The first recommended model that supports the language, for one-tap switching. */
export function getRecommendedTranscriptionModelForLanguage(
  languageId: LanguageId,
): string {
  if (languageId === 'auto') {
    return DEFAULT_TRANSCRIPTION_MODEL_ID;
  }

  return (
    TRANSCRIPTION_MODEL_RECOMMENDATIONS.find(
      (recommendation) =>
        getTranscriptionLanguageSupport(recommendation.modelId, languageId) === 'supported',
    )?.modelId ?? DEFAULT_TRANSCRIPTION_MODEL_ID
  );
}
