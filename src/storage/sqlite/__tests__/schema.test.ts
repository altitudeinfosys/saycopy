import {
  REQUIRED_TABLE_COLUMNS,
  MIGRATION_TABLE_NAME,
  REQUIRED_TABLE_NAMES,
  migrateSqliteSchema,
  type LocalSqliteDatabase,
} from '../schema';

class SchemaTestDatabase implements LocalSqliteDatabase {
  readonly createdTables = new Set<string>();
  readonly appliedMigrations = new Set<number>();
  readonly tableColumns = new Map<string, Set<string>>();

  async execute(sql: string): Promise<void> {
    for (const match of sql.matchAll(/CREATE TABLE IF NOT EXISTS\s+([a-z_]+)\s*\(([\s\S]*?)\);/giu)) {
      const tableName = match[1];
      if (!this.createdTables.has(tableName)) {
        this.createdTables.add(tableName);
        this.tableColumns.set(tableName, parseColumnNames(match[2]));
      }
    }

    const migrationMatch = sql.match(
      /INSERT(?: OR IGNORE)? INTO schema_migrations\s*\(version\)\s*VALUES\s*\((\d+)\)/iu,
    );
    if (migrationMatch) {
      this.appliedMigrations.add(Number(migrationMatch[1]));
    }

    const alterMatch = sql.match(/ALTER TABLE\s+([a-z_]+)\s+ADD COLUMN\s+([a-z_]+)/iu);
    if (alterMatch) {
      const [, tableName, columnName] = alterMatch;
      this.createdTables.add(tableName);
      const columns = this.tableColumns.get(tableName) ?? new Set<string>();
      columns.add(columnName);
      this.tableColumns.set(tableName, columns);
    }
  }

  async query<T>(sql: string): Promise<T[]> {
    if (/SELECT version FROM schema_migrations/iu.test(sql)) {
      return [...this.appliedMigrations].map((version) => ({ version }) as T);
    }

    if (/SELECT name FROM sqlite_master/iu.test(sql)) {
      return [...this.createdTables].map((name) => ({ name }) as T);
    }

    const pragmaMatch = sql.match(/PRAGMA table_info\(([a-z_]+)\)/iu);
    if (pragmaMatch) {
      const columns = this.tableColumns.get(pragmaMatch[1]) ?? new Set<string>();
      return [...columns].map((name) => ({ name }) as T);
    }

    return [];
  }

  defineTable(name: string, columns: readonly string[]): void {
    this.createdTables.add(name);
    this.tableColumns.set(name, new Set(columns));
  }
}

function parseColumnNames(source: string): Set<string> {
  const columnNames = new Set<string>();

  for (const match of source.matchAll(/^\s*([a-z_]+)\s+(?:TEXT|INTEGER)\b/gimu)) {
    columnNames.add(match[1]);
  }

  return columnNames;
}

function expectRequiredColumns(database: SchemaTestDatabase): void {
  for (const tableName of REQUIRED_TABLE_NAMES) {
    expect([...(database.tableColumns.get(tableName) ?? [])].sort()).toEqual(
      [...REQUIRED_TABLE_COLUMNS[tableName]].sort(),
    );
  }
}

describe('SQLite schema migrations', () => {
  it('creates all local persistence tables and records the first migration', async () => {
    const database = new SchemaTestDatabase();

    await migrateSqliteSchema(database);

    expect([...database.createdTables].sort()).toEqual([...REQUIRED_TABLE_NAMES].sort());
    expectRequiredColumns(database);
    expect(database.createdTables.has(MIGRATION_TABLE_NAME)).toBe(true);
    expect(database.appliedMigrations.has(1)).toBe(true);
  });

  it('does not reapply migration 1 when it has already been recorded', async () => {
    const database = new SchemaTestDatabase();

    await migrateSqliteSchema(database);
    await migrateSqliteSchema(database);

    expect([...database.appliedMigrations]).toEqual([1]);
  });

  it('repairs missing v1 tables when migration 1 has already been recorded', async () => {
    const database = new SchemaTestDatabase();

    database.defineTable(MIGRATION_TABLE_NAME, ['version', 'applied_at']);
    database.defineTable('history_items', ['id', 'primary_text']);
    database.appliedMigrations.add(1);

    await migrateSqliteSchema(database);

    expect([...database.createdTables].sort()).toEqual([...REQUIRED_TABLE_NAMES].sort());
    expectRequiredColumns(database);
    expect([...database.appliedMigrations]).toEqual([1]);
  });

  it('repairs missing v1 columns when all required tables already exist', async () => {
    const database = new SchemaTestDatabase();

    for (const tableName of REQUIRED_TABLE_NAMES) {
      database.defineTable(tableName, [REQUIRED_TABLE_COLUMNS[tableName][0]]);
    }
    database.appliedMigrations.add(1);

    await migrateSqliteSchema(database);

    expect([...database.createdTables].sort()).toEqual([...REQUIRED_TABLE_NAMES].sort());
    expectRequiredColumns(database);
    expect([...database.appliedMigrations]).toEqual([1]);
  });

  it('repairs the migration table before reading applied versions', async () => {
    const database = new SchemaTestDatabase();

    database.defineTable(MIGRATION_TABLE_NAME, []);

    await migrateSqliteSchema(database);

    expect([...database.createdTables].sort()).toEqual([...REQUIRED_TABLE_NAMES].sort());
    expectRequiredColumns(database);
    expect(database.appliedMigrations.has(1)).toBe(true);
  });
});
