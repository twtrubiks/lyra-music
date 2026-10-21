import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInvoke = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

import {
  scanFolder,
  getAllTracks,
  getTrackCover,
  searchTracks,
  removeTrack,
  trashTrack,
  trashTracks,
  removeTracks,
  getTrackDetails,
  importPaths,
  updateTrackMetadata,
  getAllArtists,
  getTracksByArtist,
  startWatching,
  getMostPlayedTracks,
  getTracksByAlbum,
  getAllAlbums,
  getTrackLyrics,
  fetchLyricsOnline,
  getWatchedFolders,
  stopWatching,
} from './library';

// Command names and argument keys must match the Rust #[tauri::command]
// handlers (camelCase keys map to snake_case params) — a typo only fails at
// runtime, so pin every wrapper's IPC call.
describe('IPC command contract', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(undefined);
  });

  it.each([
    ['scanFolder', () => scanFolder('/music'), ['scan_folder', { folderPath: '/music' }]],
    ['getAllTracks', () => getAllTracks(), ['get_all_tracks']],
    ['getTrackCover', () => getTrackCover(7), ['get_track_cover', { id: 7 }]],
    ['searchTracks', () => searchTracks('abc'), ['search_tracks', { query: 'abc' }]],
    ['removeTrack', () => removeTrack(7), ['remove_track', { id: 7 }]],
    ['trashTrack', () => trashTrack(7), ['trash_track', { id: 7 }]],
    ['trashTracks', () => trashTracks([1, 2]), ['trash_tracks', { ids: [1, 2] }]],
    ['removeTracks', () => removeTracks([1, 2]), ['remove_tracks', { ids: [1, 2] }]],
    ['getTrackDetails', () => getTrackDetails(7), ['get_track_details', { id: 7 }]],
    ['importPaths', () => importPaths(['/a.mp3']), ['import_paths', { paths: ['/a.mp3'] }]],
    [
      'updateTrackMetadata',
      () => updateTrackMetadata(7, 'T', 'Ar', 'Al'),
      ['update_track_metadata', { id: 7, title: 'T', artist: 'Ar', album: 'Al' }],
    ],
    ['getAllArtists', () => getAllArtists(), ['get_all_artists']],
    [
      'getTracksByArtist',
      () => getTracksByArtist('Ar'),
      ['get_tracks_by_artist', { artist: 'Ar' }],
    ],
    ['startWatching', () => startWatching('/music'), ['start_watching', { folder: '/music' }]],
    [
      'getMostPlayedTracks (default limit)',
      () => getMostPlayedTracks(),
      ['get_most_played_tracks', { limit: 50 }],
    ],
    [
      'getMostPlayedTracks (explicit limit)',
      () => getMostPlayedTracks(10),
      ['get_most_played_tracks', { limit: 10 }],
    ],
  ] as const)('%s', async (_, call, expected) => {
    await call();
    expect(mockInvoke).toHaveBeenCalledExactlyOnceWith(...expected);
  });
});

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
