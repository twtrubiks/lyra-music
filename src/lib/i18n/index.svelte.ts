import {
  resolveInitialLocale,
  saveLocale,
  translate,
  type Locale,
  type MessageParams,
} from './locale';
import type { MessageKey } from './locales/en';

export type { Locale, MessageParams } from './locale';
export type { MessageKey } from './locales/en';
export { LOCALE_NAMES, SUPPORTED_LOCALES } from './locale';

/** Keys naming an operation, used as the subject of "… failed" notifications. */
export type ActionKey = Extract<MessageKey, `action.${string}`>;

function applyDocumentLang(value: Locale): void {
  if (typeof document !== 'undefined') document.documentElement.lang = value;
}

function initialLocale(): Locale {
  const languages = typeof navigator === 'undefined' ? [] : (navigator.languages ?? []);
  return resolveInitialLocale(languages);
}

const startupLocale = initialLocale();
let locale = $state<Locale>(startupLocale);
applyDocumentLang(startupLocale);

export function getLocale(): Locale {
  return locale;
}

export function setLocale(next: Locale): void {
  locale = next;
  saveLocale(next);
  applyDocumentLang(next);
}

export function toggleLocale(): void {
  setLocale(locale === 'en' ? 'zh-TW' : 'en');
}

/**
 * Translate a message in the current locale. Reads reactive state, so any
 * template or `$derived` calling it updates when the language is switched.
 */
export function t(key: MessageKey, params?: MessageParams): string {
  return translate(locale, key, params);
}
