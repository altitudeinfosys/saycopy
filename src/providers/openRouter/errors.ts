import { createAppError, type AppError } from '../../domain/errors';

const PROVIDER = 'openrouter';

export function mapOpenRouterHttpError(status: number, payload?: unknown): AppError {
  switch (status) {
    case 401:
      return createAppError('auth_error', 'OpenRouter authentication failed.', {
        provider: PROVIDER,
        retryable: false,
        cause: payload,
      });
    case 402:
      return createAppError('payment_required', 'OpenRouter account credits are required.', {
        provider: PROVIDER,
        retryable: false,
        cause: payload,
      });
    case 429:
      return createAppError('rate_limited', 'OpenRouter rate limit was reached. Try again shortly.', {
        provider: PROVIDER,
        retryable: true,
        cause: payload,
      });
    case 500:
    case 502:
    case 503:
    case 524:
    case 529:
      return createAppError('provider_unavailable', 'OpenRouter is temporarily unavailable.', {
        provider: PROVIDER,
        retryable: true,
        cause: payload,
      });
    default:
      return createAppError('unknown', 'OpenRouter request failed.', {
        provider: PROVIDER,
        retryable: false,
        cause: payload,
      });
  }
}

export function mapOpenRouterNetworkError(cause?: unknown): AppError {
  return createAppError('network_unavailable', 'Network connection to OpenRouter failed.', {
    provider: PROVIDER,
    retryable: true,
    cause,
  });
}

export function mapOpenRouterTimeoutError(cause?: unknown): AppError {
  return createAppError('timeout', 'OpenRouter request timed out.', {
    provider: PROVIDER,
    retryable: true,
    cause,
  });
}

export function mapOpenRouterMalformedResponseError(cause?: unknown): AppError {
  return createAppError('malformed_response', 'OpenRouter returned an unreadable response.', {
    provider: PROVIDER,
    retryable: false,
    cause,
  });
}
