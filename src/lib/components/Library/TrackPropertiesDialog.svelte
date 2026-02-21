<script lang="ts">
  import type { TrackDetails } from '$lib/types';
  import { formatDuration, formatFileSize, formatSampleRate } from '$lib/logic/format';

  let {
    details,
    onclose,
    onsave,
  }: {
    details: TrackDetails;
    onclose: () => void;
    onsave?: (update: { title: string; artist: string; album: string }) => Promise<void>;
  } = $props();

  let isEditing = $state(false);
  let editTitle = $state('');
  let editArtist = $state('');
  let editAlbum = $state('');
  let isSaving = $state(false);

  function startEditing() {
    editTitle = details.title;
    editArtist = details.artist;
    editAlbum = details.album;
    isEditing = true;
  }

  function cancelEditing() {
    isEditing = false;
  }

  async function saveEditing() {
    if (!onsave || isSaving) return;
    isSaving = true;
    try {
      await onsave({ title: editTitle, artist: editArtist, album: editAlbum });
      isEditing = false;
    } finally {
      isSaving = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (isEditing) {
        cancelEditing();
      } else {
        onclose();
      }
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
  <div class="dialog" role="dialog" aria-label="Track properties">
    <div class="dialog-header">
      <h3>屬性</h3>
      <button class="close-btn" onclick={onclose} aria-label="Close">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
          <path
            d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
          />
        </svg>
      </button>
    </div>

    <div class="dialog-body">
      <div class="section">
        <div class="row">
          <span class="label">標題</span>
          {#if isEditing}
            <input class="edit-input" type="text" bind:value={editTitle} />
          {:else}
            <span class="value">{details.title}</span>
          {/if}
        </div>
        <div class="row">
          <span class="label">藝術家</span>
          {#if isEditing}
            <input class="edit-input" type="text" bind:value={editArtist} />
          {:else}
            <span class="value">{details.artist}</span>
          {/if}
        </div>
        <div class="row">
          <span class="label">專輯</span>
          {#if isEditing}
            <input class="edit-input" type="text" bind:value={editAlbum} />
          {:else}
            <span class="value">{details.album}</span>
          {/if}
        </div>
        <div class="row">
          <span class="label">時長</span>
          <span class="value">{formatDuration(details.duration_secs)}</span>
        </div>
      </div>

      <div class="divider"></div>

      <div class="section">
        <div class="row">
          <span class="label">格式</span>
          <span class="value">{details.format || '—'}</span>
        </div>
        {#if details.bitrate_kbps != null}
          <div class="row">
            <span class="label">位元率</span>
            <span class="value">{details.bitrate_kbps} kbps</span>
          </div>
        {/if}
        {#if details.sample_rate_hz != null}
          <div class="row">
            <span class="label">取樣率</span>
            <span class="value">{formatSampleRate(details.sample_rate_hz)}</span>
          </div>
        {/if}
        {#if details.channels != null}
          <div class="row">
            <span class="label">聲道</span>
            <span class="value"
              >{details.channels === 1
                ? 'Mono'
                : details.channels === 2
                  ? 'Stereo'
                  : `${details.channels} ch`}</span
            >
          </div>
        {/if}
        {#if details.bits_per_sample != null}
          <div class="row">
            <span class="label">位元深度</span>
            <span class="value">{details.bits_per_sample} bit</span>
          </div>
        {/if}
      </div>

      <div class="divider"></div>

      <div class="section">
        <div class="row">
          <span class="label">檔案大小</span>
          <span class="value">{formatFileSize(details.file_size_bytes)}</span>
        </div>
        <div class="row">
          <span class="label">檔案路徑</span>
          <span class="value path">{details.file_path}</span>
        </div>
      </div>

      {#if onsave}
        <div class="dialog-actions">
          {#if isEditing}
            <button class="btn btn-secondary" onclick={cancelEditing} disabled={isSaving}
              >取消</button
            >
            <button class="btn btn-primary" onclick={saveEditing} disabled={isSaving}>
              {#if isSaving}儲存中...{:else}儲存{/if}
            </button>
          {:else}
            <button class="btn btn-secondary" onclick={startEditing}>編輯</button>
          {/if}
        </div>
      {/if}
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
    width: 420px;
    max-width: 90vw;
    max-height: 80vh;
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

  .section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .row {
    display: flex;
    align-items: baseline;
    gap: 12px;
  }

  .label {
    flex-shrink: 0;
    width: 80px;
    font-size: 12px;
    color: #888;
    text-align: right;
  }

  .value {
    font-size: 13px;
    color: #ddd;
    word-break: break-all;
  }

  .value.path {
    font-size: 11px;
    color: #aaa;
    font-family: monospace;
  }

  .divider {
    height: 1px;
    background: #2a2a4a;
    margin: 12px 0;
  }

  .edit-input {
    flex: 1;
    background: #16213e;
    border: 1px solid #2a2a4a;
    border-radius: 4px;
    padding: 4px 8px;
    color: #eee;
    font-size: 13px;
    outline: none;
  }

  .edit-input:focus {
    border-color: #e94560;
  }

  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px solid #2a2a4a;
  }

  .btn {
    padding: 6px 16px;
    border: none;
    border-radius: 4px;
    font-size: 13px;
    cursor: pointer;
    transition:
      background 0.15s,
      opacity 0.15s;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .btn-primary {
    background: #e94560;
    color: #fff;
  }

  .btn-primary:hover:not(:disabled) {
    background: #d63b55;
  }

  .btn-secondary {
    background: #2a2a4a;
    color: #ddd;
  }

  .btn-secondary:hover:not(:disabled) {
    background: #3a3a5a;
  }
</style>
