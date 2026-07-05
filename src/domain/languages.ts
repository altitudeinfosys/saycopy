export type LanguageId = 'auto' | 'english' | 'spanish' | 'arabic';

export type OpenRouterLanguageCode = 'en' | 'es' | 'ar';

export type LanguageOption = {
  readonly id: LanguageId;
  readonly label: string;
  readonly openRouterLanguageCode?: OpenRouterLanguageCode;
};

export const LANGUAGE_OPTIONS: readonly LanguageOption[] = [
  { id: 'auto', label: 'English (Auto)' },
  { id: 'english', label: 'English', openRouterLanguageCode: 'en' },
  { id: 'spanish', label: 'Spanish', openRouterLanguageCode: 'es' },
  { id: 'arabic', label: 'Arabic', openRouterLanguageCode: 'ar' },
] as const;

export function toOpenRouterLanguageCode(
  languageId: LanguageId,
): OpenRouterLanguageCode | undefined {
  return LANGUAGE_OPTIONS.find((language) => language.id === languageId)?.openRouterLanguageCode;
}
