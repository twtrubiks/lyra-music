export type KeyAction =
  | 'play-pause'
  | 'seek-back'
  | 'seek-forward'
  | 'vol-up'
  | 'vol-down'
  | 'next'
  | 'prev'
  | 'shuffle'
  | 'repeat'
  | 'mini-toggle'
  | 'lyrics-toggle'
  | 'dismiss'
  | 'focus-search'
  | 'show-shortcuts'
  | null;

/**
 * 將鍵盤事件映射為播放器動作。
 * 純函式，不依賴 DOM 狀態。
 */
export function mapKeyToAction(e: { key: string; ctrlKey: boolean; metaKey: boolean }): KeyAction {
  // Ctrl+F or Cmd+F → focus search
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
    return 'focus-search';
  }

  switch (e.key) {
    case ' ':
      return 'play-pause';
    case 'ArrowLeft':
      return 'seek-back';
    case 'ArrowRight':
      return 'seek-forward';
    case 'ArrowUp':
      return 'vol-up';
    case 'ArrowDown':
      return 'vol-down';
    case 'n':
      return 'next';
    case 'p':
      return 'prev';
    case 's':
      return 'shuffle';
    case 'r':
      return 'repeat';
    case 'm':
      return 'mini-toggle';
    case 'l':
      return 'lyrics-toggle';
    case 'Escape':
      // 依序關閉最上層的東西：歌詞面板 → 迷你模式（由 App 決定）
      return 'dismiss';
    case '?':
      return 'show-shortcuts';
    default:
      return null;
  }
}

/**
 * Escape 的優先序：一般模式下先關歌詞面板，否則退出迷你模式。
 * 迷你模式下面板不會渲染，即使 showLyrics 殘留為 true 也直接退迷你。
 */
export function resolveDismissTarget(miniMode: boolean, showLyrics: boolean): 'lyrics' | 'mini' {
  return !miniMode && showLyrics ? 'lyrics' : 'mini';
}
