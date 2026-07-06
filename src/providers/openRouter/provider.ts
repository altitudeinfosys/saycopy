import { getModelPreset } from '../../domain/modelPresets';
import type {
  FlowCleanupTranscriptInput,
  FlowTextResult,
  FlowTranscribeAudioInput,
  FlowTranslateTextInput,
  TranscriptionProvider,
  TranslationProvider,
} from '../../flows/types';
import type { OpenRouterClient } from './client';
import {
  buildCleanupChatRequest,
  buildTranscriptionRequest,
  buildTranslationChatRequest,
} from './requests';

const WHISPER_MODEL_ID = 'openai/whisper-large-v3';

export type OpenRouterProvider = TranscriptionProvider & TranslationProvider;

export type OpenRouterProviderOptions = {
  readonly client: OpenRouterClient;
};

export function createOpenRouterProvider({
  client,
}: OpenRouterProviderOptions): OpenRouterProvider {
  async function transcribeAudio(input: FlowTranscribeAudioInput): Promise<FlowTextResult> {
    const result = await client.requestTranscription(
      buildTranscriptionRequest({
        base64Audio: input.audio.base64Audio,
        format: input.audio.format,
        languageId: input.sourceLanguageId,
      }),
    );

    return {
      text: result.text,
      modelId: WHISPER_MODEL_ID,
    };
  }

  async function cleanupTranscript(input: FlowCleanupTranscriptInput): Promise<FlowTextResult> {
    const modelPreset = getModelPreset(input.modelPresetId);
    const result = await client.requestChatCompletion(
      buildCleanupChatRequest({
        text: input.text,
        modelPreset,
      }),
    );

    return {
      text: result.content,
      modelId: modelPreset.currentModelCandidate,
    };
  }

  async function translateText(input: FlowTranslateTextInput): Promise<FlowTextResult> {
    const modelPreset = getModelPreset(input.modelPresetId);
    const result = await client.requestChatCompletion(
      buildTranslationChatRequest({
        text: input.text,
        targetLanguageId: input.targetLanguageId,
        modelPreset,
      }),
    );

    return {
      text: result.content,
      modelId: modelPreset.currentModelCandidate,
    };
  }

  return {
    cleanupTranscript,
    transcribeAudio,
    translateText,
  };
}
