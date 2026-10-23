import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInvoke = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

import {
  playTrack,
  pause,
  resume,
  stop,
  seek,
  setVolume,
  getPlayerState,
  queueNextTrack,
} from './playback';

// Command names and argument keys must match the Rust #[tauri::command]
// handlers (camelCase keys map to snake_case params) — a typo only fails at
// runtime, so pin every wrapper's IPC call. This only locks the frontend
// side: a drift in the Rust handler itself is not caught here — that is what
// the E2E suite is for.
describe('IPC command contract', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(undefined);
  });

  it.each([
    [
      'playTrack',
      () => playTrack('/a.mp3', 7, 180),
      ['play_track', { path: '/a.mp3', trackId: 7, durationSecs: 180 }],
    ],
    [
      'playTrack (default duration)',
      () => playTrack('/a.mp3', 7),
      ['play_track', { path: '/a.mp3', trackId: 7, durationSecs: 0 }],
    ],
    ['pause', () => pause(), ['pause']],
    ['resume', () => resume(), ['resume']],
    ['stop', () => stop(), ['stop']],
    ['seek', () => seek(42.5), ['seek', { positionSecs: 42.5 }]],
    ['setVolume', () => setVolume(0.7), ['set_volume', { volume: 0.7 }]],
    ['getPlayerState', () => getPlayerState(), ['get_player_state']],
    [
      'queueNextTrack',
      () => queueNextTrack('/b.mp3', 8, 200),
      ['queue_next_track', { path: '/b.mp3', nextId: 8, durationSecs: 200 }],
    ],
  ] as const)('%s', async (_, call, expected) => {
    await call();
    expect(mockInvoke).toHaveBeenCalledExactlyOnceWith(...expected);
  });
});
