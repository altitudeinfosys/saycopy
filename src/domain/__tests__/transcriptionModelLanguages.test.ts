import {
  getRecommendedTranscriptionModelForLanguage,
  getTranscriptionLanguageBadge,
  getTranscriptionLanguageCoverage,
  getTranscriptionLanguageCoverageLabel,
  sortByTranscriptionLanguageCoverage,
  getTranscriptionLanguageSupport,
  isKnownCompatibleTranscriptionModel,
  resolveTranscriptionModelId,
} from '../transcriptionModelLanguages';

describe('transcription model language support', () => {
  it('marks Parakeet as incompatible with Arabic while keeping Spanish compatible', () => {
    expect(getTranscriptionLanguageSupport('nvidia/parakeet-tdt-0.6b-v3', 'arabic')).toBe(
      'unsupported',
    );
    expect(isKnownCompatibleTranscriptionModel('nvidia/parakeet-tdt-0.6b-v3', 'arabic')).toBe(
      false,
    );
    expect(isKnownCompatibleTranscriptionModel('nvidia/parakeet-tdt-0.6b-v3', 'spanish')).toBe(true);
  });

  it('identifies Chirp Arabic support as preview', () => {
    expect(getTranscriptionLanguageSupport('google/chirp-3', 'arabic')).toBe('preview');
    expect(getTranscriptionLanguageBadge('google/chirp-3', 'arabic')).toBe('Arabic preview');
  });

  it('keeps unknown future models visible but labels their coverage unverified', () => {
    expect(isKnownCompatibleTranscriptionModel('provider/future-model', 'arabic')).toBe(true);
    expect(getTranscriptionLanguageBadge('provider/future-model', 'arabic')).toBe(
      'Arabic support unverified',
    );
  });

  it('allows every preferred model to coexist with the dedicated Auto engine', () => {
    expect(getTranscriptionLanguageBadge('openai/gpt-4o-transcribe', 'auto')).toBe(
      'Preferred model for selected languages',
    );
    expect(getTranscriptionLanguageBadge('openai/whisper-large-v3', 'auto')).toBe(
      'Preferred model for selected languages',
    );
    expect(getTranscriptionLanguageBadge('deepgram/nova-3', 'auto')).toBe(
      'Preferred model for selected languages',
    );
    expect(isKnownCompatibleTranscriptionModel('deepgram/nova-3', 'auto')).toBe(true);
    expect(isKnownCompatibleTranscriptionModel('provider/future-model', 'auto')).toBe(true);
  });

  it('uses GPT-4o Transcribe for reliable original-language auto-detect', () => {
    expect(resolveTranscriptionModelId('deepgram/nova-3', 'auto')).toBe(
      'openai/gpt-4o-transcribe',
    );
    expect(resolveTranscriptionModelId('provider/future-model', 'auto')).toBe(
      'openai/gpt-4o-transcribe',
    );
    expect(resolveTranscriptionModelId('deepgram/nova-3', 'arabic')).toBe('deepgram/nova-3');
    expect(resolveTranscriptionModelId(undefined, 'english')).toBe('openai/whisper-large-v3-turbo');
    expect(resolveTranscriptionModelId('microsoft/mai-transcribe-1.5', 'auto')).toBe(
      'openai/gpt-4o-transcribe',
    );
  });

  it('summarizes coverage across all app languages', () => {
    expect(getTranscriptionLanguageCoverageLabel('openai/whisper-large-v3-turbo')).toBe(
      'All 11 app languages',
    );
    expect(getTranscriptionLanguageCoverageLabel('google/chirp-3')).toBe('All 11 app languages');
    expect(getTranscriptionLanguageCoverageLabel('nvidia/parakeet-tdt-0.6b-v3')).toBe(
      '6 of 11 app languages · no Arabic, Chinese, Japanese, Korean, Hindi',
    );
    expect(getTranscriptionLanguageCoverageLabel('provider/future-model')).toBe(
      'Language coverage unverified',
    );
    expect(getTranscriptionLanguageCoverage('nvidia/parakeet-tdt-0.6b-v3')).toMatchObject({
      supportedCount: 6,
      totalCount: 11,
      unverified: [],
    });
  });

  it('badges the new languages per model', () => {
    expect(getTranscriptionLanguageBadge('deepgram/nova-3', 'korean')).toBe('Korean supported');
    expect(getTranscriptionLanguageBadge('nvidia/parakeet-tdt-0.6b-v3', 'hindi')).toBe(
      'Hindi not supported',
    );
    expect(getTranscriptionLanguageBadge('provider/future-model', 'french')).toBe(
      'French support unverified',
    );
  });

  it('orders models by widest coverage and keeps ties in place', () => {
    const models = [
      { id: 'provider/future-model' },
      { id: 'nvidia/parakeet-tdt-0.6b-v3' },
      { id: 'openai/whisper-large-v3' },
      { id: 'deepgram/nova-3' },
    ];

    expect(sortByTranscriptionLanguageCoverage(models).map((model) => model.id)).toEqual([
      'openai/whisper-large-v3',
      'deepgram/nova-3',
      'nvidia/parakeet-tdt-0.6b-v3',
      'provider/future-model',
    ]);
  });

  it('recommends a fully supported model for any language', () => {
    expect(getRecommendedTranscriptionModelForLanguage('japanese')).toBe(
      'openai/whisper-large-v3-turbo',
    );
    expect(getRecommendedTranscriptionModelForLanguage('auto')).toBe(
      'openai/whisper-large-v3-turbo',
    );
  });
});
