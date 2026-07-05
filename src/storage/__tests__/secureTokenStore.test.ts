import {
  OPENROUTER_TOKEN_KEY,
  createSecureTokenStore,
  type SecureStoreLike,
} from '../secureTokenStore';

class MockSecureStore implements SecureStoreLike {
  readonly values = new Map<string, string>();

  async getItemAsync(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async setItemAsync(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async deleteItemAsync(key: string): Promise<void> {
    this.values.delete(key);
  }
}

describe('secure token store', () => {
  it('stores trimmed OpenRouter tokens and reports token presence without leaking the token', async () => {
    const secureStore = new MockSecureStore();
    const tokenStore = createSecureTokenStore(secureStore);

    await tokenStore.setToken('  sk-or-v1-secret-token  ');

    await expect(tokenStore.getToken()).resolves.toBe('sk-or-v1-secret-token');
    await expect(tokenStore.hasToken()).resolves.toBe(true);
    expect(secureStore.values.get(OPENROUTER_TOKEN_KEY)).toBe('sk-or-v1-secret-token');

    const status = await tokenStore.getTokenStatus();

    expect(status).toEqual({
      hasToken: true,
      statusText: 'OpenRouter token saved',
    });
    expect(JSON.stringify(status)).not.toContain('sk-or-v1-secret-token');
  });

  it('treats blank tokens as missing by clearing the stored token', async () => {
    const secureStore = new MockSecureStore();
    const tokenStore = createSecureTokenStore(secureStore);

    await tokenStore.setToken('sk-or-v1-secret-token');
    await tokenStore.setToken('   ');

    await expect(tokenStore.getToken()).resolves.toBeNull();
    await expect(tokenStore.hasToken()).resolves.toBe(false);
    expect(secureStore.values.has(OPENROUTER_TOKEN_KEY)).toBe(false);
  });

  it('clears the token explicitly', async () => {
    const secureStore = new MockSecureStore();
    const tokenStore = createSecureTokenStore(secureStore);

    await tokenStore.setToken('sk-or-v1-secret-token');
    await tokenStore.clearToken();

    await expect(tokenStore.getToken()).resolves.toBeNull();
    await expect(tokenStore.getTokenStatus()).resolves.toEqual({
      hasToken: false,
      statusText: 'OpenRouter token missing',
    });
  });
});
