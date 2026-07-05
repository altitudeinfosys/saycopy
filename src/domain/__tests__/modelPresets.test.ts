import {
  DEFAULT_MODEL_PRESET,
  DEFAULT_MODEL_PRESET_ID,
  MODEL_PRESETS,
  getModelPreset,
  type ModelPresetId,
} from '../modelPresets';

describe('model preset domain', () => {
  it('exposes the approved model preset registry', () => {
    expect(MODEL_PRESETS).toEqual([
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
});
