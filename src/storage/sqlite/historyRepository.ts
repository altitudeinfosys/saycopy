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
import type { LocalSqliteDatabase, SqliteValue } from './schema';

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

type BaseCreateHistoryItemInput = {
  readonly id?: string;
  readonly sourceType?: HistorySourceType;
  readonly sourceLanguageId?: LanguageId;
  readonly primaryText: string;
  readonly modelPresetId?: ModelPresetId;
  readonly sttModelId?: string;
  readonly tags?: readonly string[];
};

export type CreateTranscribeHistoryItemInput = BaseCreateHistoryItemInput & {
  readonly mode?: 'transcribe';
  readonly targetLanguageId?: never;
  readonly sourceText?: never;
  readonly translatedText?: never;
  readonly textModelId?: never;
};

export type CreateTranslateHistoryItemInput = BaseCreateHistoryItemInput & {
  readonly mode: 'translate';
  readonly targetLanguageId?: ConcreteLanguageId;
  readonly sourceText?: string;
  readonly translatedText?: string;
  readonly textModelId?: string;
};

export type CreateHistoryItemInput =
  | CreateTranscribeHistoryItemInput
  | CreateTranslateHistoryItemInput;

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
  return value.trim().toLowerCase().replace(/\s+/gu, ' ');
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

type ItemTagRow = TagRow & {
  readonly history_item_id: string;
};

function groupTagsByHistoryItem(rows: readonly ItemTagRow[]): Map<string, Tag[]> {
  const tagsByItem = new Map<string, Tag[]>();

  for (const row of rows) {
    const itemTags = tagsByItem.get(row.history_item_id) ?? [];
    itemTags.push(toDomainTag(row));
    tagsByItem.set(row.history_item_id, itemTags);
  }

  return tagsByItem;
}

function toHistoryItem(row: HistoryItemRow, itemTags: readonly Tag[] = []): HistoryItem {
  const sourceLanguageId = isLanguageId(row.source_language) ? row.source_language : 'auto';
  const sourceType = isHistorySourceType(row.source_type) ? row.source_type : 'manual';

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
      tags: [...itemTags],
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
    tags: [...itemTags],
  };
}

type HistoryFilter = {
  readonly whereSql: string;
  readonly params: readonly SqliteValue[];
};

const NO_FILTER: HistoryFilter = { whereSql: '1 = 1', params: [] };

function tagFilter(normalizedTag: string): HistoryFilter {
  return {
    whereSql: `EXISTS (
      SELECT 1 FROM history_item_tags filter_join
      JOIN tags filter_tag ON filter_tag.id = filter_join.tag_id
      WHERE filter_join.history_item_id = history_items.id
        AND filter_tag.normalized_name = ?
    )`,
    params: [normalizedTag],
  };
}

function searchableText(item: HistoryItem, row: HistoryItemRow): string {
  return normalizeSearchValue(
    [
      row.primary_text,
      row.source_text ?? '',
      row.translated_text ?? '',
      row.source_language,
      row.target_language ?? '',
      (item.tags ?? []).map((tag) => tag.label).join(' '),
    ].join(' '),
  );
}

export function createHistoryRepository(
  database: LocalSqliteDatabase,
  options: HistoryRepositoryOptions = {},
): HistoryRepository {
  const createId = options.createId ?? defaultCreateId;
  const now = options.now ?? defaultNow;

  async function loadRows(
    filter: HistoryFilter,
  ): Promise<{ historyRows: HistoryItemRow[]; tagsByItem: Map<string, Tag[]> }> {
    const [historyRows, tagRows] = await Promise.all([
      database.query<HistoryItemRow>(
        `SELECT * FROM history_items
         WHERE ${filter.whereSql}
         ORDER BY created_at DESC, id DESC`,
        filter.params,
      ),
      database.query<ItemTagRow>(
        `SELECT history_item_tags.history_item_id, tags.*
         FROM history_item_tags
         JOIN tags ON tags.id = history_item_tags.tag_id
         WHERE history_item_tags.history_item_id IN (
           SELECT id FROM history_items WHERE ${filter.whereSql}
         )
         ORDER BY tags.created_at ASC, tags.rowid ASC`,
        filter.params,
      ),
    ]);

    return { historyRows, tagsByItem: groupTagsByHistoryItem(tagRows) };
  }

  async function listHistoryItems(options?: HistoryListOptions): Promise<HistoryItem[]> {
    const normalizedTag = options?.tag ? normalizeTagName(options.tag) : undefined;
    const { historyRows, tagsByItem } = await loadRows(
      normalizedTag ? tagFilter(normalizedTag) : NO_FILTER,
    );

    return historyRows.map((row) => toHistoryItem(row, tagsByItem.get(row.id)));
  }

  async function getHistoryItem(id: string): Promise<HistoryItem | null> {
    const { historyRows, tagsByItem } = await loadRows({
      whereSql: 'history_items.id = ?',
      params: [id],
    });
    const row = historyRows[0];

    return row ? toHistoryItem(row, tagsByItem.get(row.id)) : null;
  }

  async function findTag(name: string): Promise<Tag | null> {
    const normalizedName = normalizeTagName(name);
    const [row] = await database.query<TagRow>(
      'SELECT * FROM tags WHERE normalized_name = ? LIMIT 1',
      [normalizedName],
    );

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
      `INSERT OR IGNORE INTO history_item_tags (history_item_id, tag_id)
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
    const sourceText = mode === 'translate' ? input.sourceText ?? '' : null;
    const translatedText =
      mode === 'translate' ? input.translatedText ?? input.primaryText : null;
    const primaryText = mode === 'translate' ? translatedText : input.primaryText;

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
    const [existing] = await database.query<HistoryItemRow>(
      'SELECT * FROM history_items WHERE id = ? LIMIT 1',
      [id],
    );
    if (!existing) {
      return null;
    }

    const nextTranslatedText =
      existing.mode === 'translate'
        ? input.translatedText ?? input.primaryText ?? existing.translated_text ?? existing.primary_text
        : null;
    const nextPrimaryText =
      existing.mode === 'translate' ? nextTranslatedText : input.primaryText ?? existing.primary_text;
    const nextSourceText =
      existing.mode === 'translate' ? input.sourceText ?? existing.source_text ?? '' : null;

    await database.execute(
      `UPDATE history_items
       SET primary_text = ?, source_text = ?, translated_text = ?, updated_at = ?
       WHERE id = ?`,
      [nextPrimaryText, nextSourceText, nextTranslatedText, now(), id],
    );

    return getHistoryItem(id);
  }

  async function deleteHistoryItem(id: string): Promise<void> {
    await database.execute('DELETE FROM history_item_tags WHERE history_item_id = ?', [id]);
    await database.execute('DELETE FROM history_items WHERE id = ?', [id]);
  }

  async function deleteAllHistoryItems(): Promise<void> {
    await database.execute('DELETE FROM history_item_tags');
    await database.execute('DELETE FROM history_items');
  }

  async function searchHistory(options: HistorySearchOptions): Promise<HistoryItem[]> {
    const normalizedQuery = options.query ? normalizeSearchValue(options.query) : '';
    const normalizedTag = options.tag ? normalizeTagName(options.tag) : undefined;
    const { historyRows, tagsByItem } = await loadRows(
      normalizedTag ? tagFilter(normalizedTag) : NO_FILTER,
    );
    const items = historyRows.map((row) => ({
      row,
      item: toHistoryItem(row, tagsByItem.get(row.id)),
    }));

    // Text matching stays in JavaScript because SQLite LOWER() only folds ASCII letters.
    return items
      .filter(
        ({ item, row }) =>
          !normalizedQuery || searchableText(item, row).includes(normalizedQuery),
      )
      .map(({ item }) => item);
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
