import { describe, it, expect } from 'vitest';
import { sortTracks, toggleSort } from './sorting';
import { createMockTrack } from '$lib/test-helpers';

describe('sortTracks by play_count', () => {
  const tracks = [
    createMockTrack({ id: 1, title: 'A', play_count: 10 }),
    createMockTrack({ id: 2, title: 'B', play_count: 0 }),
    createMockTrack({ id: 3, title: 'C', play_count: 5 }),
  ];

  it('sorts ascending', () => {
    const result = sortTracks(tracks, { column: 'play_count', direction: 'asc' });
    expect(result.map((t) => t.play_count)).toEqual([0, 5, 10]);
  });

  it('sorts descending', () => {
    const result = sortTracks(tracks, { column: 'play_count', direction: 'desc' });
    expect(result.map((t) => t.play_count)).toEqual([10, 5, 0]);
  });

  it('does not mutate original array', () => {
    const original = [...tracks];
    sortTracks(tracks, { column: 'play_count', direction: 'asc' });
    expect(tracks).toEqual(original);
  });
});

describe('toggleSort with play_count', () => {
  it('switches to play_count asc from a different column', () => {
    const result = toggleSort({ column: 'title', direction: 'asc' }, 'play_count');
    expect(result).toEqual({ column: 'play_count', direction: 'asc' });
  });

  it('toggles direction when already on play_count', () => {
    const result = toggleSort({ column: 'play_count', direction: 'asc' }, 'play_count');
    expect(result).toEqual({ column: 'play_count', direction: 'desc' });
  });
});
