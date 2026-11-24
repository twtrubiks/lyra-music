import { confirm } from '@tauri-apps/plugin-dialog';
import { t } from '$lib/i18n/index.svelte';

/**
 * Asks before deleting a playlist: unlike trashing a track there is no way
 * to get one back, and the delete button sits right next to the name.
 * Resolves to whether the user confirmed; rejects if the dialog cannot be
 * shown, so a caller never deletes without having asked.
 */
export async function confirmDeletePlaylist(name: string): Promise<boolean> {
  return confirm(t('sidebar.deletePlaylistConfirm', { name }), {
    title: t('sidebar.deletePlaylist'),
    kind: 'warning',
    okLabel: t('sidebar.delete'),
    cancelLabel: t('common.cancel'),
  });
}
