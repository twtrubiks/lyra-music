import { getPlayerState } from '$lib/state/playerState.svelte';
import { getPlaylistState } from '$lib/state/playlistState.svelte';
import { getLibraryState } from '$lib/state/libraryState.svelte';
import { getNextIndex, getPrevIndex, generateShuffledIndices } from '$lib/logic/playmode';
import * as playbackApi from '$lib/api/playback';
import { getTrackCover, incrementPlayCount } from '$lib/api/library';
import { notifyCritical, warnNonCritical } from '$lib/logic/error-handler';
import type { Track, RepeatMode, PlayerState } from '$lib/types';

const player = getPlayerState();
const library = getLibraryState();

/**
 * True once the current track has actually started playing on the backend.
 * Guards play-count increments: a track whose file failed to load must not
 * be credited when a (possibly stale) track_ended event arrives.
 */
let _currentTrackStarted = false;

/**
 * Mutex between event-driven advances (autoAdvance / gapless transition).
 * Backend poll events arriving while any track change is in flight are
 * ignored — otherwise they would treat the in-flight track as "just
 * finished", miscounting plays and reloading it.
 */
let _advanceInProgress = false;

/**
 * User-initiated track changes currently in flight. Unlike event-driven
 * advances, user actions are never dropped — they preempt whatever is in
 * progress; this count only shields them from concurrent poll events.
 */
let _manualChangesInFlight = 0;

/**
 * Monotonically increasing id of the latest track change. An older change
 * resuming after its await compares epochs and skips its post-load effects
 * when a newer change has taken over.
 */
let _changeEpoch = 0;

/**
 * A repeat-one gapless transition dropped by the in-flight guards. Its track
 * id equals the current one, so the id-mismatch reconciliation in
 * applyPlayerStateEvent can never detect it; it is remembered here and
 * replayed on a later poll once the guards clear. Cleared without replaying
 * when the backend moves to a different track — dropping it can at most miss
 * one play count, never miscredit one.
 */
let _pendingSameTrackTransition: number | null = null;

/** Play a specific track by queue index. */
async function playTrackAtIndex(index: number): Promise<void> {
  const track = player.playQueue[index];
  if (!track) return;
  const epoch = ++_changeEpoch;
  player.currentIndex = index;
  player.currentTrack = track;
  player.positionSecs = 0;
  player.durationSecs = track.duration_secs;
  _currentTrackStarted = false;
  try {
    await playbackApi.playTrack(track.file_path, track.id, track.duration_secs);
    if (epoch !== _changeEpoch) return; // superseded by a newer track change
    player.isPlaying = true;
    _currentTrackStarted = true;
    tryQueueNext();
  } catch (err) {
    if (epoch === _changeEpoch) {
      notifyCritical('Play track', err);
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
  _manualChangesInFlight++;
  try {
    await playTrackAtIndex(prevIdx);
  } finally {
    _manualChangesInFlight--;
  }
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
  _manualChangesInFlight++;
  try {
    await playTrackAtIndex(nextIdx);
  } finally {
    _manualChangesInFlight--;
  }
}

/** Handle gapless transition: backend already switched track, just update frontend state */
export async function handleGaplessTransition(newTrackId: number): Promise<void> {
  if (_advanceInProgress || _manualChangesInFlight > 0) return;
  _advanceInProgress = true;
  try {
    const finishedTrack = player.currentTrack;
    if (finishedTrack && _currentTrackStarted) {
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

    // The gapless next was queued from getNextIndex, so prefer that index:
    // when the same track appears more than once in the queue, findIndex
    // would land on the first occurrence and the follow-up queueing would
    // pick the wrong next track.
    const expectedIdx = getNextIndex(
      player.currentIndex,
      player.playQueue.length,
      player.repeatMode,
      player.shuffleEnabled,
      player.shuffledIndices,
    );
    const newIdx =
      expectedIdx !== null && player.playQueue[expectedIdx]?.id === newTrackId
        ? expectedIdx
        : player.playQueue.findIndex((t) => t.id === newTrackId);
    if (newIdx >= 0) {
      player.currentIndex = newIdx;
      player.currentTrack = player.playQueue[newIdx];
      // The backend only emits gapless_transitioned after a successful
      // queue_next, so the new track is genuinely playing
      _currentTrackStarted = true;
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

/** Auto-advance when track ends */
export async function autoAdvance(): Promise<void> {
  if (_advanceInProgress || _manualChangesInFlight > 0) return;
  _advanceInProgress = true;
  try {
    const finishedTrack = player.currentTrack;
    if (finishedTrack && _currentTrackStarted) {
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
  _manualChangesInFlight++;
  try {
    player.playQueue = trackList;
    player.currentIndex = trackList.findIndex((t) => t.id === track.id);
    await playTrackAtIndex(player.currentIndex);
  } finally {
    _manualChangesInFlight--;
  }
}

/**
 * Apply a backend `player-state-changed` poll event to frontend state and
 * dispatch end-of-track handling.
 */
export function applyPlayerStateEvent(state: PlayerState): void {
  player.isPlaying = state.is_playing;
  player.positionSecs = state.position_secs;
  if (state.duration_secs > 0) {
    player.durationSecs = state.duration_secs;
  }
  player.volume = state.volume;
  if (state.gapless_transitioned && state.current_track_id != null) {
    if (
      (_advanceInProgress || _manualChangesInFlight > 0) &&
      player.repeatMode === 'repeat-one' &&
      state.current_track_id === player.currentTrack?.id
    ) {
      // The guards below will drop this one-shot event, and the same-id
      // reconciliation can't recover it — remember it for a later poll.
      _pendingSameTrackTransition = state.current_track_id;
    }
    void handleGaplessTransition(state.current_track_id);
  } else if (state.track_ended && state.current_track_id === player.currentTrack?.id) {
    // Identity check: only advance when the event describes the track the
    // UI considers current. A stale ended event snapshotted before a manual
    // track change must not advance again.
    void autoAdvance();
  } else if (
    state.is_playing &&
    state.current_track_id != null &&
    player.currentTrack !== null &&
    state.current_track_id !== player.currentTrack.id &&
    player.playQueue.some((t) => t.id === state.current_track_id)
  ) {
    // gapless_transitioned is emitted for a single poll cycle only. If it
    // arrived while an advance or manual change was in flight, the guard in
    // handleGaplessTransition dropped it and the backend never re-emits —
    // leaving the backend on the next track while the UI shows the previous
    // one. Reconcile from the steady-state current_track_id instead; the
    // same in-flight guards keep ordinary manual changes safe, and polls
    // repeat every 250ms so a dropped cycle self-heals on the next one.
    // The queue-membership check keeps this from re-firing forever (and
    // re-crediting play counts) when the backend plays a track the user has
    // since removed from the queue — reconciliation is impossible there.
    void handleGaplessTransition(state.current_track_id);
  } else if (_pendingSameTrackTransition != null) {
    if (
      state.is_playing &&
      state.current_track_id === _pendingSameTrackTransition &&
      state.current_track_id === player.currentTrack?.id &&
      !_advanceInProgress &&
      _manualChangesInFlight === 0
    ) {
      const pendingId = _pendingSameTrackTransition;
      _pendingSameTrackTransition = null;
      void handleGaplessTransition(pendingId);
    } else if (state.current_track_id !== _pendingSameTrackTransition) {
      // The backend moved elsewhere (manual change, stop): stale, discard.
      _pendingSameTrackTransition = null;
    }
  }
}

/**
 * Clean up player and playlist state after a track is removed/trashed.
 * If the removed track is currently playing, auto-advance to the next track.
 * Uses a guard flag to prevent concurrent calls from corrupting state.
 */
let _removeInProgress = false;
let _pendingRemoveIds: Set<number> | null = null;

export async function handleTrackRemoved(trackId: number): Promise<void> {
  await handleTracksRemovedBatch(new Set([trackId]));
}

/**
 * Batch clean up player and playlist state after multiple tracks are removed/trashed.
 * Processes all removals in one pass to minimize re-renders (~3 instead of ~N*3).
 * Concurrent calls are queued and processed after the current batch completes.
 */
export async function handleTracksRemovedBatch(trackIds: Set<number>): Promise<void> {
  if (_removeInProgress) {
    if (!_pendingRemoveIds) _pendingRemoveIds = new Set();
    for (const id of trackIds) _pendingRemoveIds.add(id);
    return;
  }
  _removeInProgress = true;
  try {
    await _handleTracksRemovedBatchInner(trackIds);
    while (_pendingRemoveIds !== null && _pendingRemoveIds.size > 0) {
      const pending = _pendingRemoveIds;
      _pendingRemoveIds = null;
      await _handleTracksRemovedBatchInner(pending);
    }
  } finally {
    _removeInProgress = false;
    _pendingRemoveIds = null;
  }
}

async function _handleTracksRemovedBatchInner(trackIds: Set<number>): Promise<void> {
  const playlistState = getPlaylistState();

  // Snapshot current state
  const snapshotQueue = [...player.playQueue];
  const snapshotIndex = player.currentIndex;
  const wasPlaying = player.currentTrack !== null && trackIds.has(player.currentTrack.id);

  // Find all queue indices being removed
  const removedQueueIndices = new Set<number>();
  for (let i = 0; i < snapshotQueue.length; i++) {
    if (trackIds.has(snapshotQueue[i].id)) {
      removedQueueIndices.add(i);
    }
  }

  // If no tracks in queue are affected, just clean up playlists
  if (removedQueueIndices.size === 0) {
    playlistState.playlists = playlistState.playlists.map((pl) => ({
      ...pl,
      track_ids: pl.track_ids.filter((id) => !trackIds.has(id)),
    }));
    return;
  }

  // If currently playing track is being removed, find the next surviving track
  let nextIdx: number | null = null;
  if (wasPlaying) {
    // Walk forward from current position, skipping all removed tracks
    let candidate = getNextIndex(
      snapshotIndex,
      snapshotQueue.length,
      player.repeatMode === 'repeat-one' ? 'repeat-all' : player.repeatMode,
      player.shuffleEnabled,
      player.shuffledIndices,
    );

    // Keep walking if the candidate is also being removed
    const visited = new Set<number>();
    while (candidate !== null && removedQueueIndices.has(candidate) && !visited.has(candidate)) {
      visited.add(candidate);
      candidate = getNextIndex(
        candidate,
        snapshotQueue.length,
        player.repeatMode === 'repeat-one' ? 'repeat-all' : player.repeatMode,
        player.shuffleEnabled,
        player.shuffledIndices,
      );
    }

    // If we looped back to a removed track or null, no surviving track
    if (candidate !== null && !removedQueueIndices.has(candidate)) {
      nextIdx = candidate;
    }

    playbackApi.stop().catch((err) => warnNonCritical('Stop playback', err));
  }

  // 1. Filter playQueue in one pass (1 re-render)
  player.playQueue = snapshotQueue.filter((t) => !trackIds.has(t.id));

  // 2. Remap nextIdx from old index space to new index space
  if (nextIdx !== null) {
    // Count how many removed indices are before nextIdx
    let offset = 0;
    for (const ri of removedQueueIndices) {
      if (ri < nextIdx) offset++;
    }
    nextIdx = nextIdx - offset;
    if (nextIdx >= player.playQueue.length) {
      nextIdx = player.playQueue.length > 0 ? 0 : null;
    }
  }

  // 3. Adjust currentIndex for non-playing case
  if (!wasPlaying) {
    let offset = 0;
    for (const ri of removedQueueIndices) {
      if (ri < snapshotIndex) offset++;
    }
    player.currentIndex = snapshotIndex - offset;
  }

  // 4. Update shuffledIndices — filter + remap (1 re-render)
  if (player.shuffleEnabled && player.shuffledIndices.length > 0) {
    player.shuffledIndices = player.shuffledIndices
      .filter((idx) => !removedQueueIndices.has(idx))
      .map((idx) => {
        let offset = 0;
        for (const ri of removedQueueIndices) {
          if (ri < idx) offset++;
        }
        return idx - offset;
      });
  }

  // 5. Clean up playlists (1 re-render)
  playlistState.playlists = playlistState.playlists.map((pl) => ({
    ...pl,
    track_ids: pl.track_ids.filter((id) => !trackIds.has(id)),
  }));

  // 6. Auto-advance or stop
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
