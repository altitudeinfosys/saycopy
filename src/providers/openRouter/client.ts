import { createAppError, isAppError, type AppErrorCategory } from '../../domain/errors';
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
  /** Timeout for text requests such as cleanup and translation. */
  readonly timeoutMs?: number;
  /** Timeout for audio uploads, which carry up to several minutes of speech. */
  readonly transcriptionTimeoutMs?: number;
  /** Delay before each retry of a transient failure; its length is the retry count. */
  readonly retryDelaysMs?: readonly number[];
  readonly sleep?: (delayMs: number) => Promise<void>;
};

export type OpenRouterTranscriptionResult = {
  readonly text: string;
};

export type OpenRouterChatResult = {
  readonly content: string;
  readonly finishReason?: string;
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
const DEFAULT_TRANSCRIPTION_TIMEOUT_MS = 90_000;
const DEFAULT_RETRY_DELAYS_MS = [500, 1_500] as const;
// Timeouts are not retried: repeating a slow upload would double the user's wait.
const RETRYABLE_CATEGORIES: ReadonlySet<AppErrorCategory> = new Set([
  'network_unavailable',
  'rate_limited',
  'provider_unavailable',
]);
const PROVIDER = 'openrouter';

export function createOpenRouterClient({
  fetch,
  getToken,
  baseUrl = DEFAULT_BASE_URL,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  transcriptionTimeoutMs = DEFAULT_TRANSCRIPTION_TIMEOUT_MS,
  retryDelaysMs = DEFAULT_RETRY_DELAYS_MS,
  sleep = defaultSleep,
}: OpenRouterClientOptions): OpenRouterClient {
  async function executeWithRetries(
    request: OpenRouterRequestDescriptor<unknown>,
    requestTimeoutMs: number,
  ): Promise<unknown> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await executeJsonRequest({
          request,
          fetch,
          getToken,
          baseUrl,
          timeoutMs: requestTimeoutMs,
        });
      } catch (error) {
        const retryDelayMs = retryDelaysMs[attempt];

        if (retryDelayMs === undefined || !isRetryableError(error)) {
          throw error;
        }

        await sleep(retryDelayMs);
      }
    }
  }

  return {
    requestTranscription: async (request) =>
      parseTranscriptionResponse(await executeWithRetries(request, transcriptionTimeoutMs)),
    requestChatCompletion: async (request) =>
      parseChatResponse(await executeWithRetries(request, timeoutMs)),
  };
}

function isRetryableError(error: unknown): boolean {
  return isAppError(error) && RETRYABLE_CATEGORIES.has(error.category);
}

function defaultSleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
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
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(mapOpenRouterTimeoutError());
    }, timeoutMs);
  });

  const operationPromise = fetchAndParseJson({
    request,
    fetch,
    baseUrl,
    token,
    signal: controller.signal,
  });

  try {
    return await Promise.race([operationPromise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

async function fetchAndParseJson({
  request,
  fetch,
  baseUrl,
  token,
  signal,
}: {
  readonly request: OpenRouterRequestDescriptor<unknown>;
  readonly fetch: OpenRouterFetch;
  readonly baseUrl: string;
  readonly token: string;
  readonly signal: AbortSignal;
}): Promise<unknown> {
  let response: OpenRouterFetchResponse;

  try {
    response = await fetch(joinUrl(baseUrl, request.path), {
      method: request.method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request.body),
      signal,
    });
  } catch (cause) {
    if (signal.aborted || isAbortError(cause)) {
      throw mapOpenRouterTimeoutError();
    }

    throw mapOpenRouterNetworkError();
  }

  if (!response.ok) {
    const payload = await parseOptionalErrorPayload(response);
    throw mapOpenRouterHttpError(response.status, payload);
  }

  try {
    return await response.json();
  } catch (cause) {
    if (signal.aborted || isAbortError(cause)) {
      throw mapOpenRouterTimeoutError();
    }

    throw mapOpenRouterMalformedResponseError();
  }
}

async function parseOptionalErrorPayload(response: OpenRouterFetchResponse): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
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
    return {
      content: firstChoice.message.content,
      ...(typeof firstChoice.finish_reason === 'string'
        ? { finishReason: firstChoice.finish_reason }
        : {}),
    };
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
