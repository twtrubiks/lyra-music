import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@tauri-apps/plugin-dialog', () => ({ confirm: vi.fn() }));

import { confirm } from '@tauri-apps/plugin-dialog';
import { setLocale } from '$lib/i18n/index.svelte';
import { confirmDeletePlaylist } from './confirm';

const confirmMock = vi.mocked(confirm);

describe('confirmDeletePlaylist', () => {
  beforeEach(() => {
    confirmMock.mockReset();
    setLocale('en');
  });

  it('asks with the playlist name and localized buttons', async () => {
    confirmMock.mockResolvedValue(true);

    await confirmDeletePlaylist('Road trip');

    expect(confirmMock).toHaveBeenCalledWith(expect.stringContaining('Road trip'), {
      title: 'Delete playlist',
      kind: 'warning',
      okLabel: 'Delete',
      cancelLabel: 'Cancel',
    });
  });

  it('returns what the user chose', async () => {
    confirmMock.mockResolvedValue(true);
    expect(await confirmDeletePlaylist('A')).toBe(true);

    confirmMock.mockResolvedValue(false);
    expect(await confirmDeletePlaylist('A')).toBe(false);
  });

  it('uses the active locale', async () => {
    setLocale('zh-TW');
    confirmMock.mockResolvedValue(false);

    await confirmDeletePlaylist('通勤');

    const [message, options] = confirmMock.mock.calls[0];
    expect(message).toContain('通勤');
    expect(options).toMatchObject({ title: '刪除播放清單', okLabel: '刪除', cancelLabel: '取消' });
  });

  it('rejects when the dialog cannot be shown, so nothing is deleted unasked', async () => {
    confirmMock.mockRejectedValue(new Error('no dialog'));
    await expect(confirmDeletePlaylist('A')).rejects.toThrow('no dialog');
  });
});
