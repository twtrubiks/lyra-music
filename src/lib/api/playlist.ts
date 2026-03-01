import { invoke } from '@tauri-apps/api/core';
import type { Playlist, Track } from '$lib/types';

export async function createPlaylist(name: string): Promise<number> {
  return invoke('create_playlist', { name });
}

export async function getAllPlaylists(): Promise<Playlist[]> {
  return invoke('get_all_playlists');
}

export async function getPlaylistTracks(playlistId: number): Promise<Track[]> {
  return invoke('get_playlist_tracks', { playlistId });
}

export async function addToPlaylist(playlistId: number, trackId: number): Promise<void> {
  return invoke('add_to_playlist', { playlistId, trackId });
}

export async function removeFromPlaylist(playlistId: number, trackId: number): Promise<void> {
  return invoke('remove_from_playlist', { playlistId, trackId });
}

export async function batchAddToPlaylist(playlistId: number, trackIds: number[]): Promise<void> {
  return invoke('batch_add_to_playlist', { playlistId, trackIds });
}

export async function batchRemoveFromPlaylist(
  playlistId: number,
  trackIds: number[],
): Promise<void> {
  return invoke('batch_remove_from_playlist', { playlistId, trackIds });
}

export async function reorderPlaylist(playlistId: number, trackIds: number[]): Promise<void> {
  return invoke('reorder_playlist', { playlistId, trackIds });
}

export async function reorderPlaylists(playlistIds: number[]): Promise<void> {
  return invoke('reorder_playlists', { playlistIds });
}

export async function renamePlaylist(id: number, newName: string): Promise<void> {
  return invoke('rename_playlist', { id, newName });
}

export async function deletePlaylist(id: number): Promise<void> {
  return invoke('delete_playlist', { id });
}

export async function savePlaybackPosition(
  playlistId: number,
  trackId: number,
  secs: number,
): Promise<void> {
  return invoke('save_playback_position', { playlistId, trackId, secs });
}

export async function getLastPlaybackPosition(
  playlistId: number,
): Promise<[number | null, number | null]> {
  return invoke('get_last_playback_position', { playlistId });
}
