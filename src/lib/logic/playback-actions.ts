import { getPlayerState } from '$lib/state/playerState.svelte';
import { getPlaylistState } from '$lib/state/playlistState.svelte';
import { getLibraryState } from '$lib/state/libraryState.svelte';
import { getNextIndex, getPrevIndex, generateShuffledIndices } from '$lib/logic/playmode';
import * as playbackApi from '$lib/api/playback';
import * as playlistApi from '$lib/api/playlist';
import { getTrackCover } from '$lib/api/library';
import {
  resolveResumeTarget,
  maybeSavePlaybackPosition,
  resetSaveThrottle,
} from '$lib/logic/resume-playback';
import { notifyCritical, warnNonCritical } from '$lib/logic/error-handler';
import type { Track, RepeatMode, PlayerState } from '$lib/types';

const player = getPlayerState();
const library = getLibraryState();

/**
 * Mutex between event-driven advances (autoAdvance / gapless transition).
 * Backend poll events arriving while any track change is in flight are
 * ignored — otherwise they would treat the in-flight track as "just
 * finished" and reload it. Play counts are unaffected either way: they are
 * credited in the backend and mirrored via completion_seq below.
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
 * Last completion_seq processed from backend state events. Play counts are
 * credited by the backend polling thread — completion detection and the DB
 * write happen in one thread under one lock, so exactly-once holds by
 * construction. The frontend only mirrors the +1 into its local track
 * copies when the sequence advances. Level-triggered: the seq persists in
 * every later poll, so a dropped cycle can never lose a completion. null
 * until the first event — that first snapshot is a baseline, not a
 * completion (its plays were credited before this page load).
 */
let _lastCompletionSeq: number | null = null;

/** Forget the completion-seq baseline (test isolation). */
export function resetCompletionTracking(): void {
  _lastCompletionSeq = null;
}

/**
 * Set when the queue finished naturally and the saved playlist position was
 * rewound to the queue start. The backend keeps reporting the finished track
 * on subsequent idle polls; without this flag those polls would immediately
 * overwrite the rewound position with the tail of the last track.
 */
let _queueFinished = false;

/** Play a specific track by queue index. */
async function playTrackAtIndex(index: number): Promise<void> {
  _queueFinished = false;
  const track = player.playQueue[index];
  if (!track) return;
  const epoch = ++_changeEpoch;
  player.currentIndex = index;
  player.currentTrack = track;
  player.positionSecs = 0;
  player.durationSecs = track.duration_secs;
  try {
    await playbackApi.playTrack(track.file_path, track.id, track.duration_secs);
    if (epoch !== _changeEpoch) return; // superseded by a newer track change
    player.isPlaying = true;
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
    // Play count for the finished track is credited by the backend polling
    // thread and mirrored locally via completion_seq — nothing to count here.

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
    const nextIdx = getNextIndex(
      player.currentIndex,
      player.playQueue.length,
      player.repeatMode,
      player.shuffleEnabled,
      player.shuffledIndices,
    );
    if (nextIdx === null) {
      player.isPlaying = false;
      // Playlist finished: rewind the saved position so the next resume
      // starts over instead of landing at the tail of the last track.
      if (player.queueSourcePlaylistId != null && player.playQueue.length > 0) {
        maybeSavePlaybackPosition(player.queueSourcePlaylistId, player.playQueue[0].id, 0, false);
        _queueFinished = true;
      }
      return;
    }
    await playTrackAtIndex(nextIdx);
  } finally {
    _advanceInProgress = false;
  }
}

/**
 * Start playing a track from a given track list. `sourcePlaylistId` binds the
 * queue to a playlist so its playback position gets persisted for resume;
 * playing from the library/browse views leaves it null.
 */
export async function startPlayingTrack(
  track: Track,
  trackList: Track[],
  sourcePlaylistId: number | null = null,
): Promise<void> {
  _manualChangesInFlight++;
  try {
    player.playQueue = trackList;
    player.currentIndex = trackList.findIndex((t) => t.id === track.id);
    player.queueSourcePlaylistId = sourcePlaylistId;
    // The throttle keys on track id only — reset it so the first save after
    // rebinding lands even when the new playlist shares the same track.
    resetSaveThrottle();
    await playTrackAtIndex(player.currentIndex);
  } finally {
    _manualChangesInFlight--;
  }
}

/**
 * Start playing a playlist from its last saved position (斷點續播).
 * Falls back to the first track when nothing was saved or the saved track
 * has been removed from the playlist since.
 */
export async function resumePlaylistPlayback(playlistId: number, tracks: Track[]): Promise<void> {
  if (tracks.length === 0) return;
  let target: { index: number; secs: number } | null = null;
  try {
    const [lastTrackId, lastSecs] = await playlistApi.getLastPlaybackPosition(playlistId);
    target = resolveResumeTarget(tracks, lastTrackId, lastSecs);
  } catch (err) {
    warnNonCritical('Get last playback position', err);
  }
  await startPlayingTrack(tracks[target?.index ?? 0], tracks, playlistId);
  // A manual track change may have preempted the resume while it was loading;
  // seeking then would land the new track at the old track's position.
  if (target && target.secs > 0 && player.currentTrack?.id === tracks[target.index].id) {
    player.positionSecs = target.secs;
    try {
      await playbackApi.seek(target.secs);
    } catch (err) {
      warnNonCritical('Seek to saved position', err);
    }
    // seek can drop the gapless queue on its reload fallback — re-queue
    tryQueueNext();
  }
}

/** Mirror a backend-credited play count into the local track copies. */
function applyLocalPlayCount(trackId: number): void {
  const qIdx = player.playQueue.findIndex((t) => t.id === trackId);
  if (qIdx >= 0) {
    player.playQueue[qIdx] = {
      ...player.playQueue[qIdx],
      play_count: player.playQueue[qIdx].play_count + 1,
    };
  }
  library.allTracks = library.allTracks.map((t) =>
    t.id === trackId ? { ...t, play_count: t.play_count + 1 } : t,
  );
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
  // Mirror backend-credited play counts. Runs before and independent of the
  // in-flight guards below: it is idempotent by sequence and names the
  // credited track explicitly, so a concurrent manual change can neither
  // drop nor double a count.
  if (_lastCompletionSeq === null) {
    _lastCompletionSeq = state.completion_seq;
  } else if (state.completion_seq > _lastCompletionSeq) {
    _lastCompletionSeq = state.completion_seq;
    if (state.last_completed_track_id != null) {
      applyLocalPlayCount(state.last_completed_track_id);
    }
  }
  if (
    player.queueSourcePlaylistId != null &&
    player.currentTrack != null &&
    state.current_track_id === player.currentTrack.id &&
    !state.track_ended &&
    !state.gapless_transitioned &&
    !_queueFinished
  ) {
    maybeSavePlaybackPosition(
      player.queueSourcePlaylistId,
      player.currentTrack.id,
      state.position_secs,
      state.is_playing,
    );
  }
  if (state.gapless_transitioned && state.current_track_id != null) {
    // If the in-flight guards drop a repeat-one transition (same track id,
    // invisible to the id-mismatch reconciliation below), the only cost is
    // one seam: the loop replays via track_ended on a later poll. The play
    // count is already safe — it travels in completion_seq above.
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
    // The queue-membership check keeps this from re-firing forever when the
    // backend plays a track the user has since removed from the queue —
    // reconciliation is impossible there.
    void handleGaplessTransition(state.current_track_id);
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
