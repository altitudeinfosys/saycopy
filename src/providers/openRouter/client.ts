import { createAppError } from '../../domain/errors';
import {
  mapOpenRouterHttpError,
  mapOpenRouterMalformedResponseError,
  mapOpenRouterNetworkError,
  mapOpenRouterTimeoutError,
} from './errors';
import type {
  OpenRouterChatRequestBody,
  OpenRouterRequestDescriptor,
  OpenRouterTranscriptionRequestBody,
} from './requests';

export type OpenRouterFetchResponse = {
  readonly ok: boolean;
  readonly status: number;
  readonly json: () => Promise<unknown>;
};

export type OpenRouterFetchInit = {
  readonly method: 'POST';
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
  readonly signal?: AbortSignal;
};

export type OpenRouterFetch = (
  url: string,
  init: OpenRouterFetchInit,
) => Promise<OpenRouterFetchResponse>;

export type OpenRouterClientOptions = {
  readonly fetch: OpenRouterFetch;
  readonly getToken: () => Promise<string | null | undefined>;
  readonly baseUrl?: string;
  readonly timeoutMs?: number;
};

export type OpenRouterTranscriptionResult = {
  readonly text: string;
};

export type OpenRouterChatResult = {
  readonly content: string;
};

export type OpenRouterClient = {
  readonly requestTranscription: (
    request: OpenRouterRequestDescriptor<OpenRouterTranscriptionRequestBody>,
  ) => Promise<OpenRouterTranscriptionResult>;
  readonly requestChatCompletion: (
    request: OpenRouterRequestDescriptor<OpenRouterChatRequestBody>,
  ) => Promise<OpenRouterChatResult>;
};

const DEFAULT_BASE_URL = 'https://openrouter.ai';
const DEFAULT_TIMEOUT_MS = 30_000;
const PROVIDER = 'openrouter';

export function createOpenRouterClient({
  fetch,
  getToken,
  baseUrl = DEFAULT_BASE_URL,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: OpenRouterClientOptions): OpenRouterClient {
  return {
    requestTranscription: async (request) => {
      const payload = await executeJsonRequest({
        request,
        fetch,
        getToken,
        baseUrl,
        timeoutMs,
      });

      return parseTranscriptionResponse(payload);
    },
    requestChatCompletion: async (request) => {
      const payload = await executeJsonRequest({
        request,
        fetch,
        getToken,
        baseUrl,
        timeoutMs,
      });

      return parseChatResponse(payload);
    },
  };
}

async function executeJsonRequest({
  request,
  fetch,
  getToken,
  baseUrl,
  timeoutMs,
}: {
  readonly request: OpenRouterRequestDescriptor<unknown>;
  readonly fetch: OpenRouterFetch;
  readonly getToken: () => Promise<string | null | undefined>;
  readonly baseUrl: string;
  readonly timeoutMs: number;
}): Promise<unknown> {
  const token = (await getToken())?.trim();

  if (!token) {
    throw createAppError('missing_token', 'OpenRouter API token is required.', {
      provider: PROVIDER,
      retryable: false,
    });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  let response: OpenRouterFetchResponse;

  try {
    response = await fetch(joinUrl(baseUrl, request.path), {
      method: request.method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request.body),
      signal: controller.signal,
    });
  } catch (cause) {
    if (controller.signal.aborted || isAbortError(cause)) {
      throw mapOpenRouterTimeoutError(cause);
    }

    throw mapOpenRouterNetworkError(cause);
  } finally {
    clearTimeout(timeoutId);
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch (cause) {
    throw mapOpenRouterMalformedResponseError(cause);
  }

  if (!response.ok) {
    throw mapOpenRouterHttpError(response.status, payload);
  }

  return payload;
}

function parseTranscriptionResponse(payload: unknown): OpenRouterTranscriptionResult {
  if (isRecord(payload) && typeof payload.text === 'string') {
    return { text: payload.text };
  }

  throw mapOpenRouterMalformedResponseError(payload);
}

function parseChatResponse(payload: unknown): OpenRouterChatResult {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) {
    throw mapOpenRouterMalformedResponseError(payload);
  }

  const firstChoice = payload.choices[0];

  if (
    isRecord(firstChoice) &&
    isRecord(firstChoice.message) &&
    typeof firstChoice.message.content === 'string'
  ) {
    return { content: firstChoice.message.content };
  }

  throw mapOpenRouterMalformedResponseError(payload);
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${path}`;
}

function isAbortError(cause: unknown): boolean {
  return isRecord(cause) && cause.name === 'AbortError';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
