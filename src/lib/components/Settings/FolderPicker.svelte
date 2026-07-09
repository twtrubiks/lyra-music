<script lang="ts">
  import { open } from '@tauri-apps/plugin-dialog';
  import * as libraryApi from '$lib/api/library';
  import { getLibraryState } from '$lib/state/libraryState.svelte';
  import { notifyCritical, notifyImportResult } from '$lib/logic/error-handler';
  import { pushError } from '$lib/state/errorState.svelte';
  import WatchedFoldersDialog from './WatchedFoldersDialog.svelte';

  const library = getLibraryState();

  let showWatchedFolders = $state(false);

  async function pickFolder() {
    try {
      const selected = await open({ directory: true });

      const raw = Array.isArray(selected) ? selected[0] : selected;
      const folderPath = raw ? String(raw) : null;

      if (folderPath) {
        library.isScanning = true;
        try {
          const result = await libraryApi.scanFolder(folderPath);
          library.allTracks = await libraryApi.getAllTracks();
          notifyImportResult(result);
        } finally {
          library.isScanning = false;
        }
      } else if (selected !== null) {
        console.warn('[lyra] Unexpected dialog result:', selected);
        pushError('Folder selection returned an unexpected value', 'warn');
      }
    } catch (err) {
      notifyCritical('Scan folder', err);
      library.isScanning = false;
    }
  }
</script>

<div class="folder-actions">
  <button class="folder-btn" onclick={pickFolder} disabled={library.isScanning}>
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path
        d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"
      />
    </svg>
    {#if library.isScanning}
      Scanning...
    {:else}
      Scan Folder
    {/if}
  </button>
  <button
    class="manage-btn"
    onclick={() => (showWatchedFolders = true)}
    title="管理監控資料夾"
    aria-label="管理監控資料夾"
  >
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path
        d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"
      />
    </svg>
  </button>
</div>

{#if showWatchedFolders}
  <WatchedFoldersDialog onclose={() => (showWatchedFolders = false)} />
{/if}

<style>
  .folder-actions {
    display: flex;
    gap: 6px;
  }

  .folder-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    min-width: 0;
    padding: 10px 16px;
    background: transparent;
    border: 1px dashed #2a2a4a;
    border-radius: 6px;
    color: #888;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .folder-btn:hover:not(:disabled) {
    border-color: #e94560;
    color: #e94560;
  }

  .folder-btn:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .manage-btn {
    display: flex;
    align-items: center;
    padding: 10px;
    background: transparent;
    border: 1px solid #2a2a4a;
    border-radius: 6px;
    color: #888;
    cursor: pointer;
    transition: all 0.2s;
  }

  .manage-btn:hover {
    border-color: #e94560;
    color: #e94560;
  }
</style>
