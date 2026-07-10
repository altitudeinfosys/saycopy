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
});
