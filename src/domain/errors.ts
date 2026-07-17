export const APP_ERROR_CATEGORIES = [
  'missing_token',
  'microphone_permission_denied',
  'network_unavailable',
  'timeout',
  'auth_error',
  'payment_required',
  'rate_limited',
  'provider_unavailable',
  'malformed_response',
  'unknown',
] as const;

export type AppErrorCategory = (typeof APP_ERROR_CATEGORIES)[number];

export type AppError = {
  readonly category: AppErrorCategory;
  readonly message: string;
  readonly provider?: string;
  readonly retryable?: boolean;
  readonly cause?: unknown;
};

export type AppErrorOptions = Omit<AppError, 'category' | 'message'>;

const APP_ERROR_CATEGORY_SET: ReadonlySet<string> = new Set(APP_ERROR_CATEGORIES);

export function isAppErrorCategory(value: string): value is AppErrorCategory {
  return APP_ERROR_CATEGORY_SET.has(value);
}

export function isAppError(value: unknown): value is AppError {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<AppError>;
  return (
    typeof candidate.category === 'string' &&
    isAppErrorCategory(candidate.category) &&
    typeof candidate.message === 'string'
  );
}

export function createAppError(
  category: AppErrorCategory,
  message: string,
  options: AppErrorOptions = {},
): AppError {
  return {
    ...options,
    category,
    message,
  };
}
