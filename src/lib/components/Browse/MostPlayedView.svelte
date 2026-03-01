<script lang="ts">
  import type { Track, TrackDetails } from '$lib/types';
  import TrackList from '../Library/TrackList.svelte';
  import TrackPropertiesDialog from '../Library/TrackPropertiesDialog.svelte';
  import StatusBar from '../Library/StatusBar.svelte';
  import { getPlayerState } from '$lib/state/playerState.svelte';
  import { getLibraryState } from '$lib/state/libraryState.svelte';
  import * as libraryApi from '$lib/api/library';
  import { startPlayingTrack } from '$lib/logic/playback-actions';
  import { optimisticTrash, optimisticRemove } from '$lib/logic/track-actions';
  import { notifyCritical } from '$lib/logic/error-handler';

  const player = getPlayerState();
  const library = getLibraryState();

  let tracks = $state<Track[]>([]);
  let isLoading = $state(true);

  let showProperties = $state(false);
  let propertiesDetails = $state<TrackDetails | null>(null);

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

  async function handleTrash(tracksToTrash: Track[]) {
    await optimisticTrash(tracksToTrash, {
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
      isLoading = true;
      try {
        tracks = await libraryApi.getMostPlayedTracks(50);
      } catch (err) {
        notifyCritical('Load most played', err);
      } finally {
        isLoading = false;
      }
    })();
  });
</script>

<div class="most-played-view">
  <div class="header">
    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" class="header-icon">
      <path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z" />
    </svg>
    <h2>Most Played</h2>
    <span class="track-count">{tracks.length} track{tracks.length !== 1 ? 's' : ''}</span>
  </div>

  {#if isLoading}
    <div class="empty"><p>Loading...</p></div>
  {:else if tracks.length === 0}
    <div class="empty"><p>No play history yet. Start listening!</p></div>
  {:else}
    <TrackList
      {tracks}
      currentTrackId={player.currentTrack?.id ?? null}
      onplay={handlePlay}
      onremove={handleRemove}
      ontrash={handleTrash}
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
  .most-played-view {
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

  .header-icon {
    color: #e94560;
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
