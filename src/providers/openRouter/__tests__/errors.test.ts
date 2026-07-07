import {
  mapOpenRouterHttpError,
  mapOpenRouterMalformedResponseError,
  mapOpenRouterNetworkError,
  mapOpenRouterTimeoutError,
} from '../errors';

const SENSITIVE_VALUES = [
  'sk-or-v1-secret-token',
  'Bearer',
  'BASE64_AUDIO_PAYLOAD',
  'private transcript text',
  'raw provider payload',
] as const;

function expectSerializedErrorToBeSanitized(error: unknown): void {
  const serialized = JSON.stringify(error);

  for (const sensitiveValue of SENSITIVE_VALUES) {
    expect(serialized).not.toContain(sensitiveValue);
  }
}

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
    [504, 'provider_unavailable', true],
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

  it('does not expose sensitive raw HTTP payload data anywhere in serialized AppError', () => {
    const error = mapOpenRouterHttpError(429, {
      error: {
        code: 'rate_limit_exceeded',
        type: 'rate_limit',
        message:
          'raw provider payload Bearer sk-or-v1-secret-token BASE64_AUDIO_PAYLOAD private transcript text',
      },
    });

    expect(error).toEqual(
      expect.objectContaining({
        cause: {
          httpStatus: 429,
          providerErrorCode: 'rate_limit_exceeded',
          providerErrorType: 'rate_limit',
        },
      }),
    );
    expectSerializedErrorToBeSanitized(error);
  });

  it('omits unsafe provider diagnostic strings from serialized AppError causes', () => {
    const error = mapOpenRouterHttpError(400, {
      error: {
        code: 'sk-or-v1-secret-token',
        type: 'Bearer raw provider payload',
        message: 'BASE64_AUDIO_PAYLOAD private transcript text',
      },
    });

    expect(error).toEqual(
      expect.objectContaining({
        cause: {
          httpStatus: 400,
        },
      }),
    );
    expectSerializedErrorToBeSanitized(error);
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

  it('does not expose sensitive network error data anywhere in serialized AppError', () => {
    const error = mapOpenRouterNetworkError(
      new Error(
        'raw provider payload Bearer sk-or-v1-secret-token BASE64_AUDIO_PAYLOAD private transcript text',
      ),
    );

    expectSerializedErrorToBeSanitized(error);
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

  it('does not expose sensitive timeout cause data anywhere in serialized AppError', () => {
    const error = mapOpenRouterTimeoutError(
      new Error(
        'raw provider payload Bearer sk-or-v1-secret-token BASE64_AUDIO_PAYLOAD private transcript text',
      ),
    );

    expectSerializedErrorToBeSanitized(error);
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

  it('does not expose sensitive malformed response data anywhere in serialized AppError', () => {
    const error = mapOpenRouterMalformedResponseError({
      text: 'private transcript text',
      audio: 'BASE64_AUDIO_PAYLOAD',
      error: {
        message: 'raw provider payload Bearer sk-or-v1-secret-token',
      },
    });

    expectSerializedErrorToBeSanitized(error);
  });
});
