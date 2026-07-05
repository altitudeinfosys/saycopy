import {
  MIGRATION_TABLE_NAME,
  REQUIRED_TABLE_NAMES,
  migrateSqliteSchema,
  type LocalSqliteDatabase,
} from '../schema';

class SchemaTestDatabase implements LocalSqliteDatabase {
  readonly createdTables = new Set<string>();
  readonly appliedMigrations = new Set<number>();

  async execute(sql: string): Promise<void> {
    for (const match of sql.matchAll(/CREATE TABLE IF NOT EXISTS\s+([a-z_]+)/giu)) {
      this.createdTables.add(match[1]);
    }

    const migrationMatch = sql.match(/INSERT INTO schema_migrations\s*\(version\)\s*VALUES\s*\((\d+)\)/iu);
    if (migrationMatch) {
      this.appliedMigrations.add(Number(migrationMatch[1]));
    }
  }

  async query<T>(sql: string): Promise<T[]> {
    if (/SELECT version FROM schema_migrations/iu.test(sql)) {
      return [...this.appliedMigrations].map((version) => ({ version }) as T);
    }

    if (/SELECT name FROM sqlite_master/iu.test(sql)) {
      return [...this.createdTables].map((name) => ({ name }) as T);
    }

    return [];
  }
}

describe('SQLite schema migrations', () => {
  it('creates all local persistence tables and records the first migration', async () => {
    const database = new SchemaTestDatabase();

    await migrateSqliteSchema(database);

    expect([...database.createdTables].sort()).toEqual([...REQUIRED_TABLE_NAMES].sort());
    expect(database.createdTables.has(MIGRATION_TABLE_NAME)).toBe(true);
    expect(database.appliedMigrations.has(1)).toBe(true);
  });

  it('does not reapply migration 1 when it has already been recorded', async () => {
    const database = new SchemaTestDatabase();

    await migrateSqliteSchema(database);
    await migrateSqliteSchema(database);

    expect([...database.appliedMigrations]).toEqual([1]);
  });
});
