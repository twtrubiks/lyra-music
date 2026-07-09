<script lang="ts">
  import * as libraryApi from '$lib/api/library';
  import { notifyCritical } from '$lib/logic/error-handler';
  import type { WatchedFolder } from '$lib/types';

  let { onclose }: { onclose: () => void } = $props();

  let folders = $state<WatchedFolder[]>([]);
  let loading = $state(true);
  let removingPath = $state<string | null>(null);

  async function load() {
    try {
      folders = await libraryApi.getWatchedFolders();
    } catch (err) {
      notifyCritical('Load watched folders', err);
    } finally {
      loading = false;
    }
  }

  async function removeFolder(path: string) {
    removingPath = path;
    try {
      await libraryApi.stopWatching(path);
      folders = folders.filter((f) => f.path !== path);
    } catch (err) {
      notifyCritical('Stop watching folder', err);
    } finally {
      removingPath = null;
    }
  }

  void load();

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onclose();
    }
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) onclose();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="backdrop" onclick={handleBackdropClick}>
  <div class="dialog" role="dialog" aria-label="Watched folders">
    <div class="dialog-header">
      <h3>監控資料夾</h3>
      <button class="close-btn" onclick={onclose} aria-label="Close">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
          <path
            d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
          />
        </svg>
      </button>
    </div>

    <div class="dialog-body">
      {#if loading}
        <p class="hint">載入中...</p>
      {:else if folders.length === 0}
        <p class="hint">尚未加入任何監控資料夾</p>
      {:else}
        <ul class="folder-list">
          {#each folders as folder (folder.path)}
            <li class="folder-row">
              {#if !folder.exists}
                <span class="missing-icon" title="資料夾不存在（可能已刪除或未掛載）">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                    <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
                  </svg>
                </span>
              {/if}
              <span class="folder-path" class:missing={!folder.exists} title={folder.path}>
                {folder.path}
              </span>
              <button
                class="remove-btn"
                onclick={() => removeFolder(folder.path)}
                disabled={removingPath === folder.path}
              >
                移除
              </button>
            </li>
          {/each}
        </ul>
      {/if}
      <p class="note">移除只會停止監控該資料夾，已匯入的音樂不受影響。</p>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 2000;
    background: rgb(0 0 0 / 60%);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .dialog {
    background: #1e1e3a;
    border: 1px solid #3a3a5a;
    border-radius: 10px;
    width: 480px;
    max-width: 90vw;
    max-height: 70vh;
    overflow-y: auto;
    box-shadow: 0 16px 48px rgb(0 0 0 / 60%);
  }

  .dialog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px 12px;
    border-bottom: 1px solid #2a2a4a;
  }

  .dialog-header h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: #eee;
  }

  .close-btn {
    background: transparent;
    border: none;
    color: #888;
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    transition:
      color 0.15s,
      background 0.15s;
  }

  .close-btn:hover {
    color: #eee;
    background: rgb(255 255 255 / 10%);
  }

  .dialog-body {
    padding: 16px 20px;
  }

  .hint {
    margin: 8px 0;
    font-size: 13px;
    color: #888;
    text-align: center;
  }

  .folder-list {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .folder-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 4px;
    transition: background 0.1s;
  }

  .folder-row:hover {
    background: rgb(255 255 255 / 4%);
  }

  .missing-icon {
    display: flex;
    align-items: center;
    color: #e9a545;
    flex-shrink: 0;
  }

  .folder-path {
    flex: 1;
    min-width: 0;
    font-size: 13px;
    color: #ddd;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .folder-path.missing {
    color: #888;
  }

  .remove-btn {
    flex-shrink: 0;
    padding: 4px 10px;
    background: transparent;
    border: 1px solid #3a3a5a;
    border-radius: 4px;
    color: #888;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .remove-btn:hover:not(:disabled) {
    border-color: #e94560;
    color: #e94560;
  }

  .remove-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .note {
    margin: 12px 0 0;
    font-size: 12px;
    color: #666;
  }
</style>
