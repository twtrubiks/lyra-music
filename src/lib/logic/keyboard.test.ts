import { describe, it, expect } from 'vitest';
import { mapKeyToAction, resolveDismissTarget } from './keyboard';

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

  it('l → lyrics-toggle', () => {
    expect(mapKeyToAction({ key: 'l', ...base })).toBe('lyrics-toggle');
  });

  it('Escape → dismiss', () => {
    expect(mapKeyToAction({ key: 'Escape', ...base })).toBe('dismiss');
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

  it('帶 Ctrl/Cmd 的組合鍵不觸發單鍵動作（如 Ctrl+Shift+↑ 列表重排不得調音量）', () => {
    expect(mapKeyToAction({ key: 'ArrowUp', ctrlKey: true, metaKey: false })).toBeNull();
    expect(mapKeyToAction({ key: 'ArrowDown', ctrlKey: true, metaKey: false })).toBeNull();
    expect(mapKeyToAction({ key: 'n', ctrlKey: true, metaKey: false })).toBeNull();
    expect(mapKeyToAction({ key: 'ArrowUp', ctrlKey: false, metaKey: true })).toBeNull();
  });
});

describe('resolveDismissTarget', () => {
  it('一般模式且歌詞開啟 → 先關歌詞', () => {
    expect(resolveDismissTarget(false, true)).toBe('lyrics');
  });

  it('一般模式且歌詞關閉 → 退出迷你模式（no-op）', () => {
    expect(resolveDismissTarget(false, false)).toBe('mini');
  });

  it('迷你模式下一律退出迷你模式（面板未渲染，即使 showLyrics 殘留為 true）', () => {
    expect(resolveDismissTarget(true, true)).toBe('mini');
    expect(resolveDismissTarget(true, false)).toBe('mini');
  });
});
