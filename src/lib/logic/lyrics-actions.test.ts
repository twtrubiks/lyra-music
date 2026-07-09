/**
 * Tests for lyrics actions: eager load on track change (with late-response
 * guard) and manual online search (upgrade-only swap rules).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInvoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

import { loadLyricsForTrack, searchLyricsOnline } from '$lib/logic/lyrics-actions';
import { getLyricsState } from '$lib/state/lyricsState.svelte';

const lyricsState = getLyricsState();

const SYNCED_LRC = '[00:01.00]hello\n[00:05.00]world';
const PLAIN_TEXT = 'hello\nworld';

function resetLyricsState() {
  lyricsState.trackId = null;
  lyricsState.lyrics = null;
  lyricsState.loading = false;
  lyricsState.onlineStatus = 'idle';
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('loadLyricsForTrack', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    resetLyricsState();
  });

  it('null id 清空狀態且不呼叫後端', async () => {
    lyricsState.trackId = 9;
    lyricsState.lyrics = { synced: false, lines: ['x'] };
    await loadLyricsForTrack(null);
    expect(lyricsState.trackId).toBeNull();
    expect(lyricsState.lyrics).toBeNull();
    expect(lyricsState.loading).toBe(false);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('載入同步歌詞 → availability = synced', async () => {
    mockInvoke.mockResolvedValue(SYNCED_LRC);
    await loadLyricsForTrack(1);
    expect(mockInvoke).toHaveBeenCalledWith('get_track_lyrics', { id: 1 });
    expect(lyricsState.lyrics?.synced).toBe(true);
    expect(lyricsState.availability).toBe('synced');
    expect(lyricsState.loading).toBe(false);
  });

  it('載入純文字歌詞 → availability = plain', async () => {
    mockInvoke.mockResolvedValue(PLAIN_TEXT);
    await loadLyricsForTrack(1);
    expect(lyricsState.availability).toBe('plain');
  });

  it('無歌詞（null）→ availability = none', async () => {
    mockInvoke.mockResolvedValue(null);
    await loadLyricsForTrack(1);
    expect(lyricsState.lyrics).toBeNull();
    expect(lyricsState.availability).toBe('none');
    expect(lyricsState.loading).toBe(false);
  });

  it('切歌時重設歌詞與線上搜尋狀態', async () => {
    lyricsState.lyrics = { synced: false, lines: ['old'] };
    lyricsState.onlineStatus = 'notfound';
    mockInvoke.mockResolvedValue(null);
    await loadLyricsForTrack(2);
    expect(lyricsState.lyrics).toBeNull();
    expect(lyricsState.onlineStatus).toBe('idle');
  });

  it('晚到的回應不覆蓋目前曲目的歌詞', async () => {
    const first = deferred<string | null>();
    const second = deferred<string | null>();
    mockInvoke.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const load1 = loadLyricsForTrack(1);
    const load2 = loadLyricsForTrack(2);
    second.resolve(SYNCED_LRC);
    await load2;
    expect(lyricsState.availability).toBe('synced');

    first.resolve(PLAIN_TEXT); // 曲目 1 的回應晚到
    await load1;
    expect(lyricsState.availability).toBe('synced'); // 仍是曲目 2 的歌詞
    expect(lyricsState.trackId).toBe(2);
  });

  it('讀取失敗 → loading 結束、不拋出', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockInvoke.mockRejectedValue(new Error('io'));
    await expect(loadLyricsForTrack(1)).resolves.toBeUndefined();
    expect(lyricsState.loading).toBe(false);
    expect(lyricsState.lyrics).toBeNull();
    warnSpy.mockRestore();
  });
});

describe('searchLyricsOnline', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    resetLyricsState();
  });

  it('沒有目前曲目時不呼叫後端', async () => {
    await searchLyricsOnline();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('搜尋中重複觸發只發出一次請求', async () => {
    lyricsState.trackId = 1;
    const d = deferred<string | null>();
    mockInvoke.mockReturnValue(d.promise);
    const p1 = searchLyricsOnline();
    const p2 = searchLyricsOnline();
    d.resolve(SYNCED_LRC);
    await Promise.all([p1, p2]);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it('找到同步歌詞 → 覆蓋並回到 idle', async () => {
    lyricsState.trackId = 1;
    lyricsState.lyrics = { synced: false, lines: ['plain'] };
    mockInvoke.mockResolvedValue(SYNCED_LRC);
    await searchLyricsOnline();
    expect(mockInvoke).toHaveBeenCalledWith('fetch_lyrics_online', { id: 1 });
    expect(lyricsState.availability).toBe('synced');
    expect(lyricsState.onlineStatus).toBe('idle');
  });

  it('回傳 null → notfound', async () => {
    lyricsState.trackId = 1;
    mockInvoke.mockResolvedValue(null);
    await searchLyricsOnline();
    expect(lyricsState.onlineStatus).toBe('notfound');
    expect(lyricsState.lyrics).toBeNull();
  });

  it('已有歌詞時拿到純文字 → notfound 且不置換', async () => {
    lyricsState.trackId = 1;
    lyricsState.lyrics = { synced: false, lines: ['local'] };
    mockInvoke.mockResolvedValue(PLAIN_TEXT);
    await searchLyricsOnline();
    expect(lyricsState.onlineStatus).toBe('notfound');
    expect(lyricsState.lyrics).toEqual({ synced: false, lines: ['local'] });
  });

  it('沒有本地歌詞時接受純文字結果', async () => {
    lyricsState.trackId = 1;
    mockInvoke.mockResolvedValue(PLAIN_TEXT);
    await searchLyricsOnline();
    expect(lyricsState.availability).toBe('plain');
    expect(lyricsState.onlineStatus).toBe('idle');
  });

  it('搜尋失敗 → error 狀態', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    lyricsState.trackId = 1;
    mockInvoke.mockRejectedValue(new Error('network'));
    await expect(searchLyricsOnline()).resolves.toBeUndefined();
    expect(lyricsState.onlineStatus).toBe('error');
    warnSpy.mockRestore();
  });

  it('搜尋期間切歌 → 結果丟棄', async () => {
    lyricsState.trackId = 1;
    const search = deferred<string | null>();
    mockInvoke.mockReturnValueOnce(search.promise); // fetch_lyrics_online（曲目 1）
    const p = searchLyricsOnline();
    mockInvoke.mockResolvedValueOnce(null); // get_track_lyrics（曲目 2）
    await loadLyricsForTrack(2);
    search.resolve(SYNCED_LRC); // 曲目 1 的搜尋結果晚到
    await p;
    expect(lyricsState.lyrics).toBeNull();
    expect(lyricsState.availability).toBe('none');
    expect(lyricsState.onlineStatus).toBe('idle');
  });
});
