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

export type FlowCreateHistoryItemInput = {
  readonly mode?: 'transcribe' | 'translate';
  readonly sourceType?: HistorySourceType;
  readonly sourceLanguageId?: LanguageId;
  readonly targetLanguageId?: ConcreteLanguageId;
  readonly primaryText: string;
  readonly sourceText?: string;
  readonly translatedText?: string;
  readonly modelPresetId?: ModelPresetId;
  readonly sttModelId?: string;
  readonly textModelId?: string;
  readonly tags?: readonly string[];
};

export type FlowHistoryRepository = {
  readonly createHistoryItem: (input: FlowCreateHistoryItemInput) => Promise<HistoryItem>;
};

export type TemporaryAudioCleanup = {
  readonly cleanup: (audio: FlowAudioInput) => Promise<void>;
};
