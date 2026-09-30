import { isMac } from './platform';
import { t } from '$lib/i18n/index.svelte';

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
      title: t('shortcuts.categoryGlobal'),
      shortcuts: [
        { keys: ['Space'], description: t('shortcuts.playPause') },
        { keys: ['←'], description: t('shortcuts.seekBack') },
        { keys: ['→'], description: t('shortcuts.seekForward') },
        { keys: ['↑'], description: t('shortcuts.volumeUp') },
        { keys: ['↓'], description: t('shortcuts.volumeDown') },
        { keys: ['N'], description: t('shortcuts.next') },
        { keys: ['P'], description: t('shortcuts.previous') },
        { keys: ['S'], description: t('shortcuts.shuffle') },
        { keys: ['R'], description: t('shortcuts.repeat') },
        { keys: ['M'], description: t('shortcuts.miniMode') },
        { keys: ['L'], description: t('shortcuts.lyrics') },
        { keys: ['Escape'], description: t('shortcuts.dismiss') },
        { keys: [mod, 'F'], description: t('shortcuts.search') },
        { keys: ['?'], description: t('shortcuts.showHelp') },
      ],
    },
    {
      title: t('shortcuts.categoryTrackList'),
      shortcuts: [
        { keys: ['↑'], description: t('shortcuts.focusUp') },
        { keys: ['↓'], description: t('shortcuts.focusDown') },
        { keys: ['Shift', '↑'], description: t('shortcuts.extendUp') },
        { keys: ['Shift', '↓'], description: t('shortcuts.extendDown') },
        { keys: [mod, 'A'], description: t('shortcuts.selectAll') },
        { keys: ['Enter'], description: t('shortcuts.playFocused') },
        { keys: ['Home'], description: t('shortcuts.jumpFirst') },
        { keys: ['End'], description: t('shortcuts.jumpLast') },
        { keys: [mod, 'Shift', '↑'], description: t('shortcuts.moveTracksUp') },
        { keys: [mod, 'Shift', '↓'], description: t('shortcuts.moveTracksDown') },
      ],
    },
    {
      title: t('shortcuts.categoryPlaylists'),
      shortcuts: [
        { keys: [mod, 'Shift', '↑'], description: t('shortcuts.movePlaylistUp') },
        { keys: [mod, 'Shift', '↓'], description: t('shortcuts.movePlaylistDown') },
      ],
    },
  ];
}
