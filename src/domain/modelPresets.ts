export type ModelPresetId = 'fast' | 'balanced' | 'best_quality';

export type ModelPreset = {
  readonly id: ModelPresetId;
  readonly label: string;
  readonly description: string;
  readonly currentModelCandidate: string;
  readonly fallbackModelCandidate: string;
};

export type TranscriptionModelRecommendation = {
  readonly label: string;
  readonly modelId: string;
};

export const DEFAULT_TRANSCRIPTION_MODEL_ID = 'openai/whisper-large-v3';

export const TRANSCRIPTION_MODEL_RECOMMENDATIONS = [
  {
    label: 'Fast',
    modelId: 'openai/whisper-large-v3-turbo',
  },
  {
    label: 'Recommended',
    modelId: DEFAULT_TRANSCRIPTION_MODEL_ID,
  },
  {
    label: 'Alternative',
    modelId: 'google/chirp-3',
  },
] as const satisfies readonly TranscriptionModelRecommendation[];

export const MODEL_PRESETS = [
  {
    id: 'fast',
    label: 'Fast',
    description: 'Prioritizes quick text cleanup and translation responses.',
    currentModelCandidate: 'google/gemini-3.1-flash-lite',
    fallbackModelCandidate: 'openai/gpt-4o-mini',
  },
  {
    id: 'balanced',
    label: 'Balanced',
    description: 'Balances text-processing speed, quality, and cost.',
    currentModelCandidate: 'openai/gpt-4.1-mini',
    fallbackModelCandidate: 'google/gemini-2.5-flash',
  },
  {
    id: 'best_quality',
    label: 'Best Quality',
    description: 'Prioritizes cleanup and translation quality over speed and cost.',
    currentModelCandidate: 'anthropic/claude-sonnet-4.6',
    fallbackModelCandidate: 'anthropic/claude-sonnet-4.5',
  },
] as const satisfies readonly ModelPreset[];

export const DEFAULT_MODEL_PRESET_ID = 'balanced' satisfies ModelPresetId;

export const DEFAULT_MODEL_PRESET = getModelPreset(DEFAULT_MODEL_PRESET_ID);

const MODEL_PRESET_ID_SET: ReadonlySet<string> = new Set(
  MODEL_PRESETS.map((modelPreset) => modelPreset.id),
);

export function isModelPresetId(value: string): value is ModelPresetId {
  return MODEL_PRESET_ID_SET.has(value);
}

export function getModelPreset(presetId: ModelPresetId): ModelPreset {
  const preset = MODEL_PRESETS.find((modelPreset) => modelPreset.id === presetId);

  if (!preset) {
    throw new Error(`Unknown model preset: ${presetId}`);
  }

  return preset;
}

export function normalizeCustomModelId(customModelId: string | undefined): string {
  return customModelId?.trim() ?? '';
}

export function getEffectiveChatModelId({
  customModelId,
  modelPresetId,
}: {
  readonly customModelId?: string;
  readonly modelPresetId: ModelPresetId;
}): string {
  const normalizedCustomModelId = normalizeCustomModelId(customModelId);

  return normalizedCustomModelId || getModelPreset(modelPresetId).currentModelCandidate;
}
