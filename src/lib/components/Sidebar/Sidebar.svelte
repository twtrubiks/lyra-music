<script lang="ts">
  import FolderPicker from '../Settings/FolderPicker.svelte';
  import { getPlaylistState } from '$lib/state/playlistState.svelte';
  import * as playlistApi from '$lib/api/playlist';
  import { notifyCritical, warnNonCritical } from '$lib/logic/error-handler';

  const playlistState = getPlaylistState();

  let newPlaylistName = $state('');
  let showNewInput = $state(false);
  let dragOverPlaylistId = $state<number | null>(null);

  function goToLibrary() {
    playlistState.activeView = { kind: 'library' };
  }

  function goToPlaylist(playlistId: number) {
    playlistState.activeView = { kind: 'playlist', playlistId };
  }

  function goToArtists() {
    playlistState.activeView = { kind: 'artists' };
  }

  function goToAlbums() {
    playlistState.activeView = { kind: 'albums' };
  }

  function goToMostPlayed() {
    playlistState.activeView = { kind: 'most-played' };
  }

  async function createNewPlaylist() {
    const name = newPlaylistName.trim();
    if (!name) return;
    try {
      await playlistApi.createPlaylist(name);
      const lists = await playlistApi.getAllPlaylists();
      playlistState.playlists = lists;
    } catch (err) {
      notifyCritical('Create playlist', err);
    }
    newPlaylistName = '';
    showNewInput = false;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') createNewPlaylist();
    if (e.key === 'Escape') {
      showNewInput = false;
      newPlaylistName = '';
    }
  }

  async function handleDeletePlaylist(id: number) {
    try {
      await playlistApi.deletePlaylist(id);
      const lists = await playlistApi.getAllPlaylists();
      playlistState.playlists = lists;
      if (
        playlistState.activeView.kind === 'playlist' &&
        playlistState.activeView.playlistId === id
      ) {
        playlistState.activeView = { kind: 'library' };
      }
    } catch (err) {
      notifyCritical('Delete playlist', err);
    }
  }

  // Drag-and-drop: add track to playlist
  function handleDragOver(e: DragEvent, playlistId: number) {
    if (!e.dataTransfer?.types.includes('application/x-track-id')) return;
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'copy';
    dragOverPlaylistId = playlistId;
  }

  function handleDragLeave() {
    dragOverPlaylistId = null;
  }

  async function handleDrop(e: DragEvent, playlistId: number) {
    e.preventDefault();
    dragOverPlaylistId = null;
    const trackIdStr = e.dataTransfer?.getData('application/x-track-id');
    if (!trackIdStr) return;
    const trackId = parseInt(trackIdStr, 10);
    if (isNaN(trackId)) return;
    try {
      await playlistApi.addToPlaylist(playlistId, trackId);
    } catch (err) {
      warnNonCritical('Add track to playlist', err);
    }
  }

  // Load playlists on mount
  $effect(() => {
    (async () => {
      try {
        const lists = await playlistApi.getAllPlaylists();
        playlistState.playlists = lists;
      } catch (err) {
        notifyCritical('Load playlists', err);
      }
    })();
  });
</script>

<aside class="sidebar">
  <div class="brand">
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
      <g stroke="#e94560" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <line x1="6.5" y1="4.5" x2="17.5" y2="4.5" />
        <path d="M6.5,4.5 C5.5,9 8,15 9.5,18.5" />
        <path d="M17.5,4.5 C18.5,9 16,15 14.5,18.5" />
        <path d="M9.5,18.5 Q12,21.5 14.5,18.5" />
      </g>
      <circle cx="12" cy="8.5" r="1.5" fill="#ff6b81" />
      <circle cx="12" cy="12" r="1.2" fill="#ff6b81" />
      <circle cx="12" cy="15.5" r="1.2" fill="#ff6b81" />
    </svg>
    <span class="brand-name">Lyra Music</span>
  </div>

  <nav class="nav">
    <button
      class="nav-item"
      class:active={playlistState.activeView.kind === 'library'}
      onclick={goToLibrary}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
        <path
          d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9h-4v4h-2v-4H9V9h4V5h2v4h4v2z"
        />
      </svg>
      All Music
    </button>
    <button
      class="nav-item"
      class:active={playlistState.activeView.kind === 'artists' ||
        playlistState.activeView.kind === 'artist-detail'}
      onclick={goToArtists}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
        <path
          d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
        />
      </svg>
      Artists
    </button>
    <button
      class="nav-item"
      class:active={playlistState.activeView.kind === 'albums' ||
        playlistState.activeView.kind === 'album-detail'}
      onclick={goToAlbums}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
        <path
          d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-5.5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z"
        />
      </svg>
      Albums
    </button>
    <button
      class="nav-item"
      class:active={playlistState.activeView.kind === 'most-played'}
      onclick={goToMostPlayed}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
        <path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z" />
      </svg>
      Most Played
    </button>
  </nav>

  <div class="section-label">
    <span>Playlists</span>
    <button class="add-btn" onclick={() => (showNewInput = true)} title="New playlist">+</button>
  </div>

  {#if showNewInput}
    <div class="new-playlist-input">
      <input
        type="text"
        placeholder="Playlist name..."
        bind:value={newPlaylistName}
        onkeydown={handleKeydown}
      />
      <button class="confirm-btn" onclick={createNewPlaylist}>OK</button>
    </div>
  {/if}

  <div class="playlist-list">
    {#each playlistState.playlists as pl (pl.id)}
      <div
        class="playlist-item"
        role="listitem"
        class:active={playlistState.activeView.kind === 'playlist' &&
          playlistState.activeView.playlistId === pl.id}
        class:drag-over={dragOverPlaylistId === pl.id}
        ondragover={(e) => handleDragOver(e, pl.id)}
        ondragleave={handleDragLeave}
        ondrop={(e) => handleDrop(e, pl.id)}
      >
        <button class="nav-item playlist-btn" onclick={() => goToPlaylist(pl.id)}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path
              d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"
            />
          </svg>
          {pl.name}
        </button>
        <button
          class="delete-btn"
          onclick={() => handleDeletePlaylist(pl.id)}
          title="Delete playlist"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
            <path
              d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
            />
          </svg>
        </button>
      </div>
    {/each}
  </div>

  <div class="bottom-actions">
    <FolderPicker />
  </div>
</aside>

<style>
  .sidebar {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #0f0f23;
    border-right: 1px solid #2a2a4a;
    padding: 16px 0;
    overflow-y: auto;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 16px 20px;
  }

  .brand-name {
    font-size: 18px;
    font-weight: 700;
    color: #e94560;
  }

  .nav {
    margin-bottom: 8px;
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 8px 16px;
    background: transparent;
    border: none;
    color: #aaa;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.15s;
    text-align: left;
  }

  .nav-item:hover {
    background: rgb(233 69 96 / 10%);
    color: #eee;
  }

  .nav-item.active {
    background: rgb(233 69 96 / 15%);
    color: #e94560;
  }

  .section-label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px 8px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #555;
    font-weight: 600;
  }

  .add-btn {
    width: 22px;
    height: 22px;
    border-radius: 4px;
    border: 1px solid #333;
    background: transparent;
    color: #888;
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
  }

  .add-btn:hover {
    border-color: #e94560;
    color: #e94560;
  }

  .new-playlist-input {
    display: flex;
    gap: 4px;
    padding: 4px 12px;
  }

  .new-playlist-input input {
    flex: 1;
    background: #16213e;
    border: 1px solid #2a2a4a;
    border-radius: 4px;
    padding: 4px 8px;
    color: #eee;
    font-size: 13px;
    outline: none;
  }

  .new-playlist-input input:focus {
    border-color: #e94560;
  }

  .confirm-btn {
    padding: 4px 8px;
    background: #e94560;
    border: none;
    border-radius: 4px;
    color: #fff;
    font-size: 12px;
    cursor: pointer;
  }

  .playlist-list {
    flex: 1;
    overflow-y: auto;
  }

  .playlist-item {
    display: flex;
    align-items: center;
    transition:
      background 0.15s,
      outline 0.15s;
    border-radius: 4px;
    margin: 0 4px;
  }

  .playlist-item.active .playlist-btn {
    background: rgb(233 69 96 / 15%);
    color: #e94560;
  }

  .playlist-item.drag-over {
    background: rgb(233 69 96 / 25%);
    outline: 2px dashed #e94560;
    outline-offset: -2px;
  }

  .playlist-btn {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .delete-btn {
    width: 28px;
    height: 28px;
    border: none;
    background: transparent;
    color: #555;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    flex-shrink: 0;
    opacity: 0;
    transition: opacity 0.15s;
  }

  .playlist-item:hover .delete-btn {
    opacity: 1;
  }

  .delete-btn:hover {
    color: #e94560;
  }

  .bottom-actions {
    padding: 16px;
    margin-top: auto;
  }
</style>
