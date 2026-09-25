import type { Database, SqlJsStatic } from 'sql.js';
// The asm.js build avoids loading WebAssembly inside the React Native Jest environment.
import initSqlJs from 'sql.js/dist/sql-asm.js';

import { migrateSqliteSchema, type LocalSqliteDatabase, type SqliteValue } from '../sqlite/schema';

let sqlJsPromise: Promise<SqlJsStatic> | undefined;

export type SqlJsLocalDatabase = LocalSqliteDatabase & {
  readonly raw: Database;
  readonly rows: <T>(sql: string, params?: readonly SqliteValue[]) => T[];
};

// Real SQLite (compiled to WebAssembly) so repository tests exercise the actual SQL.
export async function createSqlJsLocalDatabase({
  migrate = true,
}: { readonly migrate?: boolean } = {}): Promise<SqlJsLocalDatabase> {
  sqlJsPromise ??= initSqlJs();
  const SQL = await sqlJsPromise;
  const raw = new SQL.Database();
  raw.run('PRAGMA foreign_keys = ON');

  function rows<T>(sql: string, params: readonly SqliteValue[] = []): T[] {
    const statement = raw.prepare(sql);
    try {
      statement.bind([...params]);
      const result: T[] = [];
      while (statement.step()) {
        result.push(statement.getAsObject() as T);
      }
      return result;
    } finally {
      statement.free();
    }
  }

  const database: SqlJsLocalDatabase = {
    raw,
    rows,
    async execute(sql, params = []) {
      if (params.length > 0) {
        raw.run(sql, [...params]);
        return;
      }

      raw.exec(sql);
    },
    async query<T>(sql: string, params: readonly SqliteValue[] = []): Promise<T[]> {
      return rows<T>(sql, params);
    },
  };

  if (migrate) {
    await migrateSqliteSchema(database);
  }

  return database;
}
