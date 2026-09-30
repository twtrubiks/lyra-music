import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { notifyCritical, notifyFailedImports, notifyImportResult } from './error-handler';
import { getErrorState } from '$lib/state/errorState.svelte';
import { setLocale } from '$lib/i18n/index.svelte';
import type { FailedFile, ImportResult } from '$lib/types';

describe('notifyFailedImports', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    getErrorState().errors = [];
    setLocale('zh-TW');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does nothing when failedFiles is empty', () => {
    notifyFailedImports([]);
    expect(getErrorState().errors).toHaveLength(0);
  });

  it('shows a warn notification for a single failed file', () => {
    const files: FailedFile[] = [{ file_path: '/music/bad.mp3', error: 'corrupt' }];
    notifyFailedImports(files);

    const state = getErrorState();
    expect(state.errors).toHaveLength(1);
    expect(state.errors[0].level).toBe('warn');
    expect(state.errors[0].message).toContain('1 個檔案無法匯入');
    expect(state.errors[0].message).toContain('bad.mp3');
  });

  it('shows up to 3 file names without suffix', () => {
    const files: FailedFile[] = [
      { file_path: '/a/one.mp3', error: 'err' },
      { file_path: '/b/two.flac', error: 'err' },
      { file_path: '/c/three.ogg', error: 'err' },
    ];
    notifyFailedImports(files);

    const msg = getErrorState().errors[0].message;
    expect(msg).toContain('3 個檔案無法匯入');
    expect(msg).toContain('one.mp3');
    expect(msg).toContain('two.flac');
    expect(msg).toContain('three.ogg');
    expect(msg).not.toContain('...等');
  });

  it('shows suffix when more than 3 files fail', () => {
    const files: FailedFile[] = [
      { file_path: '/a/one.mp3', error: 'err' },
      { file_path: '/b/two.mp3', error: 'err' },
      { file_path: '/c/three.mp3', error: 'err' },
      { file_path: '/d/four.mp3', error: 'err' },
      { file_path: '/e/five.mp3', error: 'err' },
    ];
    notifyFailedImports(files);

    const msg = getErrorState().errors[0].message;
    expect(msg).toContain('5 個檔案無法匯入');
    expect(msg).toContain('one.mp3');
    expect(msg).toContain('three.mp3');
    expect(msg).not.toContain('four.mp3');
    expect(msg).toContain('...等 2 個檔案');
  });

  it('uses English wording and plural forms when the locale is en', () => {
    setLocale('en');
    notifyFailedImports([{ file_path: '/a/one.mp3', error: 'err' }]);
    expect(getErrorState().errors[0].message).toBe('1 file could not be imported: one.mp3');

    getErrorState().errors = [];
    notifyFailedImports(
      ['one', 'two', 'three', 'four', 'five'].map((n) => ({
        file_path: `/a/${n}.mp3`,
        error: 'err',
      })),
    );
    expect(getErrorState().errors[0].message).toBe(
      '5 files could not be imported: one.mp3, two.mp3, three.mp3 ...and 2 more',
    );
  });

  it('extracts filename from path', () => {
    const files: FailedFile[] = [{ file_path: '/very/deep/nested/path/song.wav', error: 'err' }];
    notifyFailedImports(files);

    const msg = getErrorState().errors[0].message;
    expect(msg).toContain('song.wav');
    expect(msg).not.toContain('/very/deep');
  });

  it('auto-dismisses after 8000ms', () => {
    notifyFailedImports([{ file_path: 'x.mp3', error: 'err' }]);
    expect(getErrorState().errors).toHaveLength(1);

    vi.advanceTimersByTime(7999);
    expect(getErrorState().errors).toHaveLength(1);

    vi.advanceTimersByTime(1);
    expect(getErrorState().errors).toHaveLength(0);
  });
});

describe('notifyCritical', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    getErrorState().errors = [];
    setLocale('en');
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('includes the underlying error message so the user sees the reason', () => {
    notifyCritical(
      'action.playTrack',
      'Audio error: /usb/music/song.mp3: No such file or directory',
    );

    const state = getErrorState();
    expect(state.errors).toHaveLength(1);
    expect(state.errors[0].level).toBe('error');
    expect(state.errors[0].message).toContain('Play track failed');
    expect(state.errors[0].message).toContain('song.mp3');
    expect(state.errors[0].message).toContain('No such file or directory');
  });

  it('extracts the message from Error instances', () => {
    notifyCritical('action.scanFolder', new Error('permission denied'));

    expect(getErrorState().errors[0].message).toBe('Scan folder failed: permission denied');
  });

  it('translates the action name with the current locale', () => {
    setLocale('zh-TW');
    notifyCritical('action.scanFolder', new Error('permission denied'));

    expect(getErrorState().errors[0].message).toBe('掃描資料夾失敗：permission denied');
  });
});

describe('notifyImportResult', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    getErrorState().errors = [];
    setLocale('zh-TW');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows warn when result is completely empty (no tracks, no failures)', () => {
    const result: ImportResult = { tracks: [], failed_files: [] };
    notifyImportResult(result);

    const state = getErrorState();
    expect(state.errors).toHaveLength(1);
    expect(state.errors[0].level).toBe('warn');
    expect(state.errors[0].message).toBe('未找到任何音樂檔案');
  });

  it('delegates to notifyFailedImports when there are failed files', () => {
    const result: ImportResult = {
      tracks: [],
      failed_files: [{ file_path: '/music/bad.mp3', error: 'corrupt' }],
    };
    notifyImportResult(result);

    const state = getErrorState();
    expect(state.errors).toHaveLength(1);
    expect(state.errors[0].level).toBe('warn');
    expect(state.errors[0].message).toContain('1 個檔案無法匯入');
  });

  it('does not notify when tracks are imported successfully with no failures', () => {
    const result: ImportResult = {
      tracks: [
        {
          id: 1,
          file_path: '/music/song.mp3',
          title: 'Song',
          artist: 'Artist',
          album: 'Album',
          album_artist: null,
          duration_secs: 180,
          cover_art: null,
          cover_art_path: null,
          file_size_bytes: 5000000,
          play_count: 0,
          last_played_at: null,
        },
      ],
      failed_files: [],
    };
    notifyImportResult(result);

    expect(getErrorState().errors).toHaveLength(0);
  });
});
