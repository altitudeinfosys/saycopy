import {
  mapOpenRouterHttpError,
  mapOpenRouterMalformedResponseError,
  mapOpenRouterNetworkError,
  mapOpenRouterTimeoutError,
} from '../errors';

describe('OpenRouter error mapper', () => {
  it.each([
    [400, 'unknown', false],
    [401, 'auth_error', false],
    [402, 'payment_required', false],
    [404, 'unknown', false],
    [429, 'rate_limited', true],
    [500, 'provider_unavailable', true],
    [502, 'provider_unavailable', true],
    [503, 'provider_unavailable', true],
    [524, 'provider_unavailable', true],
    [529, 'provider_unavailable', true],
  ] as const)('maps HTTP %i to %s', (status, category, retryable) => {
    expect(
      mapOpenRouterHttpError(status, {
        error: {
          message: 'raw provider payload with sk-or-v1-secret-token',
          code: 'provider_code',
        },
      }),
    ).toEqual(
      expect.objectContaining({
        category,
        provider: 'openrouter',
        retryable,
      }),
    );
  });

  it('does not expose raw provider payloads in user-facing HTTP messages', () => {
    const error = mapOpenRouterHttpError(401, {
      error: {
        message: 'Bearer sk-or-v1-secret-token is invalid',
      },
    });

    expect(error.message).not.toContain('sk-or-v1-secret-token');
    expect(error.message).not.toContain('Bearer');
    expect(error.message).not.toContain('invalid');
  });

  it('maps network failures to network_unavailable without leaking the original error text', () => {
    const error = mapOpenRouterNetworkError(
      new Error('fetch failed for Authorization: Bearer sk-or-v1-secret-token'),
    );

    expect(error).toEqual(
      expect.objectContaining({
        category: 'network_unavailable',
        provider: 'openrouter',
        retryable: true,
      }),
    );
    expect(error.message).not.toContain('sk-or-v1-secret-token');
  });

  it('maps timeout failures to timeout', () => {
    expect(mapOpenRouterTimeoutError()).toEqual(
      expect.objectContaining({
        category: 'timeout',
        provider: 'openrouter',
        retryable: true,
      }),
    );
  });

  it('maps malformed JSON or response shapes to malformed_response', () => {
    expect(mapOpenRouterMalformedResponseError(new SyntaxError('Unexpected token'))).toEqual(
      expect.objectContaining({
        category: 'malformed_response',
        provider: 'openrouter',
        retryable: false,
      }),
    );
  });
});
