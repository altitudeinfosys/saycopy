import { DEFAULT_MODEL_PRESET_ID } from '../../domain/modelPresets';
import { InMemoryLocalSqliteDatabase } from '../test/InMemoryLocalSqliteDatabase';
import { createSettingsRepository, DEFAULT_APP_SETTINGS } from '../settingsRepository';
import { migrateSqliteSchema } from '../sqlite/schema';

async function createRepository() {
  const database = new InMemoryLocalSqliteDatabase();
  await migrateSqliteSchema(database);

  const repository = createSettingsRepository(database, {
    now: () => '2026-07-05T12:00:00.000Z',
  });

  return { database, repository };
}

describe('settings repository', () => {
  it('returns non-secret defaults when nothing is persisted', async () => {
    const { repository } = await createRepository();

    await expect(repository.getSettings()).resolves.toEqual({
      defaultMode: 'transcribe',
      sourceLanguageId: 'auto',
      targetLanguageId: 'english',
      modelPresetId: DEFAULT_MODEL_PRESET_ID,
      cleanupEnabled: true,
    });
    expect(DEFAULT_APP_SETTINGS.modelPresetId).toBe('balanced');
  });

  it('returns valid persisted settings', async () => {
    const { repository } = await createRepository();

    await repository.saveSettings({
      defaultMode: 'translate',
      sourceLanguageId: 'spanish',
      targetLanguageId: 'arabic',
      modelPresetId: 'fast',
      cleanupEnabled: false,
    });

    await expect(repository.getSettings()).resolves.toEqual({
      defaultMode: 'translate',
      sourceLanguageId: 'spanish',
      targetLanguageId: 'arabic',
      modelPresetId: 'fast',
      cleanupEnabled: false,
    });
  });

  it('falls back to defaults for invalid persisted values', async () => {
    const { database, repository } = await createRepository();

    await database.execute(
      'INSERT OR REPLACE INTO app_settings (key, value_json, updated_at) VALUES (?, ?, ?)',
      ['defaultMode', JSON.stringify('record'), '2026-07-05T12:00:00.000Z'],
    );
    await database.execute(
      'INSERT OR REPLACE INTO app_settings (key, value_json, updated_at) VALUES (?, ?, ?)',
      ['sourceLanguageId', JSON.stringify('klingon'), '2026-07-05T12:00:00.000Z'],
    );
    await database.execute(
      'INSERT OR REPLACE INTO app_settings (key, value_json, updated_at) VALUES (?, ?, ?)',
      ['targetLanguageId', JSON.stringify('auto'), '2026-07-05T12:00:00.000Z'],
    );
    await database.execute(
      'INSERT OR REPLACE INTO app_settings (key, value_json, updated_at) VALUES (?, ?, ?)',
      ['modelPresetId', JSON.stringify('expensive'), '2026-07-05T12:00:00.000Z'],
    );
    await database.execute(
      'INSERT OR REPLACE INTO app_settings (key, value_json, updated_at) VALUES (?, ?, ?)',
      ['cleanupEnabled', JSON.stringify('yes'), '2026-07-05T12:00:00.000Z'],
    );

    await expect(repository.getSettings()).resolves.toEqual(DEFAULT_APP_SETTINGS);
  });
});
