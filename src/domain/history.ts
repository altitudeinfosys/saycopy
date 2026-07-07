import type { ConcreteLanguageId, LanguageId } from './languages';

export type HistoryMode = 'transcribe' | 'translate';

export type HistorySourceType = 'voice' | 'manual';

export type Tag = {
  readonly id: string;
  readonly label: string;
  readonly color?: string;
};

type BaseHistoryItem = {
  readonly id: string;
  readonly sourceType: HistorySourceType;
  readonly createdAt: string;
  readonly updatedAt?: string;
  readonly sourceLanguageId: LanguageId;
  readonly tags?: readonly Tag[];
};

export type TranscribeHistoryItem = BaseHistoryItem & {
  readonly mode: 'transcribe';
  readonly transcript: string;
};

export type TranslateHistoryItem = BaseHistoryItem & {
  readonly mode: 'translate';
  readonly transcript: string;
  readonly translatedText: string;
  readonly targetLanguageId: ConcreteLanguageId;
};

export type HistoryItem = TranscribeHistoryItem | TranslateHistoryItem;

export const HISTORY_MODES = ['transcribe', 'translate'] as const satisfies readonly HistoryMode[];

export const HISTORY_SOURCE_TYPES = ['voice', 'manual'] as const satisfies readonly HistorySourceType[];

export function getHistoryPrimaryText(historyItem: HistoryItem): string {
  return historyItem.mode === 'translate' ? historyItem.translatedText : historyItem.transcript;
}
