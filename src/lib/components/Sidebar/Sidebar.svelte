<script lang="ts">
  import FolderPicker from '../Settings/FolderPicker.svelte';
  import { getPlaylistState } from '$lib/state/playlistState.svelte';
  import * as playlistApi from '$lib/api/playlist';
  import { notifyCritical, warnNonCritical } from '$lib/logic/error-handler';
  import { moveByKeyboard } from '$lib/logic/reorder';
  import { tick, untrack } from 'svelte';

  let { onshowshortcuts }: { onshowshortcuts?: () => void } = $props();

  const playlistState = getPlaylistState();

  let newPlaylistName = $state('');
  let showNewInput = $state(false);
  let dragOverPlaylistId = $state<number | null>(null);
  let editingPlaylistId = $state<number | null>(null);
  let editingName = $state('');

  // Context menu state
  let showPlaylistMenu = $state(false);
  let menuX = $state(0);
  let menuY = $state(0);
  let contextPlaylistId = $state<number | null>(null);

  let canMoveUp = $derived(
    contextPlaylistId !== null &&
      playlistState.playlists.length > 1 &&
      playlistState.playlists[0]?.id !== contextPlaylistId,
  );
  let canMoveDown = $derived(
    contextPlaylistId !== null &&
      playlistState.playlists.length > 1 &&
      playlistState.playlists[playlistState.playlists.length - 1]?.id !== contextPlaylistId,
  );

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

  async function startRename(pl: { id: number; name: string }) {
    editingPlaylistId = pl.id;
    editingName = pl.name;
    await tick();
    document.querySelector<HTMLInputElement>('.rename-input input')?.focus();
  }

  async function commitRename() {
    if (editingPlaylistId === null) return;
    const trimmed = editingName.trim();
    if (!trimmed) {
      cancelRename();
      return;
    }
    try {
      await playlistApi.renamePlaylist(editingPlaylistId, trimmed);
      const lists = await playlistApi.getAllPlaylists();
      playlistState.playlists = lists;
    } catch (err) {
      notifyCritical('Rename playlist', err);
    }
    cancelRename();
  }

  function cancelRename() {
    editingPlaylistId = null;
    editingName = '';
  }

  function handleRenameKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') commitRename();
    if (e.key === 'Escape') cancelRename();
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

  // Context menu handlers
  function handlePlaylistContextMenu(e: MouseEvent, playlistId: number) {
    e.preventDefault();
    contextPlaylistId = playlistId;
    menuX = e.clientX;
    menuY = e.clientY;
    showPlaylistMenu = true;
  }

  function closePlaylistMenu() {
    showPlaylistMenu = false;
  }

  function handleWindowClick(e: MouseEvent) {
    if (showPlaylistMenu) {
      const target = e.target as HTMLElement;
      if (!target.closest('.context-menu')) {
        closePlaylistMenu();
      }
    }
  }

  async function movePlaylist(playlistId: number, direction: 'up' | 'down') {
    const playlists = playlistState.playlists;
    const newOrder = moveByKeyboard(playlists, new Set([playlistId]), direction);
    if (!newOrder) return;
    // Optimistic update
    const map = new Map(playlists.map((p) => [p.id, p]));
    playlistState.playlists = newOrder.map((id) => map.get(id)!);
    try {
      await playlistApi.reorderPlaylists(newOrder);
    } catch (err) {
      warnNonCritical('Reorder playlists', err);
      const lists = await playlistApi.getAllPlaylists();
      playlistState.playlists = lists;
    }
  }

  function handleMenuMoveUp() {
    if (contextPlaylistId !== null && canMoveUp) {
      movePlaylist(contextPlaylistId, 'up');
    }
    closePlaylistMenu();
  }

  function handleMenuMoveDown() {
    if (contextPlaylistId !== null && canMoveDown) {
      movePlaylist(contextPlaylistId, 'down');
    }
    closePlaylistMenu();
  }

  function handleMenuRename() {
    if (contextPlaylistId !== null) {
      const pl = playlistState.playlists.find((p) => p.id === contextPlaylistId);
      if (pl) startRename(pl);
    }
    closePlaylistMenu();
  }

  function handleMenuDelete() {
    if (contextPlaylistId !== null) {
      handleDeletePlaylist(contextPlaylistId);
    }
    closePlaylistMenu();
  }

  function handleWindowKeydown(e: KeyboardEvent) {
    if (
      e.ctrlKey &&
      e.shiftKey &&
      (e.key === 'ArrowUp' || e.key === 'ArrowDown') &&
      playlistState.activeView.kind === 'playlist'
    ) {
      e.preventDefault();
      const direction = e.key === 'ArrowUp' ? 'up' : 'down';
      movePlaylist(playlistState.activeView.playlistId, direction);
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
    untrack(() => {
      (async () => {
        try {
          const lists = await playlistApi.getAllPlaylists();
          playlistState.playlists = lists;
        } catch (err) {
          notifyCritical('Load playlists', err);
        }
      })();
    });
  });
</script>

<svelte:window onclick={handleWindowClick} onkeydown={handleWindowKeydown} />

<aside class="sidebar">
  <div class="brand">
    <svg viewBox="-54 -52 108 120" width="22" height="22" fill="none" aria-hidden="true">
      <rect x="-26" y="52" width="52" height="9" rx="4.5" fill="#e2603a" />
      <line
        x1="-27"
        y1="2"
        x2="-20"
        y2="51"
        stroke="#e2603a"
        stroke-width="4"
        stroke-linecap="round"
        opacity="0.5"
      />
      <line
        x1="-13"
        y1="-14"
        x2="-10"
        y2="51"
        stroke="#e2603a"
        stroke-width="4"
        stroke-linecap="round"
        opacity="0.5"
      />
      <line
        x1="13"
        y1="-14"
        x2="10"
        y2="51"
        stroke="#e2603a"
        stroke-width="4"
        stroke-linecap="round"
        opacity="0.5"
      />
      <line
        x1="27"
        y1="2"
        x2="20"
        y2="51"
        stroke="#e2603a"
        stroke-width="4"
        stroke-linecap="round"
        opacity="0.5"
      />
      <path d="M -8,2 L 15,20 L -8,38 Z" fill="#e2603a" />
      <path
        d="M -18,55 C -40,55 -44,28 -41,4 C -38,-18 -28,-33 -16,-41"
        fill="none"
        stroke="#e2603a"
        stroke-width="7.5"
        stroke-linecap="round"
      />
      <path
        d="M 18,55 C 40,55 44,28 41,4 C 38,-18 28,-33 16,-41"
        fill="none"
        stroke="#e2603a"
        stroke-width="7.5"
        stroke-linecap="round"
      />
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
        oncontextmenu={(e) => handlePlaylistContextMenu(e, pl.id)}
      >
        {#if editingPlaylistId === pl.id}
          <div class="rename-input">
            <input
              type="text"
              bind:value={editingName}
              onkeydown={handleRenameKeydown}
              onblur={commitRename}
            />
          </div>
        {:else}
          <button
            class="nav-item playlist-btn"
            onclick={() => goToPlaylist(pl.id)}
            ondblclick={() => startRename(pl)}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path
                d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"
              />
            </svg>
            {pl.name}
          </button>
        {/if}
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

  {#if showPlaylistMenu}
    <div class="context-menu" style="left: {menuX}px; top: {menuY}px;" role="menu">
      <button
        class="menu-item"
        class:menu-item-disabled={!canMoveUp}
        role="menuitem"
        onclick={handleMenuMoveUp}
      >
        ▲ 上移 <span class="shortcut">Ctrl+Shift+↑</span>
      </button>
      <button
        class="menu-item"
        class:menu-item-disabled={!canMoveDown}
        role="menuitem"
        onclick={handleMenuMoveDown}
      >
        ▼ 下移 <span class="shortcut">Ctrl+Shift+↓</span>
      </button>
      <div class="menu-divider"></div>
      <button class="menu-item" role="menuitem" onclick={handleMenuRename}>重新命名</button>
      <button class="menu-item menu-item-danger" role="menuitem" onclick={handleMenuDelete}
        >刪除</button
      >
    </div>
  {/if}

  <div class="bottom-actions">
    {#if onshowshortcuts}
      <button class="shortcuts-btn" onclick={onshowshortcuts}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path
            d="M20 5H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm-9 3h2v2h-2V8zm0 3h2v2h-2v-2zM8 8h2v2H8V8zm0 3h2v2H8v-2zm-1 2H5v-2h2v2zm0-3H5V8h2v2zm9 7H8v-2h8v2zm0-4h-2v-2h2v2zm0-3h-2V8h2v2zm3 3h-2v-2h2v2zm0-3h-2V8h2v2z"
          />
        </svg>
        快捷鍵
      </button>
    {/if}
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
    color: #e2603a;
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
    background: rgb(226 96 58 / 10%);
    color: #eee;
  }

  .nav-item.active {
    background: rgb(226 96 58 / 15%);
    color: #e2603a;
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
    border-color: #e2603a;
    color: #e2603a;
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
    border-color: #e2603a;
  }

  .confirm-btn {
    padding: 4px 8px;
    background: #e2603a;
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
    background: rgb(226 96 58 / 15%);
    color: #e2603a;
  }

  .playlist-item.drag-over {
    background: rgb(226 96 58 / 25%);
    outline: 2px dashed #e2603a;
    outline-offset: -2px;
  }

  .playlist-btn {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .rename-input {
    flex: 1;
    min-width: 0;
    padding: 4px 8px 4px 16px;
  }

  .rename-input input {
    width: 100%;
    background: #16213e;
    border: 1px solid #e2603a;
    border-radius: 4px;
    padding: 4px 8px;
    color: #eee;
    font-size: 13px;
    outline: none;
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
    color: #e2603a;
  }

  .bottom-actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 16px;
    margin-top: auto;
  }

  .shortcuts-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 10px 16px;
    background: transparent;
    border: 1px dashed #2a2a4a;
    border-radius: 6px;
    color: #888;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .shortcuts-btn:hover {
    border-color: #e2603a;
    color: #e2603a;
  }

  .context-menu {
    position: fixed;
    z-index: 1000;
    background: #1e1e3a;
    border: 1px solid #3a3a5a;
    border-radius: 6px;
    padding: 4px 0;
    min-width: 180px;
    box-shadow: 0 8px 24px rgb(0 0 0 / 50%);
  }

  .menu-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 7px 12px;
    background: transparent;
    border: none;
    color: #ddd;
    font-size: 13px;
    cursor: pointer;
    text-align: left;
    transition: background 0.1s;
  }

  .menu-item:hover {
    background: rgb(226 96 58 / 20%);
    color: #fff;
  }

  .menu-item-danger {
    color: #e2603a;
  }

  .menu-item-danger:hover {
    background: rgb(226 96 58 / 30%);
    color: #ff6b84;
  }

  .menu-item-disabled {
    color: #555;
    cursor: default;
  }

  .menu-item-disabled:hover {
    background: transparent;
    color: #555;
  }

  .menu-divider {
    height: 1px;
    background: #3a3a5a;
    margin: 4px 0;
  }

  .shortcut {
    margin-left: auto;
    color: #666;
    font-size: 11px;
  }
</style>
