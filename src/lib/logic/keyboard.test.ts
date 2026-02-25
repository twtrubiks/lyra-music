import { describe, it, expect } from 'vitest';
import { mapKeyToAction } from './keyboard';

describe('mapKeyToAction', () => {
  const base = { ctrlKey: false, metaKey: false };

  it('Space → play-pause', () => {
    expect(mapKeyToAction({ key: ' ', ...base })).toBe('play-pause');
  });

  it('ArrowLeft → seek-back', () => {
    expect(mapKeyToAction({ key: 'ArrowLeft', ...base })).toBe('seek-back');
  });

  it('ArrowRight → seek-forward', () => {
    expect(mapKeyToAction({ key: 'ArrowRight', ...base })).toBe('seek-forward');
  });

  it('ArrowUp → vol-up', () => {
    expect(mapKeyToAction({ key: 'ArrowUp', ...base })).toBe('vol-up');
  });

  it('ArrowDown → vol-down', () => {
    expect(mapKeyToAction({ key: 'ArrowDown', ...base })).toBe('vol-down');
  });

  it('n → next', () => {
    expect(mapKeyToAction({ key: 'n', ...base })).toBe('next');
  });

  it('p → prev', () => {
    expect(mapKeyToAction({ key: 'p', ...base })).toBe('prev');
  });

  it('s → shuffle', () => {
    expect(mapKeyToAction({ key: 's', ...base })).toBe('shuffle');
  });

  it('r → repeat', () => {
    expect(mapKeyToAction({ key: 'r', ...base })).toBe('repeat');
  });

  it('m → mini-toggle', () => {
    expect(mapKeyToAction({ key: 'm', ...base })).toBe('mini-toggle');
  });

  it('Escape → mini-exit', () => {
    expect(mapKeyToAction({ key: 'Escape', ...base })).toBe('mini-exit');
  });

  it('Ctrl+f → focus-search', () => {
    expect(mapKeyToAction({ key: 'f', ctrlKey: true, metaKey: false })).toBe('focus-search');
  });

  it('Cmd+f → focus-search', () => {
    expect(mapKeyToAction({ key: 'f', ctrlKey: false, metaKey: true })).toBe('focus-search');
  });

  it('? → show-shortcuts', () => {
    expect(mapKeyToAction({ key: '?', ...base })).toBe('show-shortcuts');
  });

  it('unknown key → null', () => {
    expect(mapKeyToAction({ key: 'x', ...base })).toBeNull();
    expect(mapKeyToAction({ key: 'Enter', ...base })).toBeNull();
    expect(mapKeyToAction({ key: 'Tab', ...base })).toBeNull();
  });

  it('f without modifier → null', () => {
    expect(mapKeyToAction({ key: 'f', ...base })).toBeNull();
  });
});
