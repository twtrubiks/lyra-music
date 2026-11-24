import { describe, it, expect } from 'vitest';
import { resolveRevealView, isRevealFresh, REVEAL_TIMEOUT_MS } from './reveal-track';

const playlists = [
  { id: 1, track_ids: [10, 11] },
  { id: 2, track_ids: [20] },
];

function resolve(overrides: Partial<Parameters<typeof resolveRevealView>[0]>) {
  return resolveRevealView({
    activeView: { kind: 'library' },
    trackId: 10,
    listedInView: false,
    inLibrary: true,
    sourcePlaylistId: null,
    playlists,
    ...overrides,
  });
}

describe('resolveRevealView', () => {
  it('stays in the current view when it lists the track', () => {
    const activeView = { kind: 'album-detail', albumName: 'A', artistName: 'B' } as const;
    expect(resolve({ activeView, listedInView: true, sourcePlaylistId: 1 })).toEqual(activeView);
  });

  it('stays in the library even when a search hides the track', () => {
    expect(resolve({ sourcePlaylistId: 1 })).toEqual({ kind: 'library' });
  });

  it('stays in the shown playlist when it contains the track', () => {
    const activeView = { kind: 'playlist', playlistId: 1 } as const;
    expect(resolve({ activeView })).toEqual(activeView);
  });

  it('goes to the source playlist when the current view lacks the track', () => {
    expect(resolve({ activeView: { kind: 'artists' }, sourcePlaylistId: 1 })).toEqual({
      kind: 'playlist',
      playlistId: 1,
    });
    expect(
      resolve({ activeView: { kind: 'playlist', playlistId: 2 }, sourcePlaylistId: 1 }),
    ).toEqual({ kind: 'playlist', playlistId: 1 });
  });

  it('falls back to the library when the source playlist no longer has the track', () => {
    expect(resolve({ activeView: { kind: 'albums' }, trackId: 99, sourcePlaylistId: 1 })).toEqual({
      kind: 'library',
    });
    expect(resolve({ activeView: { kind: 'albums' }, sourcePlaylistId: 7 })).toEqual({
      kind: 'library',
    });
  });

  it('falls back to the library when the queue did not come from a playlist', () => {
    expect(resolve({ activeView: { kind: 'most-played' } })).toEqual({ kind: 'library' });
  });

  it('returns null when no view can show the track', () => {
    expect(resolve({ trackId: 99, inLibrary: false })).toBeNull();
    expect(resolve({ activeView: { kind: 'artists' }, trackId: 99, inLibrary: false })).toBeNull();
  });
});

describe('isRevealFresh', () => {
  it('accepts a request within the timeout and rejects an older one', () => {
    const request = { trackId: 1, at: 1000 };
    expect(isRevealFresh(request, 1000)).toBe(true);
    expect(isRevealFresh(request, 1000 + REVEAL_TIMEOUT_MS)).toBe(true);
    expect(isRevealFresh(request, 1001 + REVEAL_TIMEOUT_MS)).toBe(false);
  });
});
