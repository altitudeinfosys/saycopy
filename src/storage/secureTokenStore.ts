export type SecureStoreLike = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
};

export type TokenStatus = {
  readonly hasToken: boolean;
  readonly statusText: 'OpenRouter token saved' | 'OpenRouter token missing';
};

export type SecureTokenStore = {
  getToken(): Promise<string | null>;
  setToken(token: string): Promise<void>;
  clearToken(): Promise<void>;
  hasToken(): Promise<boolean>;
  getTokenStatus(): Promise<TokenStatus>;
};

export const OPENROUTER_TOKEN_KEY = 'openrouter_token';

export function createSecureTokenStore(secureStore: SecureStoreLike): SecureTokenStore {
  async function getToken(): Promise<string | null> {
    const storedToken = await secureStore.getItemAsync(OPENROUTER_TOKEN_KEY);
    const trimmedToken = storedToken?.trim() ?? '';

    return trimmedToken ? trimmedToken : null;
  }

  async function clearToken(): Promise<void> {
    await secureStore.deleteItemAsync(OPENROUTER_TOKEN_KEY);
  }

  async function setToken(token: string): Promise<void> {
    const trimmedToken = token.trim();

    if (!trimmedToken) {
      await clearToken();
      return;
    }

    await secureStore.setItemAsync(OPENROUTER_TOKEN_KEY, trimmedToken);
  }

  async function hasToken(): Promise<boolean> {
    return (await getToken()) !== null;
  }

  async function getTokenStatus(): Promise<TokenStatus> {
    const tokenIsPresent = await hasToken();

    return {
      hasToken: tokenIsPresent,
      statusText: tokenIsPresent ? 'OpenRouter token saved' : 'OpenRouter token missing',
    };
  }

  return {
    getToken,
    setToken,
    clearToken,
    hasToken,
    getTokenStatus,
  };
}
