<script lang="ts">
  import { t } from '$lib/i18n/index.svelte';
  import type { Track, TrackDetails } from '$lib/types';
  import TrackList from '../Library/TrackList.svelte';
  import TrackPropertiesDialog from '../Library/TrackPropertiesDialog.svelte';
  import StatusBar from '../Library/StatusBar.svelte';
  import { getPlayerState } from '$lib/state/playerState.svelte';
  import { getPlaylistState } from '$lib/state/playlistState.svelte';
  import * as playlistApi from '$lib/api/playlist';
  import * as libraryApi from '$lib/api/library';
  import {
    startPlayingTrack,
    resumePlaylistPlayback,
    reorderQueue,
  } from '$lib/logic/playback-actions';
  import { optimisticTrash, optimisticPlaylistRemove } from '$lib/logic/track-actions';
  import { notifyCritical } from '$lib/logic/error-handler';
  import { filterTracks } from '$lib/logic/format';
  import { watchLibraryChanged } from '$lib/logic/watch-library-changed';

  let {
    playlistId,
    playlistName,
  }: {
    playlistId: number;
    playlistName: string;
  } = $props();

  const player = getPlayerState();

  let tracks = $state<Track[]>([]);
  let searchQuery = $state('');
  let visibleTracks = $derived(filterTracks(tracks, searchQuery));
  // Moving rows within a filtered subset has no well-defined position in the
  // full playlist, so reordering is off while a search is active.
  let searching = $derived(searchQuery.trim() !== '');

  let showProperties = $state(false);
  let propertiesDetails = $state<TrackDetails | null>(null);

  /**
   * Monotonically increasing id of the latest load. Switching playlists
   * reuses this component instance, so a slow response for the previous
   * playlist must not overwrite the tracks of the one shown now.
   */
  let loadEpoch = 0;

  async function loadTracks() {
    const epoch = ++loadEpoch;
    try {
      const loaded = await playlistApi.getPlaylistTracks(playlistId);
      if (epoch === loadEpoch) {
        tracks = loaded;
      }
    } catch (err) {
      if (epoch === loadEpoch) {
        notifyCritical('action.loadPlaylistTracks', err);
      }
    }
  }

  async function handlePlay(track: Track) {
    // Like the library view, the queue is what is listed — the search results.
    await startPlayingTrack(track, visibleTracks, playlistId);
  }

  async function handlePlayAll() {
    await resumePlaylistPlayback(playlistId, tracks);
  }

  async function handleRemove(tracksToRemove: Track[]) {
    await optimisticPlaylistRemove(playlistId, tracksToRemove, {
      onComplete: loadTracks,
    });
  }

  async function handleTrash(tracksToTrash: Track[]) {
    await optimisticTrash(tracksToTrash, {
      getLocalTracks: () => tracks,
      setLocalTracks: (v) => {
        tracks = v;
      },
      onComplete: loadTracks,
    });
  }

  async function handleProperties(track: Track) {
    try {
      propertiesDetails = await libraryApi.getTrackDetails(track.id);
      showProperties = true;
    } catch (err) {
      notifyCritical('action.getTrackDetails', err);
    }
  }

  async function handleReorder(trackIds: number[]) {
    // Optimistic update
    const trackMap = new Map(tracks.map((t) => [t.id, t]));
    tracks = trackIds.map((id) => trackMap.get(id)!).filter(Boolean);
    // Update playlistState
    const playlistState = getPlaylistState();
    playlistState.playlists = playlistState.playlists.map((pl) =>
      pl.id === playlistId ? { ...pl, track_ids: trackIds } : pl,
    );
    try {
      await playlistApi.reorderPlaylist(playlistId, trackIds);
    } catch (err) {
      notifyCritical('action.reorderPlaylist', err);
      await loadTracks(); // fallback
      return;
    }
    // The playing queue is a snapshot; keep it in step when it came from here.
    if (player.queueSourcePlaylistId === playlistId) {
      reorderQueue(trackIds);
    }
  }

  $effect(() => {
    void playlistId;
    // This instance is reused across playlists; a search belongs to one.
    searchQuery = '';
  });

  $effect(() => {
    void playlistId;
    // Also reload when tracks were added from outside (files dropped in).
    void getPlaylistState().tracksVersion;
    loadTracks();
  });

  // This local list is not derived from library.allTracks — reload when the
  // watcher lands disk changes, or it keeps ghost rows and stale paths.
  $effect(() =>
    watchLibraryChanged(() => {
      void loadTracks();
    }),
  );
</script>

<div class="playlist-editor">
  <div class="header">
    <h2>{playlistName}</h2>
    <button
      class="play-all-btn"
      onclick={handlePlayAll}
      disabled={tracks.length === 0}
      title={t('playlist.resumeHint')}
    >
      <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
        <path d="M8 5v14l11-7z" />
      </svg>
      {t('playlist.play')}
    </button>
    <div class="search-box">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" class="search-icon">
        <path
          d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
        />
      </svg>
      <input type="text" placeholder={t('library.searchTracks')} bind:value={searchQuery} />
    </div>
  </div>

  <TrackList
    tracks={visibleTracks}
    currentTrackId={player.currentTrack?.id ?? null}
    onplay={handlePlay}
    onremove={handleRemove}
    ontrash={handleTrash}
    onproperties={handleProperties}
    onreorder={searching ? undefined : handleReorder}
  />

  <StatusBar tracks={visibleTracks} />
</div>

{#if showProperties && propertiesDetails}
  <TrackPropertiesDialog
    details={propertiesDetails}
    onclose={() => {
      showProperties = false;
      propertiesDetails = null;
    }}
  />
{/if}

<style>
  .playlist-editor {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 20px;
  }

  .header {
    display: flex;
    align-items: baseline;
    gap: 12px;
    margin-bottom: 16px;
    flex-shrink: 0;
  }

  h2 {
    margin: 0;
    font-size: 22px;
    font-weight: 700;
    color: #eee;
  }

  .play-all-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    background: #e2603a;
    border: none;
    border-radius: 16px;
    color: #fff;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
  }

  .play-all-btn:hover:not(:disabled) {
    background: #f8865b;
  }

  .play-all-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .search-box {
    display: flex;
    align-items: center;
    align-self: center;
    gap: 6px;
    margin-left: auto;
    background: #16213e;
    border-radius: 6px;
    padding: 6px 12px;
    border: 1px solid #2a2a4a;
  }

  .search-icon {
    color: #666;
    flex-shrink: 0;
  }

  .search-box input {
    background: transparent;
    border: none;
    outline: none;
    color: #eee;
    font-size: 13px;
    width: 180px;
  }

  .search-box input::placeholder {
    color: #555;
  }
</style>
