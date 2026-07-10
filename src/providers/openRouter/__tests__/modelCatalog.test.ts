import { createOpenRouterModelCatalog } from '../modelCatalog';

describe('OpenRouter model catalog', () => {
  it('returns valid text models sorted by display name', async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        data: [
          { id: 'zeta/model', name: 'Zeta Model' },
          { id: 'alpha/model', name: 'Alpha Model' },
          { id: '', name: 'Ignored' },
        ],
      }),
    }));

    await expect(createOpenRouterModelCatalog(fetchImpl).listTextModels()).resolves.toEqual([
      { id: 'alpha/model', name: 'Alpha Model' },
      { id: 'zeta/model', name: 'Zeta Model' },
    ]);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/models?output_modalities=text&sort=most-popular',
    );
  });

  it('rejects an unreadable catalog response', async () => {
    const catalog = createOpenRouterModelCatalog(async () => ({
      ok: true,
      json: async () => ({ data: 'not-an-array' }),
    }));

    await expect(catalog.listTextModels()).rejects.toThrow('Could not read OpenRouter models.');
  });

  it('includes supported transcription models even when the general catalog omits them', async () => {
    const catalog = createOpenRouterModelCatalog(async () => ({
      ok: true,
      json: async () => ({
        data: [
          { id: 'openai/whisper-large-v3', name: 'Whisper Large V3' },
          { id: 'openai/gpt-4o-transcribe', name: 'GPT-4o Transcribe' },
          { id: 'openai/gpt-4.1-mini', name: 'GPT-4.1 Mini' },
        ],
      }),
    }));

    await expect(catalog.listTranscriptionModels()).resolves.toEqual([
      { id: 'openai/gpt-4o-transcribe', name: 'GPT-4o Transcribe' },
      { id: 'openai/whisper-large-v3-turbo', name: 'OpenAI: Whisper Large V3 Turbo' },
      { id: 'openai/whisper-large-v3', name: 'Whisper Large V3' },
    ]);
  });

  it('keeps the supported transcription models available when the catalog cannot load', async () => {
    const catalog = createOpenRouterModelCatalog(async () => ({
      ok: false,
      json: async () => ({}),
    }));

    await expect(catalog.listTranscriptionModels()).resolves.toEqual([
      { id: 'openai/gpt-4o-transcribe', name: 'OpenAI: GPT-4o Transcribe' },
      { id: 'openai/whisper-large-v3', name: 'OpenAI: Whisper Large V3' },
      { id: 'openai/whisper-large-v3-turbo', name: 'OpenAI: Whisper Large V3 Turbo' },
    ]);
  });
});
