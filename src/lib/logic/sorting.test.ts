import { describe, it, expect, beforeEach } from 'vitest';
import { sortTracks, toggleSort, loadSortConfig, saveSortConfig } from './sorting';
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

describe('sortTracks by duration_secs', () => {
  it('compares fractional seconds numerically', () => {
    // A string collator would put 180.5 before 180.25 (it compares 5 vs 25 after the dot).
    const tracks = [
      createMockTrack({ id: 1, duration_secs: 180.5 }),
      createMockTrack({ id: 2, duration_secs: 180.25 }),
      createMockTrack({ id: 3, duration_secs: 9.75 }),
    ];
    const result = sortTracks(tracks, { column: 'duration_secs', direction: 'asc' });
    expect(result.map((t) => t.duration_secs)).toEqual([9.75, 180.25, 180.5]);
  });
});

describe('sortTracks by text columns', () => {
  it('orders embedded numbers naturally', () => {
    const tracks = [
      createMockTrack({ id: 1, title: 'Track 10' }),
      createMockTrack({ id: 2, title: 'Track 2' }),
      createMockTrack({ id: 3, title: 'Track 1' }),
    ];
    const result = sortTracks(tracks, { column: 'title', direction: 'asc' });
    expect(result.map((t) => t.title)).toEqual(['Track 1', 'Track 2', 'Track 10']);
  });

  it('treats case and accent variants as equal, keeping their relative order', () => {
    const tracks = [
      createMockTrack({ id: 1, title: 'Étude' }),
      createMockTrack({ id: 2, title: 'etude' }),
      createMockTrack({ id: 3, title: 'ETUDE' }),
    ];
    const result = sortTracks(tracks, { column: 'title', direction: 'asc' });
    expect(result.map((t) => t.id)).toEqual([1, 2, 3]);
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

  it('toggles direction back to asc', () => {
    const result = toggleSort({ column: 'play_count', direction: 'desc' }, 'play_count');
    expect(result).toEqual({ column: 'play_count', direction: 'asc' });
  });
});

describe('sort config persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to title asc when nothing is stored', () => {
    expect(loadSortConfig()).toEqual({ column: 'title', direction: 'asc' });
  });

  it('round-trips a saved config', () => {
    saveSortConfig({ column: 'duration_secs', direction: 'desc' });
    expect(loadSortConfig()).toEqual({ column: 'duration_secs', direction: 'desc' });
  });

  it('falls back to the default on corrupt or incomplete data', () => {
    localStorage.setItem('lyra-sort-config', '{not json');
    expect(loadSortConfig()).toEqual({ column: 'title', direction: 'asc' });

    localStorage.setItem('lyra-sort-config', JSON.stringify({ column: 'artist' }));
    expect(loadSortConfig()).toEqual({ column: 'title', direction: 'asc' });
  });
});
