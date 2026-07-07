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
    expect(toOpenRouterLanguageCode('auto')).toBeUndefined();
  });

  it('exposes UI labels for first-class languages', () => {
    expect(LANGUAGE_OPTIONS).toEqual([
      { id: 'auto', label: 'Auto-detect' },
      { id: 'english', label: 'English', openRouterLanguageCode: 'en' },
      { id: 'spanish', label: 'Spanish', openRouterLanguageCode: 'es' },
      { id: 'arabic', label: 'Arabic', openRouterLanguageCode: 'ar' },
    ]);
  });

  it('keeps language ids stable', () => {
    const ids = LANGUAGE_OPTIONS.map((language) => language.id);
    const expectedIds: LanguageId[] = ['auto', 'english', 'spanish', 'arabic'];

    expect(ids).toEqual(expectedIds);
  });
});
