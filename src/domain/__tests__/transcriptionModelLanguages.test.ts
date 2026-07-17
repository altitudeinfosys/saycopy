import {
  getTranscriptionLanguageBadge,
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

  it('distinguishes models that can auto-detect all supported app languages', () => {
    expect(getTranscriptionLanguageBadge('openai/whisper-large-v3', 'auto')).toBe(
      'Auto-detect supported',
    );
    expect(getTranscriptionLanguageBadge('deepgram/nova-3', 'auto')).toBe('Choose a language');
    expect(isKnownCompatibleTranscriptionModel('deepgram/nova-3', 'auto')).toBe(false);
    expect(isKnownCompatibleTranscriptionModel('provider/future-model', 'auto')).toBe(false);
  });

  it('falls back to Whisper for auto-detect with an incompatible or unverified model', () => {
    expect(resolveTranscriptionModelId('deepgram/nova-3', 'auto')).toBe(
      'openai/whisper-large-v3',
    );
    expect(resolveTranscriptionModelId('provider/future-model', 'auto')).toBe(
      'openai/whisper-large-v3',
    );
    expect(resolveTranscriptionModelId('deepgram/nova-3', 'arabic')).toBe('deepgram/nova-3');
    expect(resolveTranscriptionModelId('microsoft/mai-transcribe-1.5', 'auto')).toBe(
      'microsoft/mai-transcribe-1.5',
    );
  });
});
