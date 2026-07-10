export type OpenRouterCatalogModel = {
  readonly id: string;
  readonly name: string;
};

export type OpenRouterModelCatalog = {
  listTextModels(): Promise<readonly OpenRouterCatalogModel[]>;
  listTranscriptionModels(): Promise<readonly OpenRouterCatalogModel[]>;
};

type FetchResponse = {
  readonly ok: boolean;
  readonly json: () => Promise<unknown>;
};

type FetchLike = (url: string) => Promise<FetchResponse>;

const MODELS_URL = 'https://openrouter.ai/api/v1/models?output_modalities=text&sort=most-popular';
const TRANSCRIPTION_MODEL_FALLBACKS: readonly OpenRouterCatalogModel[] = [
  { id: 'openai/gpt-4o-transcribe', name: 'OpenAI: GPT-4o Transcribe' },
  { id: 'openai/whisper-large-v3', name: 'OpenAI: Whisper Large V3' },
  { id: 'openai/whisper-large-v3-turbo', name: 'OpenAI: Whisper Large V3 Turbo' },
];

export function createOpenRouterModelCatalog(fetchImpl: FetchLike = fetch): OpenRouterModelCatalog {
  return {
    async listTextModels() {
      return listModels(fetchImpl);
    },
    async listTranscriptionModels() {
      try {
        const catalogModels = await listModels(fetchImpl);
        const speechToTextModels = catalogModels.filter((model) =>
          /(?:transcribe|whisper|chirp)/i.test(model.id),
        );

        return mergeModels(TRANSCRIPTION_MODEL_FALLBACKS, speechToTextModels);
      } catch {
        return TRANSCRIPTION_MODEL_FALLBACKS;
      }
    },
  };
}

function mergeModels(
  primaryModels: readonly OpenRouterCatalogModel[],
  additionalModels: readonly OpenRouterCatalogModel[],
): readonly OpenRouterCatalogModel[] {
  const modelsById = new Map<string, OpenRouterCatalogModel>();

  for (const model of [...primaryModels, ...additionalModels]) {
    modelsById.set(model.id, model);
  }

  return [...modelsById.values()].sort((left, right) => left.name.localeCompare(right.name));
}

async function listModels(fetchImpl: FetchLike): Promise<readonly OpenRouterCatalogModel[]> {
  const response = await fetchImpl(MODELS_URL);
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
