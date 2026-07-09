import { describe, it, expect, vi } from 'vitest';

const mockInvoke = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

import {
  getTracksByAlbum,
  getAllAlbums,
  getTrackLyrics,
  fetchLyricsOnline,
  getWatchedFolders,
  stopWatching,
} from './library';

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

describe('getTrackLyrics', () => {
  it('passes track id to invoke', async () => {
    mockInvoke.mockResolvedValueOnce(null);

    const result = await getTrackLyrics(42);

    expect(mockInvoke).toHaveBeenCalledWith('get_track_lyrics', { id: 42 });
    expect(result).toBeNull();
  });
});

describe('fetchLyricsOnline', () => {
  it('passes track id to invoke and returns the raw lyrics', async () => {
    mockInvoke.mockResolvedValueOnce('[00:01.00] hi');

    const result = await fetchLyricsOnline(42);

    expect(mockInvoke).toHaveBeenCalledWith('fetch_lyrics_online', { id: 42 });
    expect(result).toBe('[00:01.00] hi');
  });
});

describe('getWatchedFolders', () => {
  it('calls invoke with correct command and returns folders with exists flag', async () => {
    const folders = [
      { path: '/music', exists: true },
      { path: '/mnt/usb/music', exists: false },
    ];
    mockInvoke.mockResolvedValueOnce(folders);

    const result = await getWatchedFolders();

    expect(mockInvoke).toHaveBeenCalledWith('get_watched_folders');
    expect(result).toEqual(folders);
  });
});

describe('stopWatching', () => {
  it('passes folder path to invoke', async () => {
    mockInvoke.mockResolvedValueOnce(undefined);

    await stopWatching('/music');

    expect(mockInvoke).toHaveBeenCalledWith('stop_watching', { folder: '/music' });
  });
});
