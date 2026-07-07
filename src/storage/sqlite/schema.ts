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

type RequiredTableName = (typeof REQUIRED_TABLE_NAMES)[number];

export const REQUIRED_TABLE_COLUMNS = {
  app_settings: ['key', 'value_json', 'updated_at'],
  history_item_tags: ['history_item_id', 'tag_id'],
  history_items: [
    'id',
    'mode',
    'source_type',
    'source_language',
    'target_language',
    'primary_text',
    'source_text',
    'translated_text',
    'model_preset',
    'stt_model_id',
    'text_model_id',
    'created_at',
    'updated_at',
  ],
  schema_migrations: ['version', 'applied_at'],
  tags: ['id', 'name', 'normalized_name', 'created_at'],
} as const satisfies Record<RequiredTableName, readonly string[]>;

type MigrationRow = {
  readonly version: number;
};

type TableNameRow = {
  readonly name: string;
};

type TableColumnRow = {
  readonly name: string;
};

const STABLE_TIMESTAMP_DEFAULT = '1970-01-01T00:00:00.000Z';

const MIGRATION_1_TABLES_SQL = `
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
`;

const MIGRATION_1_SQL = `
${MIGRATION_1_TABLES_SQL}

INSERT OR IGNORE INTO schema_migrations (version) VALUES (1);
`;

const MIGRATION_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY NOT NULL,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`;

const REQUIRED_COLUMN_REPAIR_SQL: Record<RequiredTableName, Record<string, string>> = {
  app_settings: {
    key: 'ALTER TABLE app_settings ADD COLUMN key TEXT',
    value_json: "ALTER TABLE app_settings ADD COLUMN value_json TEXT NOT NULL DEFAULT 'null'",
    updated_at: `ALTER TABLE app_settings ADD COLUMN updated_at TEXT NOT NULL DEFAULT '${STABLE_TIMESTAMP_DEFAULT}'`,
  },
  history_item_tags: {
    history_item_id: 'ALTER TABLE history_item_tags ADD COLUMN history_item_id TEXT',
    tag_id: 'ALTER TABLE history_item_tags ADD COLUMN tag_id TEXT',
  },
  history_items: {
    id: 'ALTER TABLE history_items ADD COLUMN id TEXT',
    mode: "ALTER TABLE history_items ADD COLUMN mode TEXT NOT NULL DEFAULT 'transcribe'",
    source_type: "ALTER TABLE history_items ADD COLUMN source_type TEXT NOT NULL DEFAULT 'manual'",
    source_language: "ALTER TABLE history_items ADD COLUMN source_language TEXT NOT NULL DEFAULT 'auto'",
    target_language: 'ALTER TABLE history_items ADD COLUMN target_language TEXT',
    primary_text: "ALTER TABLE history_items ADD COLUMN primary_text TEXT NOT NULL DEFAULT ''",
    source_text: 'ALTER TABLE history_items ADD COLUMN source_text TEXT',
    translated_text: 'ALTER TABLE history_items ADD COLUMN translated_text TEXT',
    model_preset: "ALTER TABLE history_items ADD COLUMN model_preset TEXT NOT NULL DEFAULT 'balanced'",
    stt_model_id: 'ALTER TABLE history_items ADD COLUMN stt_model_id TEXT',
    text_model_id: 'ALTER TABLE history_items ADD COLUMN text_model_id TEXT',
    created_at: `ALTER TABLE history_items ADD COLUMN created_at TEXT NOT NULL DEFAULT '${STABLE_TIMESTAMP_DEFAULT}'`,
    updated_at: `ALTER TABLE history_items ADD COLUMN updated_at TEXT NOT NULL DEFAULT '${STABLE_TIMESTAMP_DEFAULT}'`,
  },
  schema_migrations: {
    version: 'ALTER TABLE schema_migrations ADD COLUMN version INTEGER',
    applied_at: `ALTER TABLE schema_migrations ADD COLUMN applied_at TEXT NOT NULL DEFAULT '${STABLE_TIMESTAMP_DEFAULT}'`,
  },
  tags: {
    id: 'ALTER TABLE tags ADD COLUMN id TEXT',
    name: "ALTER TABLE tags ADD COLUMN name TEXT NOT NULL DEFAULT ''",
    normalized_name: "ALTER TABLE tags ADD COLUMN normalized_name TEXT NOT NULL DEFAULT ''",
    created_at: `ALTER TABLE tags ADD COLUMN created_at TEXT NOT NULL DEFAULT '${STABLE_TIMESTAMP_DEFAULT}'`,
  },
};

function hasRequiredTables(tableNames: ReadonlySet<string>): boolean {
  return REQUIRED_TABLE_NAMES.every((tableName) => tableNames.has(tableName));
}

async function readTableNames(database: LocalSqliteDatabase): Promise<Set<string>> {
  const tableRows = await database.query<TableNameRow>(
    "SELECT name FROM sqlite_master WHERE type = 'table'",
  );

  return new Set(tableRows.map((row) => row.name));
}

async function readTableColumnNames(
  database: LocalSqliteDatabase,
  tableName: RequiredTableName,
): Promise<Set<string>> {
  const columnRows = await database.query<TableColumnRow>(`PRAGMA table_info(${tableName})`);

  return new Set(columnRows.map((row) => row.name));
}

async function repairMissingColumns(
  database: LocalSqliteDatabase,
  tableNames: ReadonlySet<string>,
  tableNamesToRepair: readonly RequiredTableName[],
): Promise<void> {
  for (const tableName of tableNamesToRepair) {
    if (!tableNames.has(tableName)) {
      continue;
    }

    const columnNames = await readTableColumnNames(database, tableName);
    for (const columnName of REQUIRED_TABLE_COLUMNS[tableName]) {
      if (columnNames.has(columnName)) {
        continue;
      }

      const statement = REQUIRED_COLUMN_REPAIR_SQL[tableName][columnName];
      await database.execute(statement);
      columnNames.add(columnName);
    }
  }
}

export async function migrateSqliteSchema(database: LocalSqliteDatabase): Promise<void> {
  await database.execute(MIGRATION_TABLE_SQL);
  let tableNames = await readTableNames(database);
  await repairMissingColumns(database, tableNames, [MIGRATION_TABLE_NAME]);

  const appliedMigrations = await database.query<MigrationRow>(
    'SELECT version FROM schema_migrations ORDER BY version ASC',
  );
  const appliedVersions = new Set(appliedMigrations.map((migration) => migration.version));

  if (!appliedVersions.has(1) || !hasRequiredTables(tableNames)) {
    await database.execute(MIGRATION_1_SQL);
    tableNames = await readTableNames(database);
  }

  await repairMissingColumns(database, tableNames, REQUIRED_TABLE_NAMES);
}
