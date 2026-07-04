/**
 * LRC lyrics parsing and time-sync lookup.
 * Pure functions — used by LyricsPanel.
 */

export interface LrcLine {
  timeSecs: number;
  text: string;
}

export type ParsedLyrics = { synced: true; lines: LrcLine[] } | { synced: false; lines: string[] };

/** One or more `[mm:ss]` / `[mm:ss.xx]` / `[mm:ss:xx]` tags at the start of a line. */
const TIME_TAGS = /^((?:\[\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?\]\s*)+)(.*)$/;
const TIME_TAG = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
/** Enhanced-LRC per-word tags like `<00:12.34>` — stripped, not interpreted. */
const WORD_TAG = /<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/g;
const OFFSET_TAG = /^\[offset:\s*([+-]?\d+)\s*\]$/i;

function tagToSecs(min: string, sec: string, frac: string | undefined): number {
  const base = parseInt(min, 10) * 60 + parseInt(sec, 10);
  if (!frac) return base;
  return base + parseInt(frac, 10) / 10 ** frac.length;
}

/**
 * Parse raw lyrics text (sidecar .lrc or embedded tag).
 * Returns synced lines sorted by time when any timestamp exists,
 * plain text lines when none do, or null for empty input.
 */
export function parseLyrics(raw: string): ParsedLyrics | null {
  if (!raw.trim()) return null;

  const rawLines = raw.split(/\r?\n/);
  let offsetMs = 0;
  const timed: LrcLine[] = [];

  for (const rawLine of rawLines) {
    const line = rawLine.trim();

    const offsetMatch = line.match(OFFSET_TAG);
    if (offsetMatch) {
      offsetMs = parseInt(offsetMatch[1], 10);
      continue;
    }

    const tagsMatch = line.match(TIME_TAGS);
    if (!tagsMatch) continue;

    const text = tagsMatch[2].replace(WORD_TAG, '').replace(/\s+/g, ' ').trim();
    for (const tag of tagsMatch[1].matchAll(TIME_TAG)) {
      timed.push({ timeSecs: tagToSecs(tag[1], tag[2], tag[3]), text });
    }
  }

  if (timed.length === 0) {
    return { synced: false, lines: rawLines.map((l) => l.trimEnd()) };
  }

  // Positive offset means lyrics should appear earlier (Lyricsify convention).
  const shifted = timed.map((l) => ({
    ...l,
    timeSecs: Math.max(0, l.timeSecs - offsetMs / 1000),
  }));
  shifted.sort((a, b) => a.timeSecs - b.timeSecs);
  return { synced: true, lines: shifted };
}

/**
 * Index of the line currently being sung at `positionSecs`: the last line
 * whose timestamp is <= position. Returns -1 before the first line.
 * Binary search — called on every 250ms position tick.
 */
export function currentLineIndex(lines: LrcLine[], positionSecs: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  let result = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].timeSecs <= positionSecs) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result;
}
