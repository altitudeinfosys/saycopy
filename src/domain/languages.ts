export type LanguageId =
  | 'auto'
  | 'english'
  | 'spanish'
  | 'arabic'
  | 'french'
  | 'german'
  | 'italian'
  | 'portuguese'
  | 'chinese'
  | 'japanese'
  | 'korean'
  | 'hindi';

export type ConcreteLanguageId = Exclude<LanguageId, 'auto'>;

export type OpenRouterLanguageCode =
  | 'en'
  | 'es'
  | 'ar'
  | 'fr'
  | 'de'
  | 'it'
  | 'pt'
  | 'zh'
  | 'ja'
  | 'ko'
  | 'hi';

export type LanguageOption = {
  readonly id: LanguageId;
  readonly label: string;
  readonly openRouterLanguageCode?: OpenRouterLanguageCode;
};

export const LANGUAGE_OPTIONS: readonly LanguageOption[] = [
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
] as const;

export const CONCRETE_LANGUAGE_IDS: readonly ConcreteLanguageId[] = LANGUAGE_OPTIONS.flatMap(
  (language) => (language.id === 'auto' ? [] : [language.id]),
);

export function toOpenRouterLanguageCode(
  languageId: LanguageId,
): OpenRouterLanguageCode | undefined {
  return LANGUAGE_OPTIONS.find((language) => language.id === languageId)?.openRouterLanguageCode;
}

export function getLanguageLabel(languageId: LanguageId): string {
  return LANGUAGE_OPTIONS.find((language) => language.id === languageId)?.label ?? 'Auto-detect';
}
