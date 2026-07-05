import type { HistoryItem, HistorySourceType } from '../domain/history';
import type { ConcreteLanguageId, LanguageId } from '../domain/languages';
import type { ModelPresetId } from '../domain/modelPresets';

export type FlowAudioFormat = 'm4a';

export type FlowAudioInput = {
  readonly uri?: string;
  readonly base64Audio: string;
  readonly format: FlowAudioFormat;
  readonly durationMs?: number;
};

export type FlowTextResult = {
  readonly text: string;
  readonly modelId?: string;
};

export type FlowTranscribeAudioInput = {
  readonly audio: FlowAudioInput;
  readonly sourceLanguageId: LanguageId;
  readonly modelPresetId: ModelPresetId;
};

export type FlowCleanupTranscriptInput = {
  readonly text: string;
  readonly sourceLanguageId: LanguageId;
  readonly modelPresetId: ModelPresetId;
};

export type FlowTranslateTextInput = {
  readonly text: string;
  readonly sourceLanguageId: LanguageId;
  readonly targetLanguageId: ConcreteLanguageId;
  readonly modelPresetId: ModelPresetId;
};

export type TranscriptionProvider = {
  readonly transcribeAudio: (input: FlowTranscribeAudioInput) => Promise<FlowTextResult>;
  readonly cleanupTranscript: (input: FlowCleanupTranscriptInput) => Promise<FlowTextResult>;
};

export type TranslationProvider = {
  readonly transcribeAudio: (input: FlowTranscribeAudioInput) => Promise<FlowTextResult>;
  readonly translateText: (input: FlowTranslateTextInput) => Promise<FlowTextResult>;
};

type BaseFlowCreateHistoryItemInput = {
  readonly sourceType?: HistorySourceType;
  readonly sourceLanguageId?: LanguageId;
  readonly primaryText: string;
  readonly modelPresetId?: ModelPresetId;
  readonly sttModelId?: string;
  readonly tags?: readonly string[];
};

export type FlowCreateTranscribeHistoryItemInput = BaseFlowCreateHistoryItemInput & {
  readonly mode?: 'transcribe';
  readonly targetLanguageId?: never;
  readonly sourceText?: never;
  readonly translatedText?: never;
  readonly textModelId?: never;
};

export type FlowCreateTranslateHistoryItemInput = BaseFlowCreateHistoryItemInput & {
  readonly mode: 'translate';
  readonly targetLanguageId: ConcreteLanguageId;
  readonly sourceText: string;
  readonly translatedText: string;
  readonly textModelId?: string;
};

export type FlowCreateHistoryItemInput =
  | FlowCreateTranscribeHistoryItemInput
  | FlowCreateTranslateHistoryItemInput;

export type FlowHistoryRepository = {
  readonly createHistoryItem: (input: FlowCreateHistoryItemInput) => Promise<HistoryItem>;
};

export type TemporaryAudioCleanup = {
  readonly cleanup: (audio: FlowAudioInput) => Promise<void>;
};
