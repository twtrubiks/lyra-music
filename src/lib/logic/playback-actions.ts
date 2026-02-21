import { getPlayerState } from '$lib/state/playerState.svelte';
import { getPlaylistState } from '$lib/state/playlistState.svelte';
import { getLibraryState } from '$lib/state/libraryState.svelte';
import { getNextIndex, getPrevIndex, generateShuffledIndices } from '$lib/logic/playmode';
import * as playbackApi from '$lib/api/playback';
import { getTrackCover, incrementPlayCount } from '$lib/api/library';
import { notifyCritical, warnNonCritical } from '$lib/logic/error-handler';
import type { Track, RepeatMode } from '$lib/types';

const player = getPlayerState();
const library = getLibraryState();

/**
 * Play a specific track by queue index.
 * When mockMode is true, isPlaying is set to true even if the backend call fails
 * (used when the user explicitly picks a track from Library/Playlist).
 */
async function playTrackAtIndex(index: number, mockMode = false): Promise<void> {
  const track = player.playQueue[index];
  if (!track) return;
  player.currentIndex = index;
  player.currentTrack = track;
  player.positionSecs = 0;
  player.durationSecs = track.duration_secs;
  try {
    await playbackApi.playTrack(track.file_path, track.duration_secs);
    player.isPlaying = true;
    tryQueueNext();
  } catch (err) {
    notifyCritical('Play track', err);
    if (mockMode) {
      player.isPlaying = true;
    }
  }
  try {
    const cover = await getTrackCover(track.id);
    if (cover && player.currentTrack?.id === track.id) {
      player.currentTrack = { ...player.currentTrack, cover_art: cover };
    }
  } catch (err) {
    warnNonCritical('Load cover art', err);
  }
}

/** Try to queue the next track for gapless playback */
export function tryQueueNext(): void {
  const nextIdx = getNextIndex(
    player.currentIndex,
    player.playQueue.length,
    player.repeatMode,
    player.shuffleEnabled,
    player.shuffledIndices,
  );
  if (nextIdx !== null) {
    const nextTrack = player.playQueue[nextIdx];
    playbackApi
      .queueNextTrack(nextTrack.file_path, nextTrack.id, nextTrack.duration_secs)
      .catch((err) => warnNonCritical('Queue next track', err));
  }
}

/** Go to previous track */
export async function handlePrev(): Promise<void> {
  const prevIdx = getPrevIndex(
    player.currentIndex,
    player.playQueue.length,
    player.repeatMode,
    player.shuffleEnabled,
    player.shuffledIndices,
  );
  if (prevIdx === null) return;
  await playTrackAtIndex(prevIdx);
}

/** Go to next track */
export async function handleNext(): Promise<void> {
  const nextIdx = getNextIndex(
    player.currentIndex,
    player.playQueue.length,
    player.repeatMode,
    player.shuffleEnabled,
    player.shuffledIndices,
  );
  if (nextIdx === null) return;
  await playTrackAtIndex(nextIdx);
}

/** Handle gapless transition: backend already switched track, just update frontend state */
export async function handleGaplessTransition(newTrackId: number): Promise<void> {
  if (_advanceInProgress) return;
  _advanceInProgress = true;
  try {
    const finishedTrack = player.currentTrack;
    if (finishedTrack) {
      incrementPlayCount(finishedTrack.id).catch((err) =>
        warnNonCritical('Increment play count', err),
      );
      const newCount = finishedTrack.play_count + 1;
      const qIdx = player.playQueue.findIndex((t) => t.id === finishedTrack.id);
      if (qIdx >= 0) {
        player.playQueue[qIdx] = { ...player.playQueue[qIdx], play_count: newCount };
      }
      library.allTracks = library.allTracks.map((t) =>
        t.id === finishedTrack.id ? { ...t, play_count: newCount } : t,
      );
    }

    const newIdx = player.playQueue.findIndex((t) => t.id === newTrackId);
    if (newIdx >= 0) {
      player.currentIndex = newIdx;
      player.currentTrack = player.playQueue[newIdx];
      player.positionSecs = 0;
      player.durationSecs = player.playQueue[newIdx].duration_secs;
      try {
        const cover = await getTrackCover(newTrackId);
        if (cover && player.currentTrack?.id === newTrackId) {
          player.currentTrack = { ...player.currentTrack, cover_art: cover };
        }
      } catch (err) {
        warnNonCritical('Load cover art', err);
      }
      tryQueueNext();
    }
  } finally {
    _advanceInProgress = false;
  }
}

let _advanceInProgress = false;

/** Auto-advance when track ends */
export async function autoAdvance(): Promise<void> {
  if (_advanceInProgress) return;
  _advanceInProgress = true;
  try {
    const finishedTrack = player.currentTrack;
    if (finishedTrack) {
      incrementPlayCount(finishedTrack.id).catch((err) =>
        warnNonCritical('Increment play count', err),
      );
      // Optimistic update: playQueue + library.allTracks
      const newCount = finishedTrack.play_count + 1;
      const qIdx = player.playQueue.findIndex((t) => t.id === finishedTrack.id);
      if (qIdx >= 0) {
        player.playQueue[qIdx] = { ...player.playQueue[qIdx], play_count: newCount };
      }
      library.allTracks = library.allTracks.map((t) =>
        t.id === finishedTrack.id ? { ...t, play_count: newCount } : t,
      );
    }

    const nextIdx = getNextIndex(
      player.currentIndex,
      player.playQueue.length,
      player.repeatMode,
      player.shuffleEnabled,
      player.shuffledIndices,
    );
    if (nextIdx === null) {
      player.isPlaying = false;
      return;
    }
    await playTrackAtIndex(nextIdx);
  } finally {
    _advanceInProgress = false;
  }
}

/** Start playing a track from a given track list. */
export async function startPlayingTrack(track: Track, trackList: Track[]): Promise<void> {
  player.playQueue = trackList;
  player.currentIndex = trackList.findIndex((t) => t.id === track.id);
  await playTrackAtIndex(player.currentIndex, true);
}

/**
 * Clean up player and playlist state after a track is removed/trashed.
 * If the removed track is currently playing, auto-advance to the next track.
 * Uses a guard flag to prevent concurrent calls from corrupting state.
 */
let _removeInProgress = false;

export async function handleTrackRemoved(trackId: number): Promise<void> {
  if (_removeInProgress) return;
  _removeInProgress = true;
  try {
    await _handleTrackRemovedInner(trackId);
  } finally {
    _removeInProgress = false;
  }
}

async function _handleTrackRemovedInner(trackId: number): Promise<void> {
  const playlistState = getPlaylistState();

  // Snapshot current state at entry to avoid stale reads
  const snapshotIndex = player.currentIndex;
  const snapshotQueue = [...player.playQueue];
  const wasPlaying = player.currentTrack?.id === trackId;

  // Verify track exists in queue
  const queueIdx = snapshotQueue.findIndex((t) => t.id === trackId);
  if (queueIdx === -1) {
    // Track not in queue; still clean up playlists
    playlistState.playlists = playlistState.playlists.map((pl) => ({
      ...pl,
      track_ids: pl.track_ids.filter((id) => id !== trackId),
    }));
    return;
  }

  // Compute next index BEFORE removing from queue (removal shifts indices)
  let nextIdx: number | null = null;
  if (wasPlaying) {
    nextIdx = getNextIndex(
      snapshotIndex,
      snapshotQueue.length,
      player.repeatMode === 'repeat-one' ? 'repeat-all' : player.repeatMode,
      player.shuffleEnabled,
      player.shuffledIndices,
    );
    if (nextIdx === snapshotIndex && snapshotQueue.length <= 1) {
      nextIdx = null;
    }
    playbackApi.stop().catch((err) => warnNonCritical('Stop playback', err));
  }

  // Remove from play queue and adjust indices
  player.playQueue = snapshotQueue.filter((t) => t.id !== trackId);

  if (nextIdx !== null && queueIdx < nextIdx) {
    nextIdx = nextIdx - 1;
  }
  if (nextIdx !== null && nextIdx >= player.playQueue.length) {
    nextIdx = player.playQueue.length > 0 ? 0 : null;
  }

  if (!wasPlaying) {
    if (queueIdx < snapshotIndex) {
      player.currentIndex = snapshotIndex - 1;
    }
  }

  if (player.shuffleEnabled && player.shuffledIndices.length > 0) {
    player.shuffledIndices = player.shuffledIndices
      .filter((idx) => idx !== queueIdx)
      .map((idx) => (idx > queueIdx ? idx - 1 : idx));
  }

  // Remove from all playlists' track_ids
  playlistState.playlists = playlistState.playlists.map((pl) => ({
    ...pl,
    track_ids: pl.track_ids.filter((id) => id !== trackId),
  }));

  // Auto-advance or stop
  if (wasPlaying) {
    if (nextIdx !== null && nextIdx >= 0 && nextIdx < player.playQueue.length) {
      await playTrackAtIndex(nextIdx);
    } else {
      player.isPlaying = false;
      player.currentTrack = null;
      player.positionSecs = 0;
      player.durationSecs = 0;
      player.currentIndex = -1;
    }
  }
}

/** Toggle shuffle mode on/off. */
export function toggleShuffle(): void {
  player.shuffleEnabled = !player.shuffleEnabled;
  if (player.shuffleEnabled) {
    player.shuffledIndices = generateShuffledIndices(player.playQueue.length, player.currentIndex);
  }
  // Re-queue next track so gapless playback respects new shuffle state
  if (player.isPlaying) {
    tryQueueNext();
  }
}

/** Cycle repeat mode: off -> repeat-all -> repeat-one -> off. */
export function cycleRepeat(): void {
  const modes: RepeatMode[] = ['off', 'repeat-all', 'repeat-one'];
  const currentIdx = modes.indexOf(player.repeatMode);
  player.repeatMode = modes[(currentIdx + 1) % modes.length];
}
