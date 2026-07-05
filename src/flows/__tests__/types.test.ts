import type { FlowCreateHistoryItemInput } from '../types';

describe('flow types', () => {
  it('keeps history create inputs aligned with flow storage semantics', () => {
    const transcribeInput: FlowCreateHistoryItemInput = {
      mode: 'transcribe',
      sourceType: 'voice',
      sourceLanguageId: 'auto',
      primaryText: 'Visible transcript',
      modelPresetId: 'balanced',
      sttModelId: 'openai/whisper-large-v3',
    };
    const translateInput: FlowCreateHistoryItemInput = {
      mode: 'translate',
      sourceType: 'manual',
      sourceLanguageId: 'english',
      targetLanguageId: 'spanish',
      primaryText: 'Buenos dias',
      sourceText: 'Good morning',
      translatedText: 'Buenos dias',
      modelPresetId: 'balanced',
      textModelId: 'openai/gpt-4.1-mini',
    };

    expect(transcribeInput.mode).toBe('transcribe');
    expect(translateInput.mode).toBe('translate');
  });
});

const transcribeWithTranslationFields: FlowCreateHistoryItemInput = {
  mode: 'transcribe',
  sourceType: 'voice',
  sourceLanguageId: 'auto',
  primaryText: 'Visible transcript',
  // @ts-expect-error Transcribe history writes must not accept translation fields.
  targetLanguageId: 'spanish',
  sourceText: 'Hidden source text',
  translatedText: 'Hidden translated text',
  textModelId: 'openai/gpt-4.1-mini',
};

void transcribeWithTranslationFields;

// @ts-expect-error Translate history writes require target and text fields.
const translateWithoutRequiredFields: FlowCreateHistoryItemInput = {
  mode: 'translate',
  sourceType: 'manual',
  sourceLanguageId: 'english',
  primaryText: 'Buenos dias',
};

void translateWithoutRequiredFields;
