export type ModelPresetId = 'fast' | 'balanced' | 'best_quality';

export type ModelPreset = {
  readonly id: ModelPresetId;
  readonly label: string;
  readonly description: string;
  readonly currentModelCandidate: string;
  readonly fallbackModelCandidate: string;
};

export const MODEL_PRESETS = [
  {
    id: 'fast',
    label: 'Fast',
    description: 'Prioritizes quick responses for everyday transcription and translation.',
    currentModelCandidate: 'google/gemini-3.1-flash-lite',
    fallbackModelCandidate: 'openai/gpt-4o-mini',
  },
  {
    id: 'balanced',
    label: 'Balanced',
    description: 'Balances response speed, quality, and cost for the default experience.',
    currentModelCandidate: 'openai/gpt-4.1-mini',
    fallbackModelCandidate: 'google/gemini-2.5-flash',
  },
  {
    id: 'best_quality',
    label: 'Best Quality',
    description: 'Prioritizes highest quality output for difficult audio or translation needs.',
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
