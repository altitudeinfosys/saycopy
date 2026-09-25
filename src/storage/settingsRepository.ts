import { LANGUAGE_OPTIONS, type ConcreteLanguageId, type LanguageId } from '../domain/languages';
import {
  DEFAULT_MODEL_PRESET_ID,
  DEFAULT_TRANSCRIPTION_MODEL_ID,
  isModelPresetId,
  type ModelPresetId,
} from '../domain/modelPresets';
import type { LocalSqliteDatabase } from './sqlite/schema';

export type AppSettings = {
  /** Recording language for the Record tab. */
  readonly sourceLanguageId: LanguageId;
  /** Translate tab "From" language. */
  readonly translateSourceLanguageId: LanguageId;
  /** Translate tab "To" language. */
  readonly targetLanguageId: ConcreteLanguageId;
  readonly modelPresetId: ModelPresetId;
  readonly customModelId: string;
  readonly transcriptionModelId: string;
  readonly cleanupEnabled: boolean;
};

export type SettingsRepositoryOptions = {
  readonly now?: () => string;
};

export type SettingsRepository = {
  getSettings(): Promise<AppSettings>;
  saveSettings(settings: Partial<AppSettings>): Promise<void>;
};

type AppSettingRow = {
  readonly key: string;
  readonly value_json: string;
  readonly updated_at: string;
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  sourceLanguageId: 'auto',
  translateSourceLanguageId: 'auto',
  targetLanguageId: 'english',
  modelPresetId: DEFAULT_MODEL_PRESET_ID,
  customModelId: '',
  transcriptionModelId: DEFAULT_TRANSCRIPTION_MODEL_ID,
  cleanupEnabled: true,
};

const LANGUAGE_IDS = new Set<string>(LANGUAGE_OPTIONS.map((language) => language.id));
const CONCRETE_LANGUAGE_IDS = new Set<string>(
  LANGUAGE_OPTIONS.filter((language) => language.id !== 'auto').map((language) => language.id),
);

function defaultNow(): string {
  return new Date().toISOString();
}

function parseSettingValue(valueJson: string): unknown {
  try {
    return JSON.parse(valueJson);
  } catch {
    return undefined;
  }
}

function isLanguageId(value: unknown): value is LanguageId {
  return typeof value === 'string' && LANGUAGE_IDS.has(value);
}

function isConcreteLanguageId(value: unknown): value is ConcreteLanguageId {
  return typeof value === 'string' && CONCRETE_LANGUAGE_IDS.has(value);
}

function readPersistedValues(rows: readonly AppSettingRow[]): Record<string, unknown> {
  return Object.fromEntries(rows.map((row) => [row.key, parseSettingValue(row.value_json)]));
}

export function createSettingsRepository(
  database: LocalSqliteDatabase,
  options: SettingsRepositoryOptions = {},
): SettingsRepository {
  const now = options.now ?? defaultNow;

  async function getSettings(): Promise<AppSettings> {
    const rows = await database.query<AppSettingRow>('SELECT * FROM app_settings');
    const persistedValues = readPersistedValues(rows);
    const modelPresetValue = persistedValues.modelPresetId;
    const customModelValue = persistedValues.customModelId;
    const transcriptionModelValue = persistedValues.transcriptionModelId;

    return {
      sourceLanguageId: isLanguageId(persistedValues.sourceLanguageId)
        ? persistedValues.sourceLanguageId
        : DEFAULT_APP_SETTINGS.sourceLanguageId,
      translateSourceLanguageId: isLanguageId(persistedValues.translateSourceLanguageId)
        ? persistedValues.translateSourceLanguageId
        : DEFAULT_APP_SETTINGS.translateSourceLanguageId,
      targetLanguageId: isConcreteLanguageId(persistedValues.targetLanguageId)
        ? persistedValues.targetLanguageId
        : DEFAULT_APP_SETTINGS.targetLanguageId,
      modelPresetId:
        typeof modelPresetValue === 'string' && isModelPresetId(modelPresetValue)
          ? modelPresetValue
          : DEFAULT_APP_SETTINGS.modelPresetId,
      customModelId:
        typeof customModelValue === 'string'
          ? customModelValue.trim()
          : DEFAULT_APP_SETTINGS.customModelId,
      transcriptionModelId:
        typeof transcriptionModelValue === 'string' && transcriptionModelValue.trim()
          ? transcriptionModelValue.trim()
          : DEFAULT_APP_SETTINGS.transcriptionModelId,
      cleanupEnabled:
        typeof persistedValues.cleanupEnabled === 'boolean'
          ? persistedValues.cleanupEnabled
          : DEFAULT_APP_SETTINGS.cleanupEnabled,
    };
  }

  async function saveSettings(settings: Partial<AppSettings>): Promise<void> {
    const timestamp = now();

    for (const [key, value] of Object.entries(settings)) {
      await database.execute(
        `INSERT OR REPLACE INTO app_settings (key, value_json, updated_at)
         VALUES (?, ?, ?)`,
        [key, JSON.stringify(value), timestamp],
      );
    }
  }

  return {
    getSettings,
    saveSettings,
  };
}
