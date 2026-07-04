import { describe, it, expect } from 'vitest';
import { parseLyrics, currentLineIndex } from './lrc';
import type { LrcLine } from './lrc';

describe('parseLyrics — synced LRC', () => {
  it('parses basic timestamped lines with centiseconds', () => {
    const result = parseLyrics('[00:12.34]Hello\n[00:15.00]World');
    expect(result).toEqual({
      synced: true,
      lines: [
        { timeSecs: 12.34, text: 'Hello' },
        { timeSecs: 15, text: 'World' },
      ],
    });
  });

  it('parses timestamps without fractional seconds', () => {
    const result = parseLyrics('[01:05]Line');
    expect(result).toEqual({
      synced: true,
      lines: [{ timeSecs: 65, text: 'Line' }],
    });
  });

  it('parses 3-digit millisecond fractions', () => {
    const result = parseLyrics('[00:10.500]Line');
    expect(result?.synced).toBe(true);
    expect((result?.lines[0] as LrcLine).timeSecs).toBeCloseTo(10.5);
  });

  it('parses 1-digit tenth fractions', () => {
    const result = parseLyrics('[00:10.5]Line');
    expect((result?.lines[0] as LrcLine).timeSecs).toBeCloseTo(10.5);
  });

  it('accepts colon as fraction separator (mm:ss:xx)', () => {
    const result = parseLyrics('[00:10:50]Line');
    expect((result?.lines[0] as LrcLine).timeSecs).toBeCloseTo(10.5);
  });

  it('expands multiple timestamps separated by whitespace', () => {
    const result = parseLyrics('[00:10.00] [00:20.00]Chorus');
    expect(result?.lines).toEqual([
      { timeSecs: 10, text: 'Chorus' },
      { timeSecs: 20, text: 'Chorus' },
    ]);
  });

  it('expands multiple timestamps on one line (repeated chorus)', () => {
    const result = parseLyrics('[00:30.00][01:30.00]Chorus\n[00:40.00]Verse');
    expect(result).toEqual({
      synced: true,
      lines: [
        { timeSecs: 30, text: 'Chorus' },
        { timeSecs: 40, text: 'Verse' },
        { timeSecs: 90, text: 'Chorus' },
      ],
    });
  });

  it('sorts lines by time even when input is out of order', () => {
    const result = parseLyrics('[00:20.00]Second\n[00:10.00]First');
    expect(result?.lines).toEqual([
      { timeSecs: 10, text: 'First' },
      { timeSecs: 20, text: 'Second' },
    ]);
  });

  it('ignores metadata tags like [ti:] [ar:] [al:] [by:] [length:]', () => {
    const raw = '[ti:Song]\n[ar:Artist]\n[al:Album]\n[by:Someone]\n[length:03:45]\n[00:01.00]Lyric';
    const result = parseLyrics(raw);
    expect(result).toEqual({
      synced: true,
      lines: [{ timeSecs: 1, text: 'Lyric' }],
    });
  });

  it('applies positive [offset:] by shifting lines earlier', () => {
    const result = parseLyrics('[offset:+500]\n[00:10.00]Line');
    expect((result?.lines[0] as LrcLine).timeSecs).toBeCloseTo(9.5);
  });

  it('applies negative [offset:] by shifting lines later', () => {
    const result = parseLyrics('[offset:-500]\n[00:10.00]Line');
    expect((result?.lines[0] as LrcLine).timeSecs).toBeCloseTo(10.5);
  });

  it('clamps offset-shifted times at zero', () => {
    const result = parseLyrics('[offset:+2000]\n[00:01.00]Line');
    expect((result?.lines[0] as LrcLine).timeSecs).toBe(0);
  });

  it('strips enhanced LRC word timestamps from text', () => {
    const result = parseLyrics('[00:10.00]<00:10.00>Hello <00:11.00>world');
    expect(result?.lines[0]).toEqual({ timeSecs: 10, text: 'Hello world' });
  });

  it('keeps empty timed lines (instrumental gaps)', () => {
    const result = parseLyrics('[00:10.00]Verse\n[00:20.00]\n[00:30.00]Next');
    expect(result?.lines).toEqual([
      { timeSecs: 10, text: 'Verse' },
      { timeSecs: 20, text: '' },
      { timeSecs: 30, text: 'Next' },
    ]);
  });

  it('handles CRLF line endings', () => {
    const result = parseLyrics('[00:10.00]One\r\n[00:20.00]Two');
    expect(result?.lines).toEqual([
      { timeSecs: 10, text: 'One' },
      { timeSecs: 20, text: 'Two' },
    ]);
  });

  it('supports minutes beyond 59 for long tracks', () => {
    const result = parseLyrics('[90:00.00]Line');
    expect((result?.lines[0] as LrcLine).timeSecs).toBe(5400);
  });
});

describe('parseLyrics — unsynced fallback', () => {
  it('returns unsynced lines for plain text without timestamps', () => {
    const result = parseLyrics('Just some lyrics\nSecond line');
    expect(result).toEqual({
      synced: false,
      lines: ['Just some lyrics', 'Second line'],
    });
  });

  it('treats metadata-only LRC (no timed lines) as unsynced text', () => {
    const result = parseLyrics('[ti:Song]\nSome plain line');
    expect(result?.synced).toBe(false);
  });

  it('returns null for empty input', () => {
    expect(parseLyrics('')).toBeNull();
  });

  it('returns null for whitespace-only input', () => {
    expect(parseLyrics('  \n\r\n  ')).toBeNull();
  });
});

describe('currentLineIndex', () => {
  const lines: LrcLine[] = [
    { timeSecs: 10, text: 'a' },
    { timeSecs: 20, text: 'b' },
    { timeSecs: 30, text: 'c' },
  ];

  it('returns -1 for an empty array', () => {
    expect(currentLineIndex([], 5)).toBe(-1);
  });

  it('returns -1 before the first line', () => {
    expect(currentLineIndex(lines, 9.9)).toBe(-1);
  });

  it('returns the line at an exact timestamp boundary', () => {
    expect(currentLineIndex(lines, 20)).toBe(1);
  });

  it('returns the previous line between timestamps', () => {
    expect(currentLineIndex(lines, 25)).toBe(1);
  });

  it('returns the last line after the final timestamp', () => {
    expect(currentLineIndex(lines, 999)).toBe(2);
  });

  it('returns the first line exactly at its timestamp', () => {
    expect(currentLineIndex(lines, 10)).toBe(0);
  });
});
