import { describe, it, expect } from 'vitest';
import {
  formatDuration,
  filterTracks,
  shouldUpdateDuration,
  parseTrackIdFromDrop,
  findTrackIndex,
  formatTotalDuration,
  formatFileSize,
  formatSampleRate,
  formatTrackCount,
} from './format';
import { createMockTrack, createMockTracks } from '$lib/test-helpers';

describe('formatDuration', () => {
  it('formats 0 seconds as 0:00', () => {
    expect(formatDuration(0)).toBe('0:00');
  });

  it('formats seconds less than a minute', () => {
    expect(formatDuration(5)).toBe('0:05');
    expect(formatDuration(59)).toBe('0:59');
  });

  it('formats exact minutes', () => {
    expect(formatDuration(60)).toBe('1:00');
    expect(formatDuration(120)).toBe('2:00');
  });

  it('formats minutes and seconds', () => {
    expect(formatDuration(90)).toBe('1:30');
    expect(formatDuration(185)).toBe('3:05');
  });

  it('handles large values', () => {
    expect(formatDuration(3600)).toBe('60:00');
    expect(formatDuration(3661)).toBe('61:01');
  });

  it('floors fractional seconds', () => {
    expect(formatDuration(90.7)).toBe('1:30');
    expect(formatDuration(59.99)).toBe('0:59');
  });
});

describe('filterTracks', () => {
  const tracks = [
    createMockTrack({
      id: 1,
      title: 'Bohemian Rhapsody',
      artist: 'Queen',
      album: 'A Night at the Opera',
    }),
    createMockTrack({
      id: 2,
      title: 'Stairway to Heaven',
      artist: 'Led Zeppelin',
      album: 'Led Zeppelin IV',
    }),
    createMockTrack({
      id: 3,
      title: 'Hotel California',
      artist: 'Eagles',
      album: 'Hotel California',
    }),
    createMockTrack({
      id: 4,
      title: 'Sweet Child O Mine',
      artist: 'Guns N Roses',
      album: 'Appetite for Destruction',
    }),
  ];

  it('returns all tracks for empty query', () => {
    expect(filterTracks(tracks, '')).toHaveLength(4);
  });

  it('returns all tracks for whitespace-only query', () => {
    expect(filterTracks(tracks, '   ')).toHaveLength(4);
  });

  it('matches by title (case-insensitive)', () => {
    const result = filterTracks(tracks, 'bohemian');
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Bohemian Rhapsody');
  });

  it('matches by artist', () => {
    const result = filterTracks(tracks, 'queen');
    expect(result).toHaveLength(1);
    expect(result[0].artist).toBe('Queen');
  });

  it('matches by album', () => {
    const result = filterTracks(tracks, 'appetite');
    expect(result).toHaveLength(1);
    expect(result[0].album).toBe('Appetite for Destruction');
  });

  it('matches across multiple fields', () => {
    // "Hotel California" appears in both title and album of track 3
    const result = filterTracks(tracks, 'hotel');
    expect(result).toHaveLength(1);
  });

  it('returns empty for no match', () => {
    expect(filterTracks(tracks, 'nonexistent')).toHaveLength(0);
  });

  it('matches partial strings', () => {
    const result = filterTracks(tracks, 'stair');
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Stairway to Heaven');
  });

  it('trims query before matching', () => {
    const result = filterTracks(tracks, '  Queen  ');
    expect(result).toHaveLength(1);
  });
});

describe('shouldUpdateDuration — MP3 duration bug guard', () => {
  it('returns true for positive duration', () => {
    expect(shouldUpdateDuration(240)).toBe(true);
    expect(shouldUpdateDuration(0.001)).toBe(true);
  });

  it('returns false for 0 (rodio MP3 returns 0)', () => {
    expect(shouldUpdateDuration(0)).toBe(false);
  });

  it('returns false for negative values', () => {
    expect(shouldUpdateDuration(-1)).toBe(false);
  });
});

describe('parseTrackIdFromDrop — drag-and-drop parsing', () => {
  it('parses valid integer string', () => {
    expect(parseTrackIdFromDrop('42')).toBe(42);
  });

  it('parses "0" as valid', () => {
    expect(parseTrackIdFromDrop('0')).toBe(0);
  });

  it('returns null for undefined', () => {
    expect(parseTrackIdFromDrop(undefined)).toBeNull();
  });

  it('returns null for null', () => {
    expect(parseTrackIdFromDrop(null)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseTrackIdFromDrop('')).toBeNull();
  });

  it('returns null for non-numeric string', () => {
    expect(parseTrackIdFromDrop('abc')).toBeNull();
  });
});

describe('findTrackIndex', () => {
  const tracks = createMockTracks(5); // ids 1-5

  it('finds track at beginning', () => {
    expect(findTrackIndex(tracks, 1)).toBe(0);
  });

  it('finds track at end', () => {
    expect(findTrackIndex(tracks, 5)).toBe(4);
  });

  it('finds track in middle', () => {
    expect(findTrackIndex(tracks, 3)).toBe(2);
  });

  it('returns -1 for missing track', () => {
    expect(findTrackIndex(tracks, 99)).toBe(-1);
  });

  it('returns -1 for empty array', () => {
    expect(findTrackIndex([], 1)).toBe(-1);
  });
});

describe('formatTotalDuration', () => {
  it('formats 0 seconds as 0m', () => {
    expect(formatTotalDuration(0)).toBe('0m');
  });

  it('formats seconds under an hour', () => {
    expect(formatTotalDuration(35 * 60)).toBe('35m');
  });

  it('formats exactly 1 hour', () => {
    expect(formatTotalDuration(3600)).toBe('1h 0m');
  });

  it('formats hours and minutes', () => {
    expect(formatTotalDuration(80 * 60)).toBe('1h 20m');
  });

  it('formats large values', () => {
    expect(formatTotalDuration(100 * 3600)).toBe('100h 0m');
  });

  it('floors partial seconds', () => {
    expect(formatTotalDuration(59.9)).toBe('0m');
    expect(formatTotalDuration(90.5)).toBe('1m');
  });
});

describe('formatSampleRate', () => {
  it('formats 44100 Hz as 44.1 kHz', () => {
    expect(formatSampleRate(44100)).toBe('44.1 kHz');
  });
  it('formats 48000 Hz as 48 kHz', () => {
    expect(formatSampleRate(48000)).toBe('48 kHz');
  });
  it('formats 96000 Hz as 96 kHz', () => {
    expect(formatSampleRate(96000)).toBe('96 kHz');
  });
  it('formats 22050 Hz as 22.1 kHz', () => {
    expect(formatSampleRate(22050)).toBe('22.1 kHz');
  });
  it('formats values below 1000 in Hz', () => {
    expect(formatSampleRate(800)).toBe('800 Hz');
  });
});

describe('formatFileSize', () => {
  it('formats 0 bytes', () => {
    expect(formatFileSize(0)).toBe('0 B');
  });

  it('formats bytes under 1 KB', () => {
    expect(formatFileSize(512)).toBe('512 B');
  });

  it('formats kilobytes', () => {
    expect(formatFileSize(1024)).toBe('1 KB');
    expect(formatFileSize(512 * 1024)).toBe('512 KB');
  });

  it('formats megabytes', () => {
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  it('formats gigabytes', () => {
    expect(formatFileSize(1.25 * 1024 * 1024 * 1024)).toBe('1.25 GB');
  });
});

describe('formatTrackCount', () => {
  it('uses singular for exactly one track', () => {
    expect(formatTrackCount(1)).toBe('1 track');
  });

  it('uses plural for zero or multiple tracks', () => {
    expect(formatTrackCount(0)).toBe('0 tracks');
    expect(formatTrackCount(2)).toBe('2 tracks');
    expect(formatTrackCount(42)).toBe('42 tracks');
  });
});
