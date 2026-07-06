import {
  createExpoSqliteLocalDatabase,
  type ExpoSqliteDatabaseLike,
} from '../expoSqliteDatabase';

function normalizeSql(sql: string): string {
  return sql.trim().replace(/\s+/gu, ' ');
}

class FakeExpoSqliteDatabase implements ExpoSqliteDatabaseLike {
  readonly calls: string[] = [];
  private hasMigration = false;

  async execAsync(source: string): Promise<void> {
    this.calls.push(`exec:${normalizeSql(source)}`);

    if (source.includes('INSERT INTO schema_migrations')) {
      this.hasMigration = true;
    }
  }

  async runAsync(source: string, params: readonly unknown[] = []): Promise<unknown> {
    this.calls.push(`run:${normalizeSql(source)}:${JSON.stringify(params)}`);
    return {};
  }

  async getAllAsync<T>(source: string, params: readonly unknown[] = []): Promise<T[]> {
    this.calls.push(`query:${normalizeSql(source)}:${JSON.stringify(params)}`);

    if (source.includes('schema_migrations')) {
      return (this.hasMigration ? [{ version: 1 }] : []) as T[];
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
      'query:SELECT version FROM schema_migrations ORDER BY version ASC:[]',
    );
    expect(rawDatabase.calls[2]).toContain('exec:CREATE TABLE IF NOT EXISTS history_items');
    expect(rawDatabase.calls[3]).toBe('query:SELECT * FROM history_items:[]');
    expect(rawDatabase.calls[4]).toBe(
      'run:INSERT INTO history_items (id) VALUES (?):["history-1"]',
    );
  });
});
