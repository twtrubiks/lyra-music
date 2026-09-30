import { describe, it, expect, beforeEach } from 'vitest';
import { getLocale, setLocale, toggleLocale, t } from './index.svelte';
import { loadStoredLocale } from './locale';

describe('i18n state', () => {
  beforeEach(() => {
    localStorage.clear();
    setLocale('en');
  });

  it('translates using the current locale', () => {
    expect(t('sidebar.artists')).toBe('Artists');
    setLocale('zh-TW');
    expect(t('sidebar.artists')).toBe('演出者');
  });

  it('persists the chosen locale', () => {
    setLocale('zh-TW');
    expect(getLocale()).toBe('zh-TW');
    expect(loadStoredLocale()).toBe('zh-TW');
  });

  it('keeps <html lang> in sync', () => {
    setLocale('zh-TW');
    expect(document.documentElement.lang).toBe('zh-TW');
    setLocale('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('toggles between the two locales', () => {
    toggleLocale();
    expect(getLocale()).toBe('zh-TW');
    toggleLocale();
    expect(getLocale()).toBe('en');
  });
});
