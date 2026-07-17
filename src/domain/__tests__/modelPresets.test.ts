import {
  DEFAULT_MODEL_PRESET,
  DEFAULT_MODEL_PRESET_ID,
  MODEL_PRESETS,
  getModelPreset,
  isModelPresetId,
  type ModelPresetId,
} from '../modelPresets';

describe('model preset domain', () => {
  it('exposes the approved model preset registry', () => {
    expect(MODEL_PRESETS).toEqual([
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
    ]);
  });

  it('uses Balanced as the default preset', () => {
    expect(DEFAULT_MODEL_PRESET_ID).toBe('balanced');
    expect(DEFAULT_MODEL_PRESET).toBe(getModelPreset('balanced'));
  });

  it('keeps preset ids stable', () => {
    const ids = MODEL_PRESETS.map((preset) => preset.id);
    const expectedIds: ModelPresetId[] = ['fast', 'balanced', 'best_quality'];

    expect(ids).toEqual(expectedIds);
  });

  it('checks whether persisted string values are model preset ids', () => {
    expect(isModelPresetId('fast')).toBe(true);
    expect(isModelPresetId('balanced')).toBe(true);
    expect(isModelPresetId('best_quality')).toBe(true);
    expect(isModelPresetId('ultra')).toBe(false);
  });
});
