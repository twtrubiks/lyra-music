import { invoke } from '@tauri-apps/api/core';
import type { PlayerState } from '$lib/types';

export async function playTrack(
  path: string,
  trackId: number,
  durationSecs: number = 0,
): Promise<void> {
  return invoke('play_track', { path, trackId, durationSecs });
}

export async function pause(): Promise<void> {
  return invoke('pause');
}

export async function resume(): Promise<void> {
  return invoke('resume');
}

export async function stop(): Promise<void> {
  return invoke('stop');
}

export async function seek(positionSecs: number): Promise<void> {
  return invoke('seek', { positionSecs });
}

export async function setVolume(volume: number): Promise<void> {
  return invoke('set_volume', { volume });
}

export async function getPlayerState(): Promise<PlayerState> {
  return invoke('get_player_state');
}

export async function queueNextTrack(
  path: string,
  nextId: number,
  durationSecs: number,
): Promise<void> {
  return invoke('queue_next_track', { path, nextId, durationSecs });
}
