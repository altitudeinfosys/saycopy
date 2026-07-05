import { createAppError, type AppError } from '../../domain/errors';

const PROVIDER = 'openrouter';

export function mapOpenRouterHttpError(status: number, payload?: unknown): AppError {
  const cause = sanitizeHttpErrorCause(status, payload);

  switch (status) {
    case 401:
      return createAppError('auth_error', 'OpenRouter authentication failed.', {
        provider: PROVIDER,
        retryable: false,
        cause,
      });
    case 402:
      return createAppError('payment_required', 'OpenRouter account credits are required.', {
        provider: PROVIDER,
        retryable: false,
        cause,
      });
    case 429:
      return createAppError('rate_limited', 'OpenRouter rate limit was reached. Try again shortly.', {
        provider: PROVIDER,
        retryable: true,
        cause,
      });
    case 500:
    case 502:
    case 503:
    case 524:
    case 529:
      return createAppError('provider_unavailable', 'OpenRouter is temporarily unavailable.', {
        provider: PROVIDER,
        retryable: true,
        cause,
      });
    default:
      return createAppError('unknown', 'OpenRouter request failed.', {
        provider: PROVIDER,
        retryable: false,
        cause,
      });
  }
}

export function mapOpenRouterNetworkError(_cause?: unknown): AppError {
  return createAppError('network_unavailable', 'Network connection to OpenRouter failed.', {
    provider: PROVIDER,
    retryable: true,
  });
}

export function mapOpenRouterTimeoutError(_cause?: unknown): AppError {
  return createAppError('timeout', 'OpenRouter request timed out.', {
    provider: PROVIDER,
    retryable: true,
  });
}

export function mapOpenRouterMalformedResponseError(_cause?: unknown): AppError {
  return createAppError('malformed_response', 'OpenRouter returned an unreadable response.', {
    provider: PROVIDER,
    retryable: false,
  });
}

function sanitizeHttpErrorCause(status: number, payload: unknown): OpenRouterHttpErrorCause {
  const providerError = isRecord(payload) && isRecord(payload.error) ? payload.error : undefined;
  const providerErrorCode = providerError ? sanitizeDiagnosticString(providerError.code) : undefined;
  const providerErrorType = providerError ? sanitizeDiagnosticString(providerError.type) : undefined;

  return {
    httpStatus: status,
    ...(providerErrorCode ? { providerErrorCode } : {}),
    ...(providerErrorType ? { providerErrorType } : {}),
  };
}

function sanitizeDiagnosticString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  if (!/^[A-Za-z0-9_.:-]{1,80}$/.test(value)) {
    return undefined;
  }

  if (/(bearer|token|base64|transcript|payload)/i.test(value)) {
    return undefined;
  }

  return value;
}

type OpenRouterHttpErrorCause = {
  readonly httpStatus: number;
  readonly providerErrorCode?: string;
  readonly providerErrorType?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
