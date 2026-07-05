import type { LocalSqliteDatabase, SqliteValue } from '../sqlite/schema';

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

type AppSettingRow = {
  readonly key: string;
  readonly value_json: string;
  readonly updated_at: string;
};

function normalizeSql(sql: string): string {
  return sql.trim().replace(/\s+/gu, ' ').replace(/;$/u, '').toUpperCase();
}

function requireString(value: SqliteValue | undefined, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`Expected ${label} to be a string`);
  }

  return value;
}

function optionalString(value: SqliteValue | undefined, label: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new Error(`Expected ${label} to be a string or null`);
  }

  return value;
}

export class InMemoryLocalSqliteDatabase implements LocalSqliteDatabase {
  readonly createdTables = new Set<string>();
  readonly appliedMigrations = new Set<number>();
  readonly historyItems = new Map<string, HistoryItemRow>();
  readonly tags = new Map<string, TagRow>();
  readonly historyItemTags: HistoryItemTagRow[] = [];
  readonly appSettings = new Map<string, AppSettingRow>();

  async execute(sql: string, params: readonly SqliteValue[] = []): Promise<void> {
    for (const match of sql.matchAll(/CREATE TABLE IF NOT EXISTS\s+([a-z_]+)/giu)) {
      this.createdTables.add(match[1]);
    }

    const inlineMigrationMatch = sql.match(
      /INSERT INTO schema_migrations\s*\(version\)\s*VALUES\s*\((\d+)\)/iu,
    );
    if (inlineMigrationMatch) {
      this.appliedMigrations.add(Number(inlineMigrationMatch[1]));
    }

    const normalizedSql = normalizeSql(sql);

    if (normalizedSql.startsWith('INSERT INTO HISTORY_ITEMS')) {
      this.historyItems.set(requireString(params[0], 'history item id'), {
        id: requireString(params[0], 'history item id'),
        mode: requireString(params[1], 'history mode'),
        source_type: requireString(params[2], 'source type'),
        source_language: requireString(params[3], 'source language'),
        target_language: optionalString(params[4], 'target language'),
        primary_text: requireString(params[5], 'primary text'),
        source_text: optionalString(params[6], 'source text'),
        translated_text: optionalString(params[7], 'translated text'),
        model_preset: requireString(params[8], 'model preset'),
        stt_model_id: optionalString(params[9], 'stt model id'),
        text_model_id: optionalString(params[10], 'text model id'),
        created_at: requireString(params[11], 'created at'),
        updated_at: requireString(params[12], 'updated at'),
      });
      return;
    }

    if (normalizedSql.startsWith('UPDATE HISTORY_ITEMS SET PRIMARY_TEXT = ?')) {
      const id = requireString(params[4], 'history item id');
      const existing = this.historyItems.get(id);
      if (existing) {
        this.historyItems.set(id, {
          ...existing,
          primary_text: requireString(params[0], 'primary text'),
          source_text: optionalString(params[1], 'source text'),
          translated_text: optionalString(params[2], 'translated text'),
          updated_at: requireString(params[3], 'updated at'),
        });
      }
      return;
    }

    if (normalizedSql.startsWith('DELETE FROM HISTORY_ITEMS WHERE ID = ?')) {
      const id = requireString(params[0], 'history item id');
      this.historyItems.delete(id);
      return;
    }

    if (normalizedSql === 'DELETE FROM HISTORY_ITEMS') {
      this.historyItems.clear();
      return;
    }

    if (normalizedSql.startsWith('INSERT INTO TAGS')) {
      const normalizedName = requireString(params[2], 'normalized tag name');
      const existing = [...this.tags.values()].find((tag) => tag.normalized_name === normalizedName);
      if (!existing) {
        this.tags.set(requireString(params[0], 'tag id'), {
          id: requireString(params[0], 'tag id'),
          name: requireString(params[1], 'tag name'),
          normalized_name: normalizedName,
          created_at: requireString(params[3], 'created at'),
        });
      }
      return;
    }

    if (
      normalizedSql.startsWith('INSERT INTO HISTORY_ITEM_TAGS') ||
      normalizedSql.startsWith('INSERT OR IGNORE INTO HISTORY_ITEM_TAGS')
    ) {
      const historyItemId = requireString(params[0], 'history item id');
      const tagId = requireString(params[1], 'tag id');
      const exists = this.historyItemTags.some(
        (row) => row.history_item_id === historyItemId && row.tag_id === tagId,
      );
      if (exists && !normalizedSql.startsWith('INSERT OR IGNORE')) {
        throw new Error(`Duplicate history item tag: ${historyItemId}:${tagId}`);
      }

      if (!exists) {
        this.historyItemTags.push({ history_item_id: historyItemId, tag_id: tagId });
      }
      return;
    }

    if (
      normalizedSql.startsWith('DELETE FROM HISTORY_ITEM_TAGS WHERE HISTORY_ITEM_ID = ?') &&
      params.length === 1
    ) {
      this.removeTagAssignmentsForHistoryItem(requireString(params[0], 'history item id'));
      return;
    }

    if (normalizedSql.startsWith('DELETE FROM HISTORY_ITEM_TAGS WHERE HISTORY_ITEM_ID = ?')) {
      const historyItemId = requireString(params[0], 'history item id');
      const tagId = requireString(params[1], 'tag id');
      const remainingRows = this.historyItemTags.filter(
        (row) => row.history_item_id !== historyItemId || row.tag_id !== tagId,
      );
      this.historyItemTags.splice(0, this.historyItemTags.length, ...remainingRows);
      return;
    }

    if (normalizedSql === 'DELETE FROM HISTORY_ITEM_TAGS') {
      this.historyItemTags.splice(0);
      return;
    }

    if (normalizedSql.startsWith('INSERT OR REPLACE INTO APP_SETTINGS')) {
      const key = requireString(params[0], 'setting key');
      this.appSettings.set(key, {
        key,
        value_json: requireString(params[1], 'setting value'),
        updated_at: requireString(params[2], 'setting updated at'),
      });
      return;
    }
  }

  async query<T>(sql: string): Promise<T[]> {
    const normalizedSql = normalizeSql(sql);

    if (normalizedSql.startsWith('SELECT VERSION FROM SCHEMA_MIGRATIONS')) {
      return [...this.appliedMigrations].map((version) => ({ version }) as T);
    }

    if (normalizedSql.startsWith('SELECT NAME FROM SQLITE_MASTER')) {
      return [...this.createdTables].map((name) => ({ name }) as T);
    }

    if (normalizedSql.includes('FROM HISTORY_ITEMS')) {
      return [...this.historyItems.values()] as T[];
    }

    if (normalizedSql.includes('FROM HISTORY_ITEM_TAGS')) {
      return [...this.historyItemTags] as T[];
    }

    if (normalizedSql.includes('FROM TAGS')) {
      return [...this.tags.values()] as T[];
    }

    if (normalizedSql.includes('FROM APP_SETTINGS')) {
      return [...this.appSettings.values()] as T[];
    }

    return [];
  }

  private removeTagAssignmentsForHistoryItem(historyItemId: string): void {
    const remainingRows = this.historyItemTags.filter(
      (row) => row.history_item_id !== historyItemId,
    );
    this.historyItemTags.splice(0, this.historyItemTags.length, ...remainingRows);
  }
}
