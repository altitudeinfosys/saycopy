import type { TranscribeHistoryItem } from '../domain/history';
import type { LanguageId } from '../domain/languages';
import type { ModelPresetId } from '../domain/modelPresets';
import type {
  FlowAudioInput,
  FlowHistoryRepository,
  TemporaryAudioCleanup,
  TranscriptionProvider,
} from './types';
import { cleanupTemporaryAudio } from './temporaryAudioCleanup';

export type RunTranscriptionFlowInput = {
  readonly audio: FlowAudioInput;
  readonly sourceLanguageId: LanguageId;
  readonly modelPresetId: ModelPresetId;
  readonly customModelId?: string;
  readonly cleanupEnabled: boolean;
};

export type TranscriptionFlowDependencies = {
  readonly provider: TranscriptionProvider;
  readonly historyRepository: FlowHistoryRepository;
  readonly temporaryAudio?: TemporaryAudioCleanup;
};

export type TranscriptionFlowSuccessResult = {
  readonly status: 'success';
  readonly transcript: string;
  readonly historyItem: TranscribeHistoryItem;
};

export type TranscriptionFlowCleanupFailedResult = {
  readonly status: 'cleanup_failed';
  readonly transcript: string;
  readonly notice: {
    readonly code: 'cleanup_failed';
    readonly message: string;
  };
  readonly historyItem: TranscribeHistoryItem;
};

export type TranscriptionFlowResult =
  | TranscriptionFlowSuccessResult
  | TranscriptionFlowCleanupFailedResult;

export async function runTranscriptionFlow(
  dependencies: TranscriptionFlowDependencies,
  input: RunTranscriptionFlowInput,
): Promise<TranscriptionFlowResult> {
  try {
    const sttResult = await dependencies.provider.transcribeAudio({
      audio: input.audio,
      sourceLanguageId: input.sourceLanguageId,
      modelPresetId: input.modelPresetId,
    });
    let visibleText = sttResult.text;
    let cleanupFailed = false;

    if (input.cleanupEnabled) {
      try {
        visibleText = (
          await dependencies.provider.cleanupTranscript({
            text: sttResult.text,
            sourceLanguageId: input.sourceLanguageId,
            modelPresetId: input.modelPresetId,
            customModelId: input.customModelId,
          })
        ).text;
      } catch {
        cleanupFailed = true;
      }
    }

    const historyItem = (await dependencies.historyRepository.createHistoryItem({
      mode: 'transcribe',
      sourceType: 'voice',
      sourceLanguageId: input.sourceLanguageId,
      primaryText: visibleText,
      modelPresetId: input.modelPresetId,
      sttModelId: sttResult.modelId,
    })) as TranscribeHistoryItem;

    if (cleanupFailed) {
      return {
        status: 'cleanup_failed',
        transcript: visibleText,
        notice: {
          code: 'cleanup_failed',
          message: 'Cleanup failed. Showing the raw transcript.',
        },
        historyItem,
      };
    }

    return {
      status: 'success',
      transcript: visibleText,
      historyItem,
    };
  } finally {
    await cleanupTemporaryAudio(dependencies.temporaryAudio, input.audio);
  }
}
