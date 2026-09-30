import { en, type MessageKey, type Messages } from './locales/en';
import { zhTW } from './locales/zh-TW';

export const SUPPORTED_LOCALES = ['en', 'zh-TW'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';
export const LOCALE_STORAGE_KEY = 'lyra-locale';

/** Name of each locale in its own language, for the language switcher. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  'zh-TW': '繁體中文',
};

/**
 * A message is either a plain template or a set of plural forms selected by
 * the `count` param. Languages without plural inflection only need `other`.
 */
export type PluralMessage = { one?: string; other: string };
export type Message = string | PluralMessage;
export type MessageParams = Record<string, string | number>;

const DICTIONARIES: Record<Locale, Messages> = { en, 'zh-TW': zhTW };

function isLocale(value: unknown): value is Locale {
  return SUPPORTED_LOCALES.includes(value as Locale);
}

/**
 * Pick the first supported language from the user's preference list
 * (`navigator.languages`). Every Chinese variant maps to zh-TW — it is the
 * only Chinese translation available.
 */
export function detectLocale(languages: readonly string[]): Locale {
  for (const language of languages) {
    const primary = language.toLowerCase().split('-')[0];
    if (primary === 'zh') return 'zh-TW';
    if (primary === 'en') return 'en';
  }
  return DEFAULT_LOCALE;
}

export function loadStoredLocale(): Locale | null {
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    return isLocale(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function saveLocale(locale: Locale): void {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Storage unavailable — the choice simply lasts for this session only.
  }
}

/** The user's explicit choice wins; otherwise follow the system language. */
export function resolveInitialLocale(languages: readonly string[]): Locale {
  return loadStoredLocale() ?? detectLocale(languages);
}

/** Replace `{name}` placeholders. Unknown placeholders are left as-is. */
export function interpolate(template: string, params: MessageParams): string {
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : placeholder,
  );
}

function selectForm(locale: Locale, message: Message, params: MessageParams): string {
  if (typeof message === 'string') return message;
  const category = new Intl.PluralRules(locale).select(Number(params.count));
  return (category === 'one' ? message.one : undefined) ?? message.other;
}

export function translate(locale: Locale, key: MessageKey, params: MessageParams = {}): string {
  const message = DICTIONARIES[locale][key] ?? en[key];
  return interpolate(selectForm(locale, message, params), params);
}
