<script lang="ts">
  import type { AlbumSummary } from '$lib/types';
  import { getPlaylistState } from '$lib/state/playlistState.svelte';
  import * as libraryApi from '$lib/api/library';
  import { notifyCritical } from '$lib/logic/error-handler';

  const playlistState = getPlaylistState();

  let albums = $state<AlbumSummary[]>([]);
  let searchQuery = $state('');
  let isLoading = $state(true);
  let coverCache = $state<Record<string, string | null>>({});

  let filteredAlbums = $derived(
    searchQuery.trim()
      ? albums.filter(
          (a) =>
            a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            a.artist.toLowerCase().includes(searchQuery.toLowerCase()),
        )
      : albums,
  );

  function goToAlbum(album: AlbumSummary) {
    playlistState.activeView = {
      kind: 'album-detail',
      albumName: album.name,
      artistName: album.artist,
    };
  }

  function albumKey(a: AlbumSummary) {
    return `${a.name}::${a.artist}`;
  }

  async function loadCover(album: AlbumSummary) {
    const key = albumKey(album);
    if (key in coverCache) return;
    try {
      const tracks = await libraryApi.getTracksByAlbum(album.name, album.artist);
      if (tracks.length > 0) {
        const cover = await libraryApi.getTrackCover(tracks[0].id);
        coverCache = { ...coverCache, [key]: cover };
      } else {
        coverCache = { ...coverCache, [key]: null };
      }
    } catch {
      coverCache = { ...coverCache, [key]: null };
    }
  }

  $effect(() => {
    (async () => {
      try {
        albums = await libraryApi.getAllAlbums();
      } catch (err) {
        notifyCritical('Load albums', err);
      } finally {
        isLoading = false;
      }
    })();
  });

  // Load covers for visible albums
  $effect(() => {
    for (const album of filteredAlbums) {
      if (!(albumKey(album) in coverCache)) {
        loadCover(album);
      }
    }
  });
</script>

<div class="album-list-view">
  <div class="header">
    <h2>Albums</h2>
    <div class="search-box">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" class="search-icon">
        <path
          d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
        />
      </svg>
      <input type="text" placeholder="Search albums..." bind:value={searchQuery} />
    </div>
  </div>

  <div class="album-scroll">
    {#if isLoading}
      <div class="empty"><p>Loading...</p></div>
    {:else if filteredAlbums.length === 0}
      <div class="empty"><p>No albums found.</p></div>
    {:else}
      <div class="album-grid">
        {#each filteredAlbums as album (album.name + '::' + album.artist)}
          <button class="album-card" onclick={() => goToAlbum(album)}>
            <div class="album-cover">
              {#if coverCache[albumKey(album)]}
                <img src={coverCache[albumKey(album)]} alt={album.name} />
              {:else}
                <div class="cover-placeholder">
                  <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor">
                    <path
                      d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-5.5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z"
                    />
                  </svg>
                </div>
              {/if}
            </div>
            <div class="album-info">
              <span class="album-name">{album.name}</span>
              <span class="album-artist">{album.artist}</span>
              <span class="album-count"
                >{album.track_count} track{album.track_count !== 1 ? 's' : ''}</span
              >
            </div>
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .album-list-view {
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

  .album-scroll {
    flex: 1;
    overflow-y: auto;
  }

  .album-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 16px;
    padding-bottom: 16px;
  }

  .album-card {
    display: flex;
    flex-direction: column;
    background: transparent;
    border: none;
    border-radius: 8px;
    padding: 8px;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s;
    color: #eee;
  }

  .album-card:hover {
    background: rgb(233 69 96 / 10%);
  }

  .album-cover {
    width: 100%;
    aspect-ratio: 1;
    border-radius: 6px;
    overflow: hidden;
    background: #2a2a4a;
    margin-bottom: 8px;
  }

  .album-cover img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .cover-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #555;
  }

  .album-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .album-name {
    font-size: 13px;
    font-weight: 600;
    color: #eee;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .album-artist {
    font-size: 12px;
    color: #aaa;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .album-count {
    font-size: 11px;
    color: #666;
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
