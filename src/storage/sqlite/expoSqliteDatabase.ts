import { openDatabaseSync as openExpoDatabaseSync } from 'expo-sqlite';

import {
  migrateSqliteSchema,
  type LocalSqliteDatabase,
  type SqliteValue,
} from './schema';

export const DEFAULT_EXPO_SQLITE_DATABASE_NAME = 'tarek-wisper.db';

export type ExpoSqliteDatabaseLike = {
  execAsync(source: string): Promise<void>;
  getAllAsync<T>(source: string): Promise<T[]>;
  getAllAsync<T>(source: string, params: readonly SqliteValue[]): Promise<T[]>;
  runAsync(source: string): Promise<unknown>;
  runAsync(source: string, params: readonly SqliteValue[]): Promise<unknown>;
};

export type CreateExpoSqliteLocalDatabaseOptions = {
  readonly databaseName?: string;
  readonly openDatabaseSync?: (databaseName: string) => ExpoSqliteDatabaseLike;
};

function createUnmigratedExpoSqliteLocalDatabase(
  rawDatabase: ExpoSqliteDatabaseLike,
): LocalSqliteDatabase {
  return {
    async execute(sql, params = []) {
      if (params.length > 0) {
        await rawDatabase.runAsync(sql, params);
        return;
      }

      await rawDatabase.execAsync(sql);
    },
    async query<T>(sql: string, params: readonly SqliteValue[] = []): Promise<T[]> {
      if (params.length > 0) {
        return rawDatabase.getAllAsync<T>(sql, params);
      }

      return rawDatabase.getAllAsync<T>(sql);
    },
  };
}

export function createExpoSqliteLocalDatabase({
  databaseName = DEFAULT_EXPO_SQLITE_DATABASE_NAME,
  openDatabaseSync,
}: CreateExpoSqliteLocalDatabaseOptions = {}): LocalSqliteDatabase {
  const openDatabase =
    openDatabaseSync ??
    ((nextDatabaseName: string) =>
      openExpoDatabaseSync(nextDatabaseName) as unknown as ExpoSqliteDatabaseLike);
  const unmigratedDatabase = createUnmigratedExpoSqliteLocalDatabase(
    openDatabase(databaseName),
  );
  const migrationPromise = migrateSqliteSchema(unmigratedDatabase);

  async function ensureMigrated() {
    await migrationPromise;
  }

  return {
    async execute(sql, params) {
      await ensureMigrated();
      await unmigratedDatabase.execute(sql, params);
    },
    async query<T>(sql: string, params?: readonly SqliteValue[]): Promise<T[]> {
      await ensureMigrated();
      return unmigratedDatabase.query<T>(sql, params);
    },
  };
}
