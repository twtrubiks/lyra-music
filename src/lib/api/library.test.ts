import { describe, it, expect, vi } from 'vitest';

const mockInvoke = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

import { getTracksByAlbum, getAllAlbums } from './library';

describe('getTracksByAlbum', () => {
  it('passes album and artist to invoke', async () => {
    mockInvoke.mockResolvedValueOnce([]);

    await getTracksByAlbum('Greatest Hits', 'Artist A');

    expect(mockInvoke).toHaveBeenCalledWith('get_tracks_by_album', {
      album: 'Greatest Hits',
      artist: 'Artist A',
    });
  });
});

describe('getAllAlbums', () => {
  it('calls invoke with correct command', async () => {
    mockInvoke.mockResolvedValueOnce([]);

    await getAllAlbums();

    expect(mockInvoke).toHaveBeenCalledWith('get_all_albums');
  });
});
