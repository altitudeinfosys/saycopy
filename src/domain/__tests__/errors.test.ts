import {
  APP_ERROR_CATEGORIES,
  createAppError,
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

  it('checks whether a value is an app error category', () => {
    expect(isAppErrorCategory('timeout')).toBe(true);
    expect(isAppErrorCategory('not_a_real_category')).toBe(false);
  });
});
