<script lang="ts">
  import Sidebar from '$lib/components/Sidebar/Sidebar.svelte';
  import LibraryView from '$lib/components/Library/LibraryView.svelte';
  import PlaylistPanel from '$lib/components/Playlist/PlaylistPanel.svelte';
  import PlayerBar from '$lib/components/Player/PlayerBar.svelte';
  import ArtistListView from '$lib/components/Browse/ArtistListView.svelte';
  import ArtistDetailView from '$lib/components/Browse/ArtistDetailView.svelte';
  import AlbumListView from '$lib/components/Browse/AlbumListView.svelte';
  import AlbumDetailView from '$lib/components/Browse/AlbumDetailView.svelte';
  import MostPlayedView from '$lib/components/Browse/MostPlayedView.svelte';
  import { getPlaylistState } from '$lib/state/playlistState.svelte';
  import { getPlayerState } from '$lib/state/playerState.svelte';
  import ErrorNotification from '$lib/components/ErrorNotification.svelte';
  import KeyboardShortcutsDialog from '$lib/components/Help/KeyboardShortcutsDialog.svelte';
  import { mapKeyToAction } from '$lib/logic/keyboard';
  import { warnNonCritical, notifyCritical, notifyImportResult } from '$lib/logic/error-handler';
  import { pushError } from '$lib/state/errorState.svelte';
  import * as playbackApi from '$lib/api/playback';
  import * as libraryApi from '$lib/api/library';
  import { getCurrentWebview } from '@tauri-apps/api/webview';
  import { getLibraryState } from '$lib/state/libraryState.svelte';
  import {
    handleNext,
    handlePrev,
    toggleShuffle,
    cycleRepeat,
    handleTracksRemovedBatch,
  } from '$lib/logic/playback-actions';
  import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
  import { listen } from '@tauri-apps/api/event';

  const playlistState = getPlaylistState();
  const player = getPlayerState();
  const library = getLibraryState();

  let showShortcutsDialog = $state(false);
  let isDragOver = $state(false);
  let draggedPathCount = $state(0);
  let tauriDragDropActive = $state(false);

  async function importDroppedPaths(paths: string[]) {
    if (library.isScanning || paths.length === 0) return;
    library.isScanning = true;
    try {
      const result = await libraryApi.importPaths(paths);
      library.allTracks = await libraryApi.getAllTracks();
      notifyImportResult(result);
    } catch (err) {
      notifyCritical('Import dropped files', err);
    } finally {
      library.isScanning = false;
    }
  }

  $effect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        unlisten = await getCurrentWebview().onDragDropEvent(async (event) => {
          const { payload } = event;
          tauriDragDropActive = true;
          if (payload.type === 'enter') {
            isDragOver = true;
            draggedPathCount = payload.paths.length;
          } else if (payload.type === 'over') {
            isDragOver = true;
          } else if (payload.type === 'drop') {
            isDragOver = false;
            draggedPathCount = 0;
            if (payload.paths.length === 0) {
              console.warn('[lyra] Drop event received but paths array is empty');
              pushError('Drop event received but no file paths were provided', 'warn');
              return;
            }
            await importDroppedPaths(payload.paths);
          } else {
            isDragOver = false;
            draggedPathCount = 0;
          }
        });
      } catch (err) {
        console.warn('[lyra] Tauri onDragDropEvent not available, using HTML5 fallback:', err);
      }
    })();
    return () => {
      unlisten?.();
    };
  });

  const NORMAL_SIZE = { width: 1024, height: 680 };
  const MINI_SIZE = { width: 420, height: 80 };

  async function syncWindowToMiniMode(mini: boolean) {
    try {
      const win = getCurrentWindow();
      if (mini) {
        const size = await win.innerSize();
        NORMAL_SIZE.width = size.width;
        NORMAL_SIZE.height = size.height;
        await win.setSize(new LogicalSize(MINI_SIZE.width, MINI_SIZE.height));
        await win.setAlwaysOnTop(true);
      } else {
        await win.setAlwaysOnTop(false);
        await win.setSize(new LogicalSize(NORMAL_SIZE.width, NORMAL_SIZE.height));
      }
    } catch {
      // Window API not available (dev mode)
    }
  }

  // Sync Tauri window size whenever miniMode changes (from keyboard, button, etc.)
  let prevMiniMode = player.miniMode;
  $effect(() => {
    const current = player.miniMode;
    if (current !== prevMiniMode) {
      prevMiniMode = current;
      syncWindowToMiniMode(current);
    }
  });

  // System tray: close-to-tray + tray event listeners
  $effect(() => {
    let unlistenClose: (() => void) | undefined;
    let unlistenPrev: (() => void) | undefined;
    let unlistenNext: (() => void) | undefined;

    (async () => {
      try {
        const win = getCurrentWindow();
        unlistenClose = await win.onCloseRequested(async (event) => {
          event.preventDefault();
          await win.hide();
        });
        unlistenPrev = await listen('tray-prev', () => {
          handlePrev();
        });
        unlistenNext = await listen('tray-next', () => {
          handleNext();
        });
      } catch {
        // Window API not available (dev mode or test)
      }
    })();

    return () => {
      unlistenClose?.();
      unlistenPrev?.();
      unlistenNext?.();
    };
  });

  // Auto-refresh library on backend file-watcher changes
  $effect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        unlisten = await listen('library-changed', async () => {
          try {
            library.allTracks = await libraryApi.getAllTracks();
          } catch (err) {
            warnNonCritical('Auto-refresh library', err);
          }
        });
      } catch (err) {
        warnNonCritical('Listen library-changed', err);
      }
    })();
    return () => {
      unlisten?.();
    };
  });

  // Handle tracks removed by watcher (file deleted from disk)
  $effect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        unlisten = await listen<number[]>('tracks-removed', async (event) => {
          await handleTracksRemovedBatch(new Set(event.payload));
        });
      } catch (err) {
        warnNonCritical('Listen tracks-removed', err);
      }
    })();
    return () => {
      unlisten?.();
    };
  });

  // HTML5 drag-drop fallback (for Linux/WebKitGTK where Tauri native events may not fire)
  function handleHtml5DragOver(e: DragEvent) {
    if (tauriDragDropActive) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    isDragOver = true;
  }

  function handleHtml5DragLeave(e: DragEvent) {
    if (tauriDragDropActive) return;
    if (e.relatedTarget && (e.currentTarget as Node)?.contains(e.relatedTarget as Node)) return;
    isDragOver = false;
  }

  async function handleHtml5Drop(e: DragEvent) {
    if (tauriDragDropActive) return;
    e.preventDefault();
    isDragOver = false;

    const uriList = e.dataTransfer?.getData('text/uri-list') ?? '';

    const paths = uriList
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('file://'))
      .map((uri) => decodeURIComponent(new URL(uri).pathname));

    if (paths.length > 0) {
      await importDroppedPaths(paths);
    } else {
      console.warn('[lyra] HTML5 drop: no file:// URIs found in dataTransfer');
      pushError('Could not read dropped file paths. Try using Scan Folder instead.', 'warn');
    }
  }

  function handleGlobalKeydown(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    const action = mapKeyToAction(e);
    if (!action) return;

    // Dialog 開啟時，只處理 show-shortcuts（toggle 關閉），其他快捷鍵不攔截
    if (showShortcutsDialog && action !== 'show-shortcuts') return;

    e.preventDefault();

    switch (action) {
      case 'show-shortcuts':
        showShortcutsDialog = !showShortcutsDialog;
        break;
      case 'play-pause':
        if (!player.currentTrack) return;
        if (player.isPlaying) {
          playbackApi
            .pause()
            .then(() => {
              player.isPlaying = false;
            })
            .catch((err) => warnNonCritical('Pause', err));
        } else {
          playbackApi
            .resume()
            .then(() => {
              player.isPlaying = true;
            })
            .catch((err) => warnNonCritical('Resume', err));
        }
        break;
      case 'seek-back':
        if (!player.currentTrack) return;
        {
          const newPos = Math.max(0, player.positionSecs - 5);
          player.positionSecs = newPos;
          playbackApi.seek(newPos).catch((err) => warnNonCritical('Seek', err));
        }
        break;
      case 'seek-forward':
        if (!player.currentTrack) return;
        {
          const newPos = Math.min(player.durationSecs, player.positionSecs + 5);
          player.positionSecs = newPos;
          playbackApi.seek(newPos).catch((err) => warnNonCritical('Seek', err));
        }
        break;
      case 'vol-up':
        {
          const newVol = Math.min(1, player.volume + 0.05);
          player.volume = newVol;
          playbackApi.setVolume(newVol).catch((err) => warnNonCritical('Set volume', err));
        }
        break;
      case 'vol-down':
        {
          const newVol = Math.max(0, player.volume - 0.05);
          player.volume = newVol;
          playbackApi.setVolume(newVol).catch((err) => warnNonCritical('Set volume', err));
        }
        break;
      case 'next':
        handleNext();
        break;
      case 'prev':
        handlePrev();
        break;
      case 'shuffle':
        toggleShuffle();
        break;
      case 'repeat':
        cycleRepeat();
        break;
      case 'mini-toggle':
        player.miniMode = !player.miniMode;
        break;
      case 'mini-exit':
        player.miniMode = false;
        break;
      case 'focus-search':
        (document.querySelector('.search-box input') as HTMLElement)?.focus();
        break;
    }
  }
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

<div
  class="app-layout"
  class:mini={player.miniMode}
  role="application"
  ondragover={handleHtml5DragOver}
  ondragleave={handleHtml5DragLeave}
  ondrop={handleHtml5Drop}
>
  <div class="sidebar-area">
    <Sidebar onshowshortcuts={() => (showShortcutsDialog = true)} />
  </div>

  <div class="main-area">
    {#if playlistState.activeView.kind === 'library'}
      <LibraryView />
    {:else if playlistState.activeView.kind === 'artists'}
      <ArtistListView />
    {:else if playlistState.activeView.kind === 'artist-detail'}
      <ArtistDetailView artistName={playlistState.activeView.artistName} />
    {:else if playlistState.activeView.kind === 'albums'}
      <AlbumListView />
    {:else if playlistState.activeView.kind === 'album-detail'}
      <AlbumDetailView
        albumName={playlistState.activeView.albumName}
        artistName={playlistState.activeView.artistName}
      />
    {:else if playlistState.activeView.kind === 'most-played'}
      <MostPlayedView />
    {:else}
      <PlaylistPanel />
    {/if}
  </div>

  <div class="player-area">
    <PlayerBar />
  </div>

  {#if isDragOver}
    <div class="drop-overlay">
      <div class="drop-overlay-content">
        <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor">
          <path
            d="M19.35 10.04A7.49 7.49 0 0012 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 000 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"
          />
        </svg>
        <p class="drop-title">拖放以匯入</p>
        <p class="drop-hint">
          {#if draggedPathCount === 1}1 個項目{:else}{draggedPathCount} 個項目{/if}
        </p>
      </div>
    </div>
  {/if}

  <ErrorNotification />

  {#if showShortcutsDialog}
    <KeyboardShortcutsDialog onclose={() => (showShortcutsDialog = false)} />
  {/if}
</div>

<style>
  :global(*) {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  :global(body) {
    margin: 0;
    padding: 0;
    background-color: #1a1a2e;
    color: #eee;
    font-family:
      -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
    overflow: hidden;
  }

  :global(#app) {
    width: 100vw;
    height: 100vh;
    max-width: none;
    margin: 0;
    padding: 0;
    text-align: left;
  }

  .app-layout {
    display: grid;
    grid-template: 'sidebar main' 1fr 'player  player' 80px / 220px 1fr;
    width: 100vw;
    height: 100vh;
  }

  .sidebar-area {
    grid-area: sidebar;
    overflow: hidden;
  }

  .main-area {
    grid-area: main;
    overflow: hidden;
  }

  .player-area {
    grid-area: player;
  }

  .app-layout.mini {
    grid-template: 'player' 1fr / 1fr;
  }

  .app-layout.mini .sidebar-area,
  .app-layout.mini .main-area {
    display: none;
  }

  .app-layout.mini .player-area {
    height: 100vh;
  }

  .drop-overlay {
    position: fixed;
    inset: 0;
    z-index: 900;
    background: rgb(15 15 35 / 85%);
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    animation: fade-in 0.15s ease-out;
  }

  .drop-overlay-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 48px;
    border: 2px dashed #e94560;
    border-radius: 16px;
    color: #e94560;
  }

  .drop-title {
    font-size: 20px;
    font-weight: 700;
    color: #eee;
  }

  .drop-hint {
    font-size: 14px;
    color: #888;
  }

  @keyframes fade-in {
    from {
      opacity: 0;
    }

    to {
      opacity: 1;
    }
  }
</style>
