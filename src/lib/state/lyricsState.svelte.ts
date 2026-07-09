import type { ParsedLyrics } from '$lib/logic/lrc';

export type LyricsAvailability = 'none' | 'plain' | 'synced';
export type OnlineLyricsStatus = 'idle' | 'searching' | 'notfound' | 'error';

let lyrics = $state<ParsedLyrics | null>(null);
let loading = $state(false);
/** Track the current lyrics belong to — guards late async responses. */
let trackId = $state<number | null>(null);
let onlineStatus = $state<OnlineLyricsStatus>('idle');

const availability = $derived(lyrics === null ? 'none' : lyrics.synced ? 'synced' : 'plain');

export function getLyricsState() {
  return {
    get lyrics() {
      return lyrics;
    },
    set lyrics(v: ParsedLyrics | null) {
      lyrics = v;
    },
    get loading() {
      return loading;
    },
    set loading(v: boolean) {
      loading = v;
    },
    get trackId() {
      return trackId;
    },
    set trackId(v: number | null) {
      trackId = v;
    },
    get onlineStatus() {
      return onlineStatus;
    },
    set onlineStatus(v: OnlineLyricsStatus) {
      onlineStatus = v;
    },
    get availability(): LyricsAvailability {
      return availability;
    },
  };
}
