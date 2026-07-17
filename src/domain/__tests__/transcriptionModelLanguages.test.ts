import {
  getTranscriptionLanguageBadge,
  getTranscriptionLanguageSupport,
  isKnownCompatibleTranscriptionModel,
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

  it('summarizes verified coverage when source language is auto-detect', () => {
    expect(getTranscriptionLanguageBadge('openai/whisper-large-v3', 'auto')).toBe(
      'English · Spanish · Arabic',
    );
    expect(getTranscriptionLanguageBadge('nvidia/parakeet-tdt-0.6b-v3', 'auto')).toBe(
      'English · Spanish',
    );
  });
});
