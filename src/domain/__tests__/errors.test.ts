import {
  APP_ERROR_CATEGORIES,
  createAppError,
  isAppError,
  isAppErrorCategory,
  type AppErrorCategory,
} from '../errors';

describe('error domain', () => {
  it('defines stable app and provider error categories', () => {
    const expectedCategories: AppErrorCategory[] = [
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
    ];

    expect(APP_ERROR_CATEGORIES).toEqual(expectedCategories);
  });

  it('creates typed app errors with optional retry metadata', () => {
    expect(
      createAppError('rate_limited', 'Provider rate limit exceeded.', {
        provider: 'openrouter',
        retryable: true,
      }),
    ).toEqual({
      category: 'rate_limited',
      message: 'Provider rate limit exceeded.',
      provider: 'openrouter',
      retryable: true,
    });
  });

  it('keeps explicit category and message authoritative over runtime options', () => {
    const runtimeOptions = {
      category: 'timeout',
      message: 'Overridden by untrusted runtime data.',
      provider: 'openrouter',
    };

    expect(
      createAppError(
        'malformed_response',
        'Provider response could not be parsed.',
        runtimeOptions,
      ),
    ).toEqual({
      category: 'malformed_response',
      message: 'Provider response could not be parsed.',
      provider: 'openrouter',
    });
  });

  it('checks whether a value is an app error category', () => {
    expect(isAppErrorCategory('timeout')).toBe(true);
    expect(isAppErrorCategory('not_a_real_category')).toBe(false);
  });

  it('recognizes only complete sanitized app errors', () => {
    expect(isAppError(createAppError('timeout', 'Request timed out.'))).toBe(true);
    expect(isAppError(new Error('Request timed out.'))).toBe(false);
    expect(isAppError({ category: 'not_real', message: 'Nope' })).toBe(false);
  });
});
