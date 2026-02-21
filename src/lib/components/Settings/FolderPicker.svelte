<script lang="ts">
  import { open } from '@tauri-apps/plugin-dialog';
  import * as libraryApi from '$lib/api/library';
  import { getLibraryState } from '$lib/state/libraryState.svelte';
  import { notifyCritical } from '$lib/logic/error-handler';

  const library = getLibraryState();

  async function pickFolder() {
    try {
      const selected = await open({ directory: true });
      if (selected && typeof selected === 'string') {
        library.isScanning = true;
        try {
          await libraryApi.scanFolder(selected);
          // Refresh the full library after scan
          const allTracks = await libraryApi.getAllTracks();
          library.allTracks = allTracks;
        } finally {
          library.isScanning = false;
        }
      }
    } catch (err) {
      notifyCritical('Scan folder', err);
      library.isScanning = false;
    }
  }
</script>

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

<style>
  .folder-btn {
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

  .folder-btn:hover:not(:disabled) {
    border-color: #e94560;
    color: #e94560;
  }

  .folder-btn:disabled {
    opacity: 0.6;
    cursor: default;
  }
</style>
