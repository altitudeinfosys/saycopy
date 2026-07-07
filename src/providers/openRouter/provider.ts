import { getEffectiveChatModelId } from '../../domain/modelPresets';
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
    const modelId = getEffectiveChatModelId(input);
    const result = await client.requestChatCompletion(
      buildCleanupChatRequest({
        text: input.text,
        modelId,
      }),
    );

    return {
      text: result.content,
      modelId,
    };
  }

  async function translateText(input: FlowTranslateTextInput): Promise<FlowTextResult> {
    const modelId = getEffectiveChatModelId(input);
    const result = await client.requestChatCompletion(
      buildTranslationChatRequest({
        text: input.text,
        targetLanguageId: input.targetLanguageId,
        modelId,
      }),
    );

    return {
      text: result.content,
      modelId,
    };
  }

  return {
    cleanupTranscript,
    transcribeAudio,
    translateText,
  };
}
