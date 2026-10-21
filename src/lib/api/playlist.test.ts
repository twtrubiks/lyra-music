import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInvoke = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

import {
  createPlaylist,
  getAllPlaylists,
  getPlaylistTracks,
  addToPlaylist,
  removeFromPlaylist,
  batchAddToPlaylist,
  batchRemoveFromPlaylist,
  reorderPlaylist,
  reorderPlaylists,
  renamePlaylist,
  deletePlaylist,
  savePlaybackPosition,
  getLastPlaybackPosition,
} from './playlist';

// Command names and argument keys must match the Rust #[tauri::command]
// handlers (camelCase keys map to snake_case params) — a typo only fails at
// runtime, so pin every wrapper's IPC call.
describe('IPC command contract', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(undefined);
  });

  it.each([
    ['createPlaylist', () => createPlaylist('Mix'), ['create_playlist', { name: 'Mix' }]],
    ['getAllPlaylists', () => getAllPlaylists(), ['get_all_playlists']],
    ['getPlaylistTracks', () => getPlaylistTracks(3), ['get_playlist_tracks', { playlistId: 3 }]],
    [
      'addToPlaylist',
      () => addToPlaylist(3, 7),
      ['add_to_playlist', { playlistId: 3, trackId: 7 }],
    ],
    [
      'removeFromPlaylist',
      () => removeFromPlaylist(3, 7),
      ['remove_from_playlist', { playlistId: 3, trackId: 7 }],
    ],
    [
      'batchAddToPlaylist',
      () => batchAddToPlaylist(3, [7, 8]),
      ['batch_add_to_playlist', { playlistId: 3, trackIds: [7, 8] }],
    ],
    [
      'batchRemoveFromPlaylist',
      () => batchRemoveFromPlaylist(3, [7, 8]),
      ['batch_remove_from_playlist', { playlistId: 3, trackIds: [7, 8] }],
    ],
    [
      'reorderPlaylist',
      () => reorderPlaylist(3, [8, 7]),
      ['reorder_playlist', { playlistId: 3, trackIds: [8, 7] }],
    ],
    [
      'reorderPlaylists',
      () => reorderPlaylists([2, 1]),
      ['reorder_playlists', { playlistIds: [2, 1] }],
    ],
    [
      'renamePlaylist',
      () => renamePlaylist(3, 'New'),
      ['rename_playlist', { id: 3, newName: 'New' }],
    ],
    ['deletePlaylist', () => deletePlaylist(3), ['delete_playlist', { id: 3 }]],
    [
      'savePlaybackPosition',
      () => savePlaybackPosition(3, 7, 42.5),
      ['save_playback_position', { playlistId: 3, trackId: 7, secs: 42.5 }],
    ],
    [
      'getLastPlaybackPosition',
      () => getLastPlaybackPosition(3),
      ['get_last_playback_position', { playlistId: 3 }],
    ],
  ] as const)('%s', async (_, call, expected) => {
    await call();
    expect(mockInvoke).toHaveBeenCalledExactlyOnceWith(...expected);
  });
});
