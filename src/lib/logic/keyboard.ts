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
  | 'mini-exit'
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
    case 'Escape':
      return 'mini-exit';
    case '?':
      return 'show-shortcuts';
    default:
      return null;
  }
}
