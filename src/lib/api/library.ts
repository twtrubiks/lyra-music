import { invoke } from '@tauri-apps/api/core';
import type { Track, TrackDetails, ArtistSummary, AlbumSummary, ImportResult } from '$lib/types';

export async function scanFolder(folderPath: string): Promise<ImportResult> {
  return invoke('scan_folder', { folderPath });
}

export async function getAllTracks(): Promise<Track[]> {
  return invoke('get_all_tracks');
}

export async function getTrackCover(id: number): Promise<string | null> {
  return invoke('get_track_cover', { id });
}

export async function searchTracks(query: string): Promise<Track[]> {
  return invoke('search_tracks', { query });
}

export async function removeTrack(id: number): Promise<void> {
  return invoke('remove_track', { id });
}

export async function trashTrack(id: number): Promise<void> {
  return invoke('trash_track', { id });
}

export interface BatchTrashResult {
  succeeded_ids: number[];
  failed: { id: number; error: string }[];
}

export async function trashTracks(ids: number[]): Promise<BatchTrashResult> {
  return invoke('trash_tracks', { ids });
}

export async function removeTracks(ids: number[]): Promise<BatchTrashResult> {
  return invoke('remove_tracks', { ids });
}

export async function getTrackDetails(id: number): Promise<TrackDetails> {
  return invoke('get_track_details', { id });
}

export async function importPaths(paths: string[]): Promise<ImportResult> {
  return invoke('import_paths', { paths });
}

export async function updateTrackMetadata(
  id: number,
  title: string,
  artist: string,
  album: string,
): Promise<Track> {
  return invoke('update_track_metadata', { id, title, artist, album });
}

export async function getAllArtists(): Promise<ArtistSummary[]> {
  return invoke('get_all_artists');
}

export async function getAllAlbums(): Promise<AlbumSummary[]> {
  return invoke('get_all_albums');
}

export async function getTracksByArtist(artist: string): Promise<Track[]> {
  return invoke('get_tracks_by_artist', { artist });
}

export async function getTracksByAlbum(album: string, artist: string): Promise<Track[]> {
  return invoke('get_tracks_by_album', { album, artist });
}

export async function getWatchedFolders(): Promise<string[]> {
  return invoke('get_watched_folders');
}

export async function startWatching(folder: string): Promise<void> {
  return invoke('start_watching', { folder });
}

export async function stopWatching(folder: string): Promise<void> {
  return invoke('stop_watching', { folder });
}

export async function incrementPlayCount(trackId: number): Promise<void> {
  return invoke('increment_play_count', { trackId });
}

export async function getMostPlayedTracks(limit?: number): Promise<Track[]> {
  return invoke('get_most_played_tracks', { limit: limit ?? 50 });
}
