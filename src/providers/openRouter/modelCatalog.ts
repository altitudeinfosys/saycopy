export type OpenRouterCatalogModel = {
  readonly id: string;
  readonly name: string;
};

export type OpenRouterModelCatalog = {
  listTranscriptionModels(): Promise<readonly OpenRouterCatalogModel[]>;
  listTextModels(): Promise<readonly OpenRouterCatalogModel[]>;
};

type FetchResponse = {
  readonly ok: boolean;
  readonly json: () => Promise<unknown>;
};

type FetchLike = (url: string) => Promise<FetchResponse>;

const TRANSCRIPTION_MODELS_URL =
  'https://openrouter.ai/api/v1/models?output_modalities=transcription&sort=most-popular&zdr=true';
const TEXT_MODELS_URL =
  'https://openrouter.ai/api/v1/models?output_modalities=text&sort=most-popular&zdr=true';

export function createOpenRouterModelCatalog(fetchImpl: FetchLike = fetch): OpenRouterModelCatalog {
  return {
    async listTranscriptionModels() {
      return listModels(fetchImpl, TRANSCRIPTION_MODELS_URL);
    },
    async listTextModels() {
      return listModels(fetchImpl, TEXT_MODELS_URL);
    },
  };
}

async function listModels(
  fetchImpl: FetchLike,
  modelsUrl: string,
): Promise<readonly OpenRouterCatalogModel[]> {
  const response = await fetchImpl(modelsUrl);
  if (!response.ok) {
    throw new Error('Could not load OpenRouter models.');
  }

  const payload = await response.json();
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    throw new Error('Could not read OpenRouter models.');
  }

  return payload.data
    .flatMap((model) => {
      if (!isRecord(model) || typeof model.id !== 'string' || !model.id.trim()) {
        return [];
      }

      return [
        {
          id: model.id,
          name: typeof model.name === 'string' && model.name.trim() ? model.name : model.id,
        },
      ];
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
