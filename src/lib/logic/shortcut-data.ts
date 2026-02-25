import { isMac } from './platform';

export interface ShortcutEntry {
  keys: string[];
  description: string;
}

export interface ShortcutCategory {
  title: string;
  shortcuts: ShortcutEntry[];
}

export function getShortcutCategories(): ShortcutCategory[] {
  const mod = isMac ? 'Cmd' : 'Ctrl';

  return [
    {
      title: '全域播放控制',
      shortcuts: [
        { keys: ['Space'], description: '播放 / 暫停' },
        { keys: ['←'], description: '倒退 5 秒' },
        { keys: ['→'], description: '快進 5 秒' },
        { keys: ['↑'], description: '音量增加' },
        { keys: ['↓'], description: '音量降低' },
        { keys: ['N'], description: '下一首' },
        { keys: ['P'], description: '上一首' },
        { keys: ['S'], description: '隨機播放 開/關' },
        { keys: ['R'], description: '循環模式切換' },
        { keys: ['M'], description: '迷你模式 開/關' },
        { keys: ['Escape'], description: '退出迷你模式' },
        { keys: [mod, 'F'], description: '搜尋' },
        { keys: ['?'], description: '顯示快捷鍵說明' },
      ],
    },
    {
      title: '曲目列表操作',
      shortcuts: [
        { keys: [mod, 'Shift', '↑'], description: '上移選取曲目' },
        { keys: [mod, 'Shift', '↓'], description: '下移選取曲目' },
      ],
    },
    {
      title: '播放清單管理',
      shortcuts: [
        { keys: [mod, 'Shift', '↑'], description: '上移播放清單' },
        { keys: [mod, 'Shift', '↓'], description: '下移播放清單' },
      ],
    },
  ];
}
