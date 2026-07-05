import type { AppError } from '../domain/errors';
import type { TranslateHistoryItem } from '../domain/history';
import type { ConcreteLanguageId, LanguageId } from '../domain/languages';
import type { ModelPresetId } from '../domain/modelPresets';
import type {
  FlowAudioInput,
  FlowHistoryRepository,
  TemporaryAudioCleanup,
  TranslationProvider,
} from './types';
import { cleanupTemporaryAudio } from './temporaryAudioCleanup';

export type RunVoiceTranslationFlowInput = {
  readonly sourceType: 'voice';
  readonly audio: FlowAudioInput;
  readonly sourceLanguageId: LanguageId;
  readonly targetLanguageId: ConcreteLanguageId;
  readonly modelPresetId: ModelPresetId;
};

export type RunManualTranslationFlowInput = {
  readonly sourceType: 'manual';
  readonly text: string;
  readonly sourceLanguageId: LanguageId;
  readonly targetLanguageId: ConcreteLanguageId;
  readonly modelPresetId: ModelPresetId;
};

export type RunTranslationFlowInput =
  | RunVoiceTranslationFlowInput
  | RunManualTranslationFlowInput;

export type TranslationFlowDependencies = {
  readonly provider: TranslationProvider;
  readonly historyRepository: FlowHistoryRepository;
  readonly temporaryAudio?: TemporaryAudioCleanup;
};

export type TranslationFlowSuccessResult = {
  readonly status: 'success';
  readonly sourceType: 'voice' | 'manual';
  readonly sourceText: string;
  readonly translatedText: string;
  readonly primaryText: string;
  readonly historyItem: TranslateHistoryItem;
};

export type TranslationFlowTranslationFailedResult = {
  readonly status: 'translation_failed';
  readonly sourceType: 'voice';
  readonly sourceText: string;
  readonly primaryText: string;
  readonly retry: {
    readonly canRetry: true;
    readonly text: string;
  };
  readonly copyOriginal: {
    readonly text: string;
  };
  readonly error: AppError;
};

export type TranslationFlowResult =
  | TranslationFlowSuccessResult
  | TranslationFlowTranslationFailedResult;

export async function runTranslationFlow(
  dependencies: TranslationFlowDependencies,
  input: RunTranslationFlowInput,
): Promise<TranslationFlowResult> {
  const audio = input.sourceType === 'voice' ? input.audio : undefined;

  try {
    const sourceTextResult =
      input.sourceType === 'voice'
        ? await dependencies.provider.transcribeAudio({
            audio: input.audio,
            sourceLanguageId: input.sourceLanguageId,
            modelPresetId: input.modelPresetId,
          })
        : { text: input.text };
    let translationResult;
    try {
      translationResult = await dependencies.provider.translateText({
        text: sourceTextResult.text,
        sourceLanguageId: input.sourceLanguageId,
        targetLanguageId: input.targetLanguageId,
        modelPresetId: input.modelPresetId,
      });
    } catch (error) {
      if (input.sourceType === 'voice') {
        return {
          status: 'translation_failed',
          sourceType: 'voice',
          sourceText: sourceTextResult.text,
          primaryText: sourceTextResult.text,
          retry: {
            canRetry: true,
            text: sourceTextResult.text,
          },
          copyOriginal: {
            text: sourceTextResult.text,
          },
          error: error as AppError,
        };
      }

      throw error;
    }
    const historyItem = (await dependencies.historyRepository.createHistoryItem({
      mode: 'translate',
      sourceType: input.sourceType,
      sourceLanguageId: input.sourceLanguageId,
      targetLanguageId: input.targetLanguageId,
      primaryText: translationResult.text,
      sourceText: sourceTextResult.text,
      translatedText: translationResult.text,
      modelPresetId: input.modelPresetId,
      ...(sourceTextResult.modelId ? { sttModelId: sourceTextResult.modelId } : {}),
      textModelId: translationResult.modelId,
    })) as TranslateHistoryItem;

    return {
      status: 'success',
      sourceType: input.sourceType,
      sourceText: sourceTextResult.text,
      translatedText: translationResult.text,
      primaryText: translationResult.text,
      historyItem,
    };
  } finally {
    if (audio) {
      await cleanupTemporaryAudio(dependencies.temporaryAudio, audio);
    }
  }
}
