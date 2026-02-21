<script lang="ts">
  import type { ArtistSummary } from '$lib/types';
  import { getPlaylistState } from '$lib/state/playlistState.svelte';
  import * as libraryApi from '$lib/api/library';
  import { notifyCritical } from '$lib/logic/error-handler';

  const playlistState = getPlaylistState();

  let artists = $state<ArtistSummary[]>([]);
  let searchQuery = $state('');
  let isLoading = $state(true);

  let filteredArtists = $derived(
    searchQuery.trim()
      ? artists.filter((a) => a.name.toLowerCase().includes(searchQuery.toLowerCase()))
      : artists,
  );

  function goToArtist(name: string) {
    playlistState.activeView = { kind: 'artist-detail', artistName: name };
  }

  $effect(() => {
    (async () => {
      try {
        artists = await libraryApi.getAllArtists();
      } catch (err) {
        notifyCritical('Load artists', err);
      } finally {
        isLoading = false;
      }
    })();
  });
</script>

<div class="artist-list-view">
  <div class="header">
    <h2>Artists</h2>
    <div class="search-box">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" class="search-icon">
        <path
          d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
        />
      </svg>
      <input type="text" placeholder="Search artists..." bind:value={searchQuery} />
    </div>
  </div>

  <div class="artist-scroll">
    {#if isLoading}
      <div class="empty"><p>Loading...</p></div>
    {:else if filteredArtists.length === 0}
      <div class="empty"><p>No artists found.</p></div>
    {:else}
      {#each filteredArtists as artist (artist.name)}
        <button class="artist-row" onclick={() => goToArtist(artist.name)}>
          <div class="artist-icon">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path
                d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
              />
            </svg>
          </div>
          <div class="artist-info">
            <span class="artist-name">{artist.name}</span>
            <span class="artist-count"
              >{artist.track_count} track{artist.track_count !== 1 ? 's' : ''}</span
            >
          </div>
          <svg class="chevron" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
          </svg>
        </button>
      {/each}
    {/if}
  </div>
</div>

<style>
  .artist-list-view {
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

  .artist-scroll {
    flex: 1;
    overflow-y: auto;
  }

  .artist-row {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 10px 12px;
    background: transparent;
    border: none;
    border-bottom: 1px solid #1a1a2e;
    color: #eee;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s;
  }

  .artist-row:hover {
    background: rgb(233 69 96 / 10%);
  }

  .artist-icon {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: #2a2a4a;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: #888;
  }

  .artist-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .artist-name {
    font-size: 14px;
    color: #eee;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .artist-count {
    font-size: 12px;
    color: #888;
  }

  .chevron {
    flex-shrink: 0;
    color: #555;
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
