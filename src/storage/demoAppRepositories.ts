import {
  getHistoryPrimaryText,
  type HistoryItem,
  type Tag,
} from '../domain/history';
import type { SecureTokenStore, TokenStatus } from './secureTokenStore';
import {
  DEFAULT_APP_SETTINGS,
  type AppSettings,
  type SettingsRepository,
} from './settingsRepository';
import type {
  CreateHistoryItemInput,
  HistoryListOptions,
  HistoryRepository,
  HistorySearchOptions,
  UpdateHistoryTextInput,
} from './sqlite/historyRepository';

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/gu, ' ');
}

function sortHistoryItemsNewestFirst(items: readonly HistoryItem[]): HistoryItem[] {
  return [...items].sort(
    (left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id),
  );
}

function itemHasTag(item: HistoryItem, tag: string): boolean {
  const normalizedTag = normalizeText(tag);

  return (item.tags ?? []).some((itemTag) => normalizeText(itemTag.label) === normalizedTag);
}

function itemMatchesSearch(item: HistoryItem, query: string): boolean {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) {
    return true;
  }

  const tagText = (item.tags ?? []).map((tag) => tag.label).join(' ');
  const searchableText = [
    getHistoryPrimaryText(item),
    item.mode === 'translate' ? item.transcript : '',
    item.sourceLanguageId,
    item.mode === 'translate' ? item.targetLanguageId : '',
    tagText,
  ].join(' ');

  return normalizeText(searchableText).includes(normalizedQuery);
}

function createTagFromName(name: string, id?: string): Tag {
  const label = name.trim().replace(/\s+/gu, ' ');
  const normalizedLabel = normalizeText(label);

  if (!normalizedLabel) {
    throw new Error('Tag name cannot be blank');
  }

  return {
    id: id ?? `tag-${normalizedLabel.replace(/\s+/gu, '-')}`,
    label,
  };
}

export function createDemoHistoryRepository(
  initialItems: readonly HistoryItem[] = [],
): HistoryRepository {
  let items = [...initialItems];
  let historyIdCount = items.length;
  const tags = new Map<string, Tag>();

  for (const item of items) {
    for (const tag of item.tags ?? []) {
      tags.set(normalizeText(tag.label), tag);
    }
  }

  function filterItems(options: HistorySearchOptions = {}): HistoryItem[] {
    const filteredItems = items.filter((item) => {
      const matchesTag = options.tag ? itemHasTag(item, options.tag) : true;
      const matchesQuery = options.query ? itemMatchesSearch(item, options.query) : true;

      return matchesTag && matchesQuery;
    });

    return sortHistoryItemsNewestFirst(filteredItems);
  }

  async function getHistoryItem(id: string): Promise<HistoryItem | null> {
    return items.find((item) => item.id === id) ?? null;
  }

  async function createHistoryItem(input: CreateHistoryItemInput): Promise<HistoryItem> {
    historyIdCount += 1;
    const timestamp = new Date().toISOString();
    const itemTags = (input.tags ?? []).map((tagName) => {
      const normalizedName = normalizeText(tagName);
      const existingTag = tags.get(normalizedName);
      if (existingTag) {
        return existingTag;
      }

      const createdTag = createTagFromName(tagName);
      tags.set(normalizedName, createdTag);
      return createdTag;
    });

    const item: HistoryItem =
      input.mode === 'translate'
        ? {
            id: input.id ?? `history-${historyIdCount}`,
            mode: 'translate',
            sourceType: input.sourceType ?? 'manual',
            sourceLanguageId: input.sourceLanguageId ?? 'auto',
            targetLanguageId: input.targetLanguageId ?? 'english',
            transcript: input.sourceText ?? '',
            translatedText: input.translatedText ?? input.primaryText,
            createdAt: timestamp,
            updatedAt: timestamp,
            tags: itemTags,
          }
        : {
            id: input.id ?? `history-${historyIdCount}`,
            mode: 'transcribe',
            sourceType: input.sourceType ?? 'manual',
            sourceLanguageId: input.sourceLanguageId ?? 'auto',
            transcript: input.primaryText,
            createdAt: timestamp,
            updatedAt: timestamp,
            tags: itemTags,
          };

    items = [item, ...items];

    return item;
  }

  async function updateHistoryText(
    id: string,
    input: UpdateHistoryTextInput,
  ): Promise<HistoryItem | null> {
    const existingItem = items.find((item) => item.id === id);
    if (!existingItem) {
      return null;
    }

    const updatedAt = new Date().toISOString();
    const updatedItem: HistoryItem =
      existingItem.mode === 'translate'
        ? {
            ...existingItem,
            transcript: input.sourceText ?? existingItem.transcript,
            translatedText: input.translatedText ?? input.primaryText ?? existingItem.translatedText,
            updatedAt,
          }
        : {
            ...existingItem,
            transcript: input.primaryText ?? existingItem.transcript,
            updatedAt,
          };

    items = items.map((item) => (item.id === id ? updatedItem : item));

    return updatedItem;
  }

  async function createTag(name: string): Promise<Tag> {
    const normalizedName = normalizeText(name);
    const existingTag = tags.get(normalizedName);
    if (existingTag) {
      return existingTag;
    }

    const tag = createTagFromName(name);
    tags.set(normalizedName, tag);

    return tag;
  }

  return {
    createHistoryItem,
    getHistoryItem,
    listHistoryItems: async (options?: HistoryListOptions) => filterItems({ tag: options?.tag }),
    updateHistoryText,
    deleteHistoryItem: async (id: string) => {
      items = items.filter((item) => item.id !== id);
    },
    deleteAllHistoryItems: async () => {
      items = [];
    },
    createTag,
    findTag: async (name: string) => tags.get(normalizeText(name)) ?? null,
    assignTag: async (historyItemId: string, tagName: string) => {
      const tag = await createTag(tagName);
      items = items.map((item) => {
        if (item.id !== historyItemId || itemHasTag(item, tag.label)) {
          return item;
        }

        return {
          ...item,
          tags: [...(item.tags ?? []), tag],
        };
      });

      return tag;
    },
    removeTag: async (historyItemId: string, tagName: string) => {
      items = items.map((item) => {
        if (item.id !== historyItemId) {
          return item;
        }

        return {
          ...item,
          tags: (item.tags ?? []).filter((tag) => normalizeText(tag.label) !== normalizeText(tagName)),
        };
      });
    },
    searchHistory: async (options: HistorySearchOptions) => filterItems(options),
  };
}

export function createDemoSettingsRepository(
  initialSettings: AppSettings = DEFAULT_APP_SETTINGS,
): SettingsRepository {
  let settings = initialSettings;

  return {
    getSettings: async () => settings,
    saveSettings: async (nextSettings: Partial<AppSettings>) => {
      settings = { ...settings, ...nextSettings };
    },
  };
}

export function createDemoTokenStore(): SecureTokenStore {
  let token: string | null = null;

  async function getToken(): Promise<string | null> {
    return token;
  }

  async function hasToken(): Promise<boolean> {
    return token !== null;
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
    setToken: async (nextToken: string) => {
      const trimmedToken = nextToken.trim();
      token = trimmedToken ? trimmedToken : null;
    },
    clearToken: async () => {
      token = null;
    },
    hasToken,
    getTokenStatus,
  };
}

export type DemoAppDependencies = {
  readonly historyRepository: HistoryRepository;
  readonly settingsRepository: SettingsRepository;
  readonly tokenStore: SecureTokenStore;
};

export function createDemoAppDependencies(): DemoAppDependencies {
  return {
    historyRepository: createDemoHistoryRepository(),
    settingsRepository: createDemoSettingsRepository(),
    tokenStore: createDemoTokenStore(),
  };
}
