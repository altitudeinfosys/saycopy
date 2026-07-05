export type SqliteValue = string | number | null;

export type LocalSqliteDatabase = {
  execute(sql: string, params?: readonly SqliteValue[]): Promise<void>;
  query<T>(sql: string, params?: readonly SqliteValue[]): Promise<T[]>;
};

export const MIGRATION_TABLE_NAME = 'schema_migrations';

export const REQUIRED_TABLE_NAMES = [
  'app_settings',
  'history_item_tags',
  'history_items',
  MIGRATION_TABLE_NAME,
  'tags',
] as const;

type MigrationRow = {
  readonly version: number;
};

const MIGRATION_1_SQL = `
CREATE TABLE IF NOT EXISTS history_items (
  id TEXT PRIMARY KEY NOT NULL,
  mode TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_language TEXT NOT NULL,
  target_language TEXT,
  primary_text TEXT NOT NULL,
  source_text TEXT,
  translated_text TEXT,
  model_preset TEXT NOT NULL,
  stt_model_id TEXT,
  text_model_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS history_item_tags (
  history_item_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  PRIMARY KEY (history_item_id, tag_id),
  FOREIGN KEY (history_item_id) REFERENCES history_items(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY NOT NULL,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO schema_migrations (version) VALUES (1);
`;

const MIGRATION_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY NOT NULL,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`;

export async function migrateSqliteSchema(database: LocalSqliteDatabase): Promise<void> {
  await database.execute(MIGRATION_TABLE_SQL);

  const appliedMigrations = await database.query<MigrationRow>(
    'SELECT version FROM schema_migrations ORDER BY version ASC',
  );
  const appliedVersions = new Set(appliedMigrations.map((migration) => migration.version));

  if (!appliedVersions.has(1)) {
    await database.execute(MIGRATION_1_SQL);
  }
}
