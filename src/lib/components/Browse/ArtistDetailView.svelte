<script lang="ts">
  import type { Track, TrackDetails } from '$lib/types';
  import TrackList from '../Library/TrackList.svelte';
  import TrackPropertiesDialog from '../Library/TrackPropertiesDialog.svelte';
  import StatusBar from '../Library/StatusBar.svelte';
  import { getPlaylistState } from '$lib/state/playlistState.svelte';
  import { getPlayerState } from '$lib/state/playerState.svelte';
  import { getLibraryState } from '$lib/state/libraryState.svelte';
  import * as libraryApi from '$lib/api/library';
  import { startPlayingTrack } from '$lib/logic/playback-actions';
  import { optimisticRemove } from '$lib/logic/track-actions';
  import { notifyCritical } from '$lib/logic/error-handler';

  let { artistName }: { artistName: string } = $props();

  const playlistState = getPlaylistState();
  const player = getPlayerState();
  const library = getLibraryState();

  let tracks = $state<Track[]>([]);
  let isLoading = $state(true);

  let showProperties = $state(false);
  let propertiesDetails = $state<TrackDetails | null>(null);

  function goBack() {
    playlistState.activeView = { kind: 'artists' };
  }

  async function handlePlay(track: Track) {
    await startPlayingTrack(track, tracks);
  }

  async function handleRemove(tracksToRemove: Track[]) {
    await optimisticRemove(tracksToRemove, {
      getLocalTracks: () => tracks,
      setLocalTracks: (v) => {
        tracks = v;
      },
    });
  }

  async function handleProperties(track: Track) {
    try {
      propertiesDetails = await libraryApi.getTrackDetails(track.id);
      showProperties = true;
    } catch (err) {
      notifyCritical('Get track details', err);
    }
  }

  async function handleSaveMetadata(update: { title: string; artist: string; album: string }) {
    if (!propertiesDetails) return;
    try {
      const updated = await libraryApi.updateTrackMetadata(
        propertiesDetails.id,
        update.title,
        update.artist,
        update.album,
      );
      tracks = tracks.map((t) => (t.id === updated.id ? updated : t));
      library.allTracks = library.allTracks.map((t) => (t.id === updated.id ? updated : t));
      propertiesDetails = {
        ...propertiesDetails,
        title: update.title,
        artist: update.artist,
        album: update.album,
      };
      if (player.currentTrack?.id === updated.id) {
        player.currentTrack = updated;
      }
    } catch (err) {
      notifyCritical('Update metadata', err);
    }
  }

  $effect(() => {
    (async () => {
      try {
        tracks = await libraryApi.getTracksByArtist(artistName);
      } catch (err) {
        notifyCritical('Load artist tracks', err);
      } finally {
        isLoading = false;
      }
    })();
  });
</script>

<div class="artist-detail-view">
  <div class="header">
    <button class="back-btn" onclick={goBack} aria-label="Back to artists">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
        <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
      </svg>
    </button>
    <h2>{artistName}</h2>
    <span class="track-count">{tracks.length} track{tracks.length !== 1 ? 's' : ''}</span>
  </div>

  {#if isLoading}
    <div class="empty"><p>Loading...</p></div>
  {:else}
    <TrackList
      {tracks}
      currentTrackId={player.currentTrack?.id ?? null}
      onplay={handlePlay}
      onremove={handleRemove}
      onproperties={handleProperties}
    />
    <StatusBar {tracks} />
  {/if}
</div>

{#if showProperties && propertiesDetails}
  <TrackPropertiesDialog
    details={propertiesDetails}
    onclose={() => {
      showProperties = false;
      propertiesDetails = null;
    }}
    onsave={handleSaveMetadata}
  />
{/if}

<style>
  .artist-detail-view {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 20px;
  }

  .header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
    flex-shrink: 0;
  }

  .back-btn {
    background: transparent;
    border: none;
    color: #aaa;
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    transition:
      color 0.15s,
      background 0.15s;
  }

  .back-btn:hover {
    color: #eee;
    background: rgb(255 255 255 / 10%);
  }

  h2 {
    margin: 0;
    font-size: 22px;
    font-weight: 700;
    color: #eee;
  }

  .track-count {
    font-size: 13px;
    color: #888;
  }

  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 300px;
    color: #666;
  }
</style>
