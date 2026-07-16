import { createOpenRouterModelCatalog } from '../modelCatalog';

describe('OpenRouter model catalog', () => {
  function createSuccessfulFetch() {
    return jest.fn(async () => ({
      ok: true,
      json: async () => ({
        data: [
          { id: 'zeta/model', name: 'Zeta Model' },
          { id: 'alpha/model', name: 'Alpha Model' },
          { id: '', name: 'Ignored' },
        ],
      }),
    }));
  }

  it('returns valid text models sorted by display name and restricted to ZDR routing', async () => {
    const fetchImpl = createSuccessfulFetch();

    await expect(createOpenRouterModelCatalog(fetchImpl).listTextModels()).resolves.toEqual([
      { id: 'alpha/model', name: 'Alpha Model' },
      { id: 'zeta/model', name: 'Zeta Model' },
    ]);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/models?output_modalities=text&sort=most-popular&zdr=true',
    );
  });

  it('returns transcription models from the dedicated ZDR-compatible catalog', async () => {
    const fetchImpl = createSuccessfulFetch();

    await expect(
      createOpenRouterModelCatalog(fetchImpl).listTranscriptionModels(),
    ).resolves.toEqual([
      { id: 'alpha/model', name: 'Alpha Model' },
      { id: 'zeta/model', name: 'Zeta Model' },
    ]);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/models?output_modalities=transcription&sort=most-popular&zdr=true',
    );
  });

  it('uses a model ID as its display name when the catalog omits a name', async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        data: [{ id: 'alpha/model' }],
      }),
    }));

    await expect(createOpenRouterModelCatalog(fetchImpl).listTextModels()).resolves.toEqual([
      { id: 'alpha/model', name: 'alpha/model' },
    ]);
  });

  it('rejects an unreadable catalog response', async () => {
    const catalog = createOpenRouterModelCatalog(async () => ({
      ok: true,
      json: async () => ({ data: 'not-an-array' }),
    }));

    await expect(catalog.listTextModels()).rejects.toThrow('Could not read OpenRouter models.');
  });
});
