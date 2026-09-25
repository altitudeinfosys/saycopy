import {
  LANGUAGE_OPTIONS,
  toOpenRouterLanguageCode,
  type LanguageId,
} from '../languages';

describe('language domain', () => {
  it('maps supported languages to OpenRouter language codes', () => {
    expect(toOpenRouterLanguageCode('english')).toBe('en');
    expect(toOpenRouterLanguageCode('spanish')).toBe('es');
    expect(toOpenRouterLanguageCode('arabic')).toBe('ar');
    expect(toOpenRouterLanguageCode('french')).toBe('fr');
    expect(toOpenRouterLanguageCode('german')).toBe('de');
    expect(toOpenRouterLanguageCode('italian')).toBe('it');
    expect(toOpenRouterLanguageCode('portuguese')).toBe('pt');
    expect(toOpenRouterLanguageCode('chinese')).toBe('zh');
    expect(toOpenRouterLanguageCode('japanese')).toBe('ja');
    expect(toOpenRouterLanguageCode('korean')).toBe('ko');
    expect(toOpenRouterLanguageCode('hindi')).toBe('hi');
    expect(toOpenRouterLanguageCode('auto')).toBeUndefined();
  });

  it('exposes UI labels for first-class languages', () => {
    expect(LANGUAGE_OPTIONS).toEqual([
      { id: 'auto', label: 'Auto-detect' },
      { id: 'english', label: 'English', openRouterLanguageCode: 'en' },
      { id: 'spanish', label: 'Spanish', openRouterLanguageCode: 'es' },
      { id: 'arabic', label: 'Arabic', openRouterLanguageCode: 'ar' },
      { id: 'french', label: 'French', openRouterLanguageCode: 'fr' },
      { id: 'german', label: 'German', openRouterLanguageCode: 'de' },
      { id: 'italian', label: 'Italian', openRouterLanguageCode: 'it' },
      { id: 'portuguese', label: 'Portuguese', openRouterLanguageCode: 'pt' },
      { id: 'chinese', label: 'Chinese', openRouterLanguageCode: 'zh' },
      { id: 'japanese', label: 'Japanese', openRouterLanguageCode: 'ja' },
      { id: 'korean', label: 'Korean', openRouterLanguageCode: 'ko' },
      { id: 'hindi', label: 'Hindi', openRouterLanguageCode: 'hi' },
    ]);
  });

  it('keeps language ids stable', () => {
    const ids = LANGUAGE_OPTIONS.map((language) => language.id);
    const expectedIds: LanguageId[] = [
      'auto',
      'english',
      'spanish',
      'arabic',
      'french',
      'german',
      'italian',
      'portuguese',
      'chinese',
      'japanese',
      'korean',
      'hindi',
    ];

    expect(ids).toEqual(expectedIds);
  });
});
