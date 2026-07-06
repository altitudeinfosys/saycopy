import {
  createExpoSqliteLocalDatabase,
  type ExpoSqliteDatabaseLike,
} from '../expoSqliteDatabase';

function normalizeSql(sql: string): string {
  return sql.trim().replace(/\s+/gu, ' ');
}

function parseColumnNames(source: string): Set<string> {
  const columnNames = new Set<string>();

  for (const match of source.matchAll(/^\s*([a-z_]+)\s+(?:TEXT|INTEGER)\b/gimu)) {
    columnNames.add(match[1]);
  }

  return columnNames;
}

class FakeExpoSqliteDatabase implements ExpoSqliteDatabaseLike {
  readonly calls: string[] = [];
  private readonly createdTables = new Set<string>();
  private readonly tableColumns = new Map<string, Set<string>>();
  private hasMigration = false;

  async execAsync(source: string): Promise<void> {
    this.calls.push(`exec:${normalizeSql(source)}`);

    for (const match of source.matchAll(/CREATE TABLE IF NOT EXISTS\s+([a-z_]+)\s*\(([\s\S]*?)\);/giu)) {
      const tableName = match[1];
      if (!this.createdTables.has(tableName)) {
        this.createdTables.add(tableName);
        this.tableColumns.set(tableName, parseColumnNames(match[2]));
      }
    }

    if (/INSERT(?: OR IGNORE)? INTO schema_migrations/iu.test(source)) {
      this.hasMigration = true;
    }

    const alterMatch = source.match(/ALTER TABLE\s+([a-z_]+)\s+ADD COLUMN\s+([a-z_]+)/iu);
    if (alterMatch) {
      const [, tableName, columnName] = alterMatch;
      this.createdTables.add(tableName);
      const columns = this.tableColumns.get(tableName) ?? new Set<string>();
      columns.add(columnName);
      this.tableColumns.set(tableName, columns);
    }
  }

  async runAsync(source: string, params: readonly unknown[] = []): Promise<unknown> {
    this.calls.push(`run:${normalizeSql(source)}:${JSON.stringify(params)}`);
    return {};
  }

  async getAllAsync<T>(source: string, params: readonly unknown[] = []): Promise<T[]> {
    this.calls.push(`query:${normalizeSql(source)}:${JSON.stringify(params)}`);

    const pragmaMatch = source.match(/PRAGMA table_info\(([a-z_]+)\)/iu);
    if (pragmaMatch) {
      const columns = this.tableColumns.get(pragmaMatch[1]) ?? new Set<string>();
      return [...columns].map((name) => ({ name }) as T);
    }

    if (source.includes('schema_migrations')) {
      return (this.hasMigration ? [{ version: 1 }] : []) as T[];
    }

    if (source.includes('sqlite_master')) {
      return [...this.createdTables].map((name) => ({ name }) as T);
    }

    return [];
  }
}

describe('createExpoSqliteLocalDatabase', () => {
  it('runs migrations through execAsync before repository queries and uses runAsync for parameterized writes', async () => {
    const rawDatabase = new FakeExpoSqliteDatabase();
    const openDatabaseSync = jest.fn(() => rawDatabase);
    const database = createExpoSqliteLocalDatabase({
      databaseName: 'test-tarek-wisper.db',
      openDatabaseSync,
    });

    await database.query('SELECT * FROM history_items');
    await database.execute('INSERT INTO history_items (id) VALUES (?)', ['history-1']);

    expect(openDatabaseSync).toHaveBeenCalledWith('test-tarek-wisper.db');
    expect(rawDatabase.calls[0]).toContain(
      'exec:CREATE TABLE IF NOT EXISTS schema_migrations',
    );
    expect(rawDatabase.calls[1]).toBe(
      "query:SELECT name FROM sqlite_master WHERE type = 'table':[]",
    );
    expect(rawDatabase.calls[2]).toBe('query:PRAGMA table_info(schema_migrations):[]');
    expect(rawDatabase.calls[3]).toBe(
      'query:SELECT version FROM schema_migrations ORDER BY version ASC:[]',
    );
    expect(rawDatabase.calls[4]).toContain('exec:CREATE TABLE IF NOT EXISTS history_items');
    expect(rawDatabase.calls[5]).toBe(
      "query:SELECT name FROM sqlite_master WHERE type = 'table':[]",
    );
    expect(rawDatabase.calls[6]).toBe('query:PRAGMA table_info(app_settings):[]');
    expect(rawDatabase.calls[7]).toBe('query:PRAGMA table_info(history_item_tags):[]');
    expect(rawDatabase.calls[8]).toBe('query:PRAGMA table_info(history_items):[]');
    expect(rawDatabase.calls[9]).toBe('query:PRAGMA table_info(schema_migrations):[]');
    expect(rawDatabase.calls[10]).toBe('query:PRAGMA table_info(tags):[]');
    expect(rawDatabase.calls[11]).toBe('query:SELECT * FROM history_items:[]');
    expect(rawDatabase.calls[12]).toBe(
      'run:INSERT INTO history_items (id) VALUES (?):["history-1"]',
    );
  });
});
