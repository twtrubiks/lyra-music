import { describe, it, expect, beforeEach } from 'vitest';
import {
  detectLocale,
  interpolate,
  loadStoredLocale,
  saveLocale,
  resolveInitialLocale,
  translate,
  LOCALE_STORAGE_KEY,
} from './locale';
import { en } from './locales/en';
import { zhTW } from './locales/zh-TW';

describe('detectLocale', () => {
  it('maps Traditional Chinese to zh-TW', () => {
    expect(detectLocale(['zh-TW', 'en-US'])).toBe('zh-TW');
  });

  it('maps any Chinese variant to zh-TW', () => {
    expect(detectLocale(['zh-CN'])).toBe('zh-TW');
    expect(detectLocale(['zh-HK'])).toBe('zh-TW');
    expect(detectLocale(['zh'])).toBe('zh-TW');
    expect(detectLocale(['zh-Hant-TW'])).toBe('zh-TW');
  });

  it('maps English variants to en', () => {
    expect(detectLocale(['en-US'])).toBe('en');
    expect(detectLocale(['en-GB', 'zh-TW'])).toBe('en');
  });

  it('is case-insensitive', () => {
    expect(detectLocale(['ZH-tw'])).toBe('zh-TW');
  });

  it('skips unsupported languages and uses the next preference', () => {
    expect(detectLocale(['ja-JP', 'zh-TW', 'en'])).toBe('zh-TW');
  });

  it('falls back to en when nothing matches', () => {
    expect(detectLocale(['ja-JP', 'fr'])).toBe('en');
    expect(detectLocale([])).toBe('en');
  });
});

describe('stored locale', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns null when nothing is stored', () => {
    expect(loadStoredLocale()).toBeNull();
  });

  it('round-trips a saved locale', () => {
    saveLocale('zh-TW');
    expect(loadStoredLocale()).toBe('zh-TW');
  });

  it('ignores an unsupported stored value', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'klingon');
    expect(loadStoredLocale()).toBeNull();
  });
});

describe('resolveInitialLocale', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('prefers the stored choice over detection', () => {
    saveLocale('en');
    expect(resolveInitialLocale(['zh-TW'])).toBe('en');
  });

  it('falls back to detection when nothing is stored', () => {
    expect(resolveInitialLocale(['zh-TW'])).toBe('zh-TW');
  });
});

describe('interpolate', () => {
  it('replaces named placeholders', () => {
    expect(interpolate('{a} and {b}', { a: 'x', b: 2 })).toBe('x and 2');
  });

  it('replaces repeated placeholders', () => {
    expect(interpolate('{n}/{n}', { n: 3 })).toBe('3/3');
  });

  it('leaves unknown placeholders untouched', () => {
    expect(interpolate('{missing}', {})).toBe('{missing}');
  });

  it('ignores placeholders that only match inherited properties', () => {
    expect(interpolate('{constructor} {toString}', {})).toBe('{constructor} {toString}');
  });

  it('does not re-interpolate substituted values', () => {
    expect(interpolate('{a}', { a: '{b}', b: 'x' })).toBe('{b}');
  });
});

describe('translate', () => {
  it('returns the message for the locale', () => {
    expect(translate('en', 'sidebar.allMusic')).toBe('All Music');
    expect(translate('zh-TW', 'sidebar.allMusic')).toBe('所有音樂');
  });

  it('interpolates params', () => {
    expect(translate('en', 'error.failed', { context: 'Play track', message: 'boom' })).toBe(
      'Play track failed: boom',
    );
  });

  it('selects English plural forms by count', () => {
    expect(translate('en', 'common.trackCount', { count: 1 })).toBe('1 track');
    expect(translate('en', 'common.trackCount', { count: 0 })).toBe('0 tracks');
    expect(translate('en', 'common.trackCount', { count: 5 })).toBe('5 tracks');
  });

  it('uses the single Chinese form for any count', () => {
    expect(translate('zh-TW', 'common.trackCount', { count: 1 })).toBe('1 首曲目');
    expect(translate('zh-TW', 'common.trackCount', { count: 5 })).toBe('5 首曲目');
  });
});

describe('dictionaries', () => {
  it('have identical keys', () => {
    expect(Object.keys(zhTW).sort()).toEqual(Object.keys(en).sort());
  });

  it('use the same placeholders in both languages', () => {
    const placeholders = (message: unknown): string[] => {
      const text = typeof message === 'string' ? message : Object.values(message as object).join();
      return [...new Set(text.match(/\{\w+\}/g) ?? [])].sort();
    };
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(placeholders(zhTW[key]), key).toEqual(placeholders(en[key]));
    }
  });
});
