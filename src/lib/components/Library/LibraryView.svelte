<script lang="ts">
  import type { Track, TrackDetails, SortColumn } from '$lib/types';
  import TrackList from './TrackList.svelte';
  import TrackPropertiesDialog from './TrackPropertiesDialog.svelte';
  import StatusBar from './StatusBar.svelte';
  import { getLibraryState } from '$lib/state/libraryState.svelte';
  import { getPlayerState } from '$lib/state/playerState.svelte';
  import * as libraryApi from '$lib/api/library';
  import { filterTracks } from '$lib/logic/format';
  import { startPlayingTrack } from '$lib/logic/playback-actions';
  import { optimisticTrash, optimisticRemove } from '$lib/logic/track-actions';
  import { notifyCritical } from '$lib/logic/error-handler';
  import { sortTracks, toggleSort, loadSortConfig, saveSortConfig } from '$lib/logic/sorting';

  const library = getLibraryState();
  const player = getPlayerState();

  let searchQuery = $state('');
  let sortConfig = $state(loadSortConfig());
  let filteredTracks = $derived(filterTracks(library.allTracks, searchQuery));
  let sortedTracks = $derived(sortTracks(filteredTracks, sortConfig));

  function handleSort(column: SortColumn) {
    sortConfig = toggleSort(sortConfig, column);
    saveSortConfig(sortConfig);
  }

  let showProperties = $state(false);
  let propertiesDetails = $state<TrackDetails | null>(null);

  async function handlePlay(track: Track) {
    await startPlayingTrack(track, sortedTracks);
  }

  async function handleRemove(tracksToRemove: Track[]) {
    await optimisticRemove(tracksToRemove);
  }

  async function handleTrash(tracksToTrash: Track[]) {
    await optimisticTrash(tracksToTrash);
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

  // Load all tracks on mount
  $effect(() => {
    (async () => {
      try {
        const tracks = await libraryApi.getAllTracks();
        library.allTracks = tracks;
      } catch (err) {
        notifyCritical('Load library', err);
      }
    })();
  });
</script>

<div class="library-view">
  <div class="header">
    <h2>All Music</h2>
    <div class="search-box">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" class="search-icon">
        <path
          d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
        />
      </svg>
      <input type="text" placeholder="Search tracks..." bind:value={searchQuery} />
    </div>
  </div>

  <TrackList
    tracks={sortedTracks}
    currentTrackId={player.currentTrack?.id ?? null}
    onplay={handlePlay}
    onremove={handleRemove}
    ontrash={handleTrash}
    onproperties={handleProperties}
    {sortConfig}
    onsort={handleSort}
  />

  <StatusBar tracks={sortedTracks} />
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
  .library-view {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 20px;
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
    flex-shrink: 0;
  }

  h2 {
    margin: 0;
    font-size: 22px;
    font-weight: 700;
    color: #eee;
  }

  .search-box {
    display: flex;
    align-items: center;
    gap: 6px;
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
