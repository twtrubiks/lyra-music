<script lang="ts">
  import { open } from '@tauri-apps/plugin-dialog';
  import * as libraryApi from '$lib/api/library';
  import { getLibraryState } from '$lib/state/libraryState.svelte';
  import { notifyCritical, notifyImportResult } from '$lib/logic/error-handler';
  import { pushError } from '$lib/state/errorState.svelte';

  const library = getLibraryState();

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
