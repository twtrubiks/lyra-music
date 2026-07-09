import { describe, it, expect } from 'vitest';
import { updateExistingTracks, updateCurrentTrack } from './library-sync';
import { createMockTrack } from '$lib/test-helpers';

describe('updateExistingTracks', () => {
  it('returns the same array reference when fresh is empty', () => {
    const existing = [createMockTrack({ id: 1 }), createMockTrack({ id: 2 })];
    expect(updateExistingTracks(existing, [])).toBe(existing);
  });

  it('returns the same array reference when no fresh id is in the list', () => {
    const existing = [createMockTrack({ id: 1 }), createMockTrack({ id: 2 })];
    expect(updateExistingTracks(existing, [createMockTrack({ id: 9 })])).toBe(existing);
  });

  it('replaces matching tracks in place (e.g. a rename updating file_path)', () => {
    const existing = [
      createMockTrack({ id: 1 }),
      createMockTrack({ id: 2 }),
      createMockTrack({ id: 3 }),
    ];
    const renamed = createMockTrack({ id: 2, file_path: '/music/renamed.mp3' });

    const result = updateExistingTracks(existing, [renamed]);

    expect(result.map((t) => t.id)).toEqual([1, 2, 3]);
    expect(result[1]).toBe(renamed);
  });

  it('does not append unknown tracks', () => {
    const existing = [createMockTrack({ id: 1 })];
    const result = updateExistingTracks(existing, [
      createMockTrack({ id: 1, title: 'U' }),
      createMockTrack({ id: 9 }),
    ]);

    expect(result.map((t) => t.id)).toEqual([1]);
    expect(result[0].title).toBe('U');
  });

  it('last occurrence wins for duplicate ids in the fresh batch', () => {
    const existing = [createMockTrack({ id: 1 })];
    const first = createMockTrack({ id: 1, title: 'First' });
    const second = createMockTrack({ id: 1, title: 'Second' });

    const result = updateExistingTracks(existing, [first, second]);

    expect(result[0].title).toBe('Second');
  });

  it('does not mutate its inputs', () => {
    const existing = [createMockTrack({ id: 1 })];
    const existingSnapshot = [...existing];
    const fresh = [createMockTrack({ id: 1, title: 'Updated' })];

    updateExistingTracks(existing, fresh);

    expect(existing).toEqual(existingSnapshot);
  });
});

describe('updateCurrentTrack', () => {
  it('passes through null', () => {
    expect(updateCurrentTrack(null, [createMockTrack({ id: 1 })])).toBeNull();
  });

  it('returns the same reference when the track is absent from fresh', () => {
    const current = createMockTrack({ id: 1 });
    expect(updateCurrentTrack(current, [createMockTrack({ id: 2 })])).toBe(current);
  });

  it('syncs file_path and metadata from the fresh row', () => {
    const current = createMockTrack({ id: 1, file_path: '/music/old.mp3', title: 'Old' });
    const fresh = [createMockTrack({ id: 1, file_path: '/music/new.mp3', title: 'New' })];

    const result = updateCurrentTrack(current, fresh);

    expect(result?.file_path).toBe('/music/new.mp3');
    expect(result?.title).toBe('New');
  });

  it('keeps the cover loaded at play time when the fresh row has none', () => {
    const current = createMockTrack({ id: 1, cover_art: 'base64-cover' });
    const fresh = [createMockTrack({ id: 1, file_path: '/music/new.mp3', cover_art: null })];

    const result = updateCurrentTrack(current, fresh);

    expect(result?.cover_art).toBe('base64-cover');
  });

  it('prefers a cover present on the fresh row', () => {
    const current = createMockTrack({ id: 1, cover_art: 'old-cover' });
    const fresh = [createMockTrack({ id: 1, cover_art: 'new-cover' })];

    const result = updateCurrentTrack(current, fresh);

    expect(result?.cover_art).toBe('new-cover');
  });
});
