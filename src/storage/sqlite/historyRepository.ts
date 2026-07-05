import {
  HISTORY_MODES,
  HISTORY_SOURCE_TYPES,
  type HistoryItem,
  type HistoryMode,
  type HistorySourceType,
  type Tag,
} from '../../domain/history';
import { LANGUAGE_OPTIONS, type ConcreteLanguageId, type LanguageId } from '../../domain/languages';
import { DEFAULT_MODEL_PRESET_ID, type ModelPresetId } from '../../domain/modelPresets';
import type { LocalSqliteDatabase } from './schema';

type HistoryItemRow = {
  readonly id: string;
  readonly mode: string;
  readonly source_type: string;
  readonly source_language: string;
  readonly target_language: string | null;
  readonly primary_text: string;
  readonly source_text: string | null;
  readonly translated_text: string | null;
  readonly model_preset: string;
  readonly stt_model_id: string | null;
  readonly text_model_id: string | null;
  readonly created_at: string;
  readonly updated_at: string;
};

type TagRow = {
  readonly id: string;
  readonly name: string;
  readonly normalized_name: string;
  readonly created_at: string;
};

type HistoryItemTagRow = {
  readonly history_item_id: string;
  readonly tag_id: string;
};

export type CreateHistoryItemInput = {
  readonly id?: string;
  readonly mode?: HistoryMode;
  readonly sourceType?: HistorySourceType;
  readonly sourceLanguageId?: LanguageId;
  readonly targetLanguageId?: ConcreteLanguageId;
  readonly primaryText: string;
  readonly sourceText?: string;
  readonly translatedText?: string;
  readonly modelPresetId?: ModelPresetId;
  readonly sttModelId?: string;
  readonly textModelId?: string;
  readonly tags?: readonly string[];
};

export type UpdateHistoryTextInput = {
  readonly primaryText?: string;
  readonly sourceText?: string;
  readonly translatedText?: string;
};

export type HistoryListOptions = {
  readonly tag?: string;
};

export type HistorySearchOptions = {
  readonly query?: string;
  readonly tag?: string;
};

export type HistoryRepositoryOptions = {
  readonly createId?: (entity: 'history' | 'tag') => string;
  readonly now?: () => string;
};

export type HistoryRepository = {
  createHistoryItem(input: CreateHistoryItemInput): Promise<HistoryItem>;
  getHistoryItem(id: string): Promise<HistoryItem | null>;
  listHistoryItems(options?: HistoryListOptions): Promise<HistoryItem[]>;
  updateHistoryText(id: string, input: UpdateHistoryTextInput): Promise<HistoryItem | null>;
  deleteHistoryItem(id: string): Promise<void>;
  deleteAllHistoryItems(): Promise<void>;
  createTag(name: string): Promise<Tag>;
  findTag(name: string): Promise<Tag | null>;
  assignTag(historyItemId: string, tagName: string): Promise<Tag>;
  removeTag(historyItemId: string, tagName: string): Promise<void>;
  searchHistory(options: HistorySearchOptions): Promise<HistoryItem[]>;
};

const LANGUAGE_IDS = new Set<string>(LANGUAGE_OPTIONS.map((language) => language.id));
const CONCRETE_LANGUAGE_IDS = new Set<string>(
  LANGUAGE_OPTIONS.filter((language) => language.id !== 'auto').map((language) => language.id),
);

function defaultCreateId(entity: 'history' | 'tag'): string {
  return `${entity}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function defaultNow(): string {
  return new Date().toISOString();
}

function normalizeSearchValue(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/gu, ' ');
}

function normalizeTagName(name: string): string {
  return normalizeSearchValue(name);
}

function toDisplayTagName(name: string): string {
  return name.trim().replace(/\s+/gu, ' ');
}

function isHistoryMode(value: string): value is HistoryMode {
  return HISTORY_MODES.includes(value as HistoryMode);
}

function isHistorySourceType(value: string): value is HistorySourceType {
  return HISTORY_SOURCE_TYPES.includes(value as HistorySourceType);
}

function isLanguageId(value: string): value is LanguageId {
  return LANGUAGE_IDS.has(value);
}

function isConcreteLanguageId(value: string | null): value is ConcreteLanguageId {
  return value !== null && CONCRETE_LANGUAGE_IDS.has(value);
}

function toDomainTag(row: TagRow): Tag {
  return {
    id: row.id,
    label: row.name,
  };
}

function getTagsForHistoryItem(
  historyItemId: string,
  tags: readonly TagRow[],
  joins: readonly HistoryItemTagRow[],
): Tag[] {
  const tagIds = new Set(
    joins.filter((join) => join.history_item_id === historyItemId).map((join) => join.tag_id),
  );

  return tags
    .filter((tag) => tagIds.has(tag.id))
    .sort((left, right) => left.created_at.localeCompare(right.created_at))
    .map(toDomainTag);
}

function toHistoryItem(
  row: HistoryItemRow,
  tags: readonly TagRow[],
  joins: readonly HistoryItemTagRow[],
): HistoryItem {
  const sourceLanguageId = isLanguageId(row.source_language) ? row.source_language : 'auto';
  const sourceType = isHistorySourceType(row.source_type) ? row.source_type : 'manual';
  const itemTags = getTagsForHistoryItem(row.id, tags, joins);

  if (isHistoryMode(row.mode) && row.mode === 'translate') {
    return {
      id: row.id,
      mode: 'translate',
      sourceType,
      sourceLanguageId,
      targetLanguageId: isConcreteLanguageId(row.target_language) ? row.target_language : 'english',
      transcript: row.source_text ?? '',
      translatedText: row.translated_text ?? row.primary_text,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      tags: itemTags,
    };
  }

  return {
    id: row.id,
    mode: 'transcribe',
    sourceType,
    sourceLanguageId,
    transcript: row.primary_text,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tags: itemTags,
  };
}

function sortNewestFirst(left: HistoryItemRow, right: HistoryItemRow): number {
  return right.created_at.localeCompare(left.created_at) || right.id.localeCompare(left.id);
}

export function createHistoryRepository(
  database: LocalSqliteDatabase,
  options: HistoryRepositoryOptions = {},
): HistoryRepository {
  const createId = options.createId ?? defaultCreateId;
  const now = options.now ?? defaultNow;

  async function loadRows(): Promise<{
    historyRows: HistoryItemRow[];
    tagRows: TagRow[];
    joinRows: HistoryItemTagRow[];
  }> {
    const [historyRows, tagRows, joinRows] = await Promise.all([
      database.query<HistoryItemRow>('SELECT * FROM history_items'),
      database.query<TagRow>('SELECT * FROM tags'),
      database.query<HistoryItemTagRow>('SELECT * FROM history_item_tags'),
    ]);

    return { historyRows, tagRows, joinRows };
  }

  async function listHistoryItems(options?: HistoryListOptions): Promise<HistoryItem[]> {
    const { historyRows, tagRows, joinRows } = await loadRows();
    const normalizedTag = options?.tag ? normalizeTagName(options.tag) : undefined;
    const filteredRows = normalizedTag
      ? historyRows.filter((row) => {
          const rowTagIds = joinRows
            .filter((join) => join.history_item_id === row.id)
            .map((join) => join.tag_id);
          return tagRows.some(
            (tag) => rowTagIds.includes(tag.id) && tag.normalized_name === normalizedTag,
          );
        })
      : historyRows;

    return filteredRows
      .toSorted(sortNewestFirst)
      .map((row) => toHistoryItem(row, tagRows, joinRows));
  }

  async function getHistoryItem(id: string): Promise<HistoryItem | null> {
    const { historyRows, tagRows, joinRows } = await loadRows();
    const row = historyRows.find((historyRow) => historyRow.id === id);

    return row ? toHistoryItem(row, tagRows, joinRows) : null;
  }

  async function findTag(name: string): Promise<Tag | null> {
    const normalizedName = normalizeTagName(name);
    const tagRows = await database.query<TagRow>('SELECT * FROM tags');
    const row = tagRows.find((tag) => tag.normalized_name === normalizedName);

    return row ? toDomainTag(row) : null;
  }

  async function createTag(name: string): Promise<Tag> {
    const displayName = toDisplayTagName(name);
    const normalizedName = normalizeTagName(displayName);

    if (!normalizedName) {
      throw new Error('Tag name cannot be blank');
    }

    const existing = await findTag(normalizedName);
    if (existing) {
      return existing;
    }

    const tagRow: TagRow = {
      id: createId('tag'),
      name: displayName,
      normalized_name: normalizedName,
      created_at: now(),
    };

    await database.execute(
      `INSERT INTO tags (id, name, normalized_name, created_at)
       VALUES (?, ?, ?, ?)`,
      [tagRow.id, tagRow.name, tagRow.normalized_name, tagRow.created_at],
    );

    return toDomainTag(tagRow);
  }

  async function assignTag(historyItemId: string, tagName: string): Promise<Tag> {
    const tag = await createTag(tagName);

    await database.execute(
      `INSERT INTO history_item_tags (history_item_id, tag_id)
       VALUES (?, ?)`,
      [historyItemId, tag.id],
    );

    return tag;
  }

  async function removeTag(historyItemId: string, tagName: string): Promise<void> {
    const tag = await findTag(tagName);
    if (!tag) {
      return;
    }

    await database.execute(
      `DELETE FROM history_item_tags
       WHERE history_item_id = ? AND tag_id = ?`,
      [historyItemId, tag.id],
    );
  }

  async function createHistoryItem(input: CreateHistoryItemInput): Promise<HistoryItem> {
    const mode = input.mode ?? 'transcribe';
    const id = input.id ?? createId('history');
    const timestamp = now();
    const primaryText = input.primaryText;
    const sourceText = mode === 'translate' ? input.sourceText ?? '' : input.sourceText ?? null;
    const translatedText =
      mode === 'translate' ? input.translatedText ?? input.primaryText : input.translatedText ?? null;

    await database.execute(
      `INSERT INTO history_items (
        id,
        mode,
        source_type,
        source_language,
        target_language,
        primary_text,
        source_text,
        translated_text,
        model_preset,
        stt_model_id,
        text_model_id,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        mode,
        input.sourceType ?? 'manual',
        input.sourceLanguageId ?? 'auto',
        mode === 'translate' ? input.targetLanguageId ?? 'english' : null,
        primaryText,
        sourceText,
        translatedText,
        input.modelPresetId ?? DEFAULT_MODEL_PRESET_ID,
        input.sttModelId ?? null,
        input.textModelId ?? null,
        timestamp,
        timestamp,
      ],
    );

    for (const tagName of input.tags ?? []) {
      await assignTag(id, tagName);
    }

    const created = await getHistoryItem(id);
    if (!created) {
      throw new Error(`History item was not created: ${id}`);
    }

    return created;
  }

  async function updateHistoryText(
    id: string,
    input: UpdateHistoryTextInput,
  ): Promise<HistoryItem | null> {
    const existingRows = await database.query<HistoryItemRow>('SELECT * FROM history_items');
    const existing = existingRows.find((row) => row.id === id);
    if (!existing) {
      return null;
    }

    const nextPrimaryText = input.primaryText ?? input.translatedText ?? existing.primary_text;
    const nextSourceText =
      input.sourceText ??
      (existing.mode === 'translate' ? existing.source_text ?? '' : existing.source_text);
    const nextTranslatedText =
      existing.mode === 'translate'
        ? input.translatedText ?? input.primaryText ?? existing.translated_text ?? nextPrimaryText
        : input.translatedText ?? existing.translated_text;

    await database.execute(
      `UPDATE history_items
       SET primary_text = ?, source_text = ?, translated_text = ?, updated_at = ?
       WHERE id = ?`,
      [nextPrimaryText, nextSourceText, nextTranslatedText, now(), id],
    );

    return getHistoryItem(id);
  }

  async function deleteHistoryItem(id: string): Promise<void> {
    await database.execute('DELETE FROM history_items WHERE id = ?', [id]);
  }

  async function deleteAllHistoryItems(): Promise<void> {
    await database.execute('DELETE FROM history_items');
  }

  async function searchHistory(options: HistorySearchOptions): Promise<HistoryItem[]> {
    const listedItems = await listHistoryItems(options.tag ? { tag: options.tag } : undefined);
    const normalizedQuery = options.query ? normalizeSearchValue(options.query) : '';

    if (!normalizedQuery) {
      return listedItems;
    }

    return listedItems.filter((item) => {
      const tagText = (item.tags ?? []).map((tag) => tag.label).join(' ');
      const searchableText =
        item.mode === 'translate'
          ? [
              item.transcript,
              item.translatedText,
              item.sourceLanguageId,
              item.targetLanguageId,
              tagText,
            ].join(' ')
          : [item.transcript, item.sourceLanguageId, tagText].join(' ');

      return normalizeSearchValue(searchableText).includes(normalizedQuery);
    });
  }

  return {
    createHistoryItem,
    getHistoryItem,
    listHistoryItems,
    updateHistoryText,
    deleteHistoryItem,
    deleteAllHistoryItems,
    createTag,
    findTag,
    assignTag,
    removeTag,
    searchHistory,
  };
}
