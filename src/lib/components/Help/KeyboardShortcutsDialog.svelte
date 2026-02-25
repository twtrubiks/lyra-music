<script lang="ts">
  import { getShortcutCategories } from '$lib/logic/shortcut-data';

  let { onclose }: { onclose: () => void } = $props();

  const categories = getShortcutCategories();

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
  <div class="dialog" role="dialog" aria-label="Keyboard shortcuts">
    <div class="dialog-header">
      <h3>快捷鍵說明</h3>
      <button class="close-btn" onclick={onclose} aria-label="Close">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
          <path
            d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
          />
        </svg>
      </button>
    </div>

    <div class="dialog-body">
      {#each categories as category, i (category.title)}
        {#if i > 0}
          <div class="divider"></div>
        {/if}
        <div class="category">
          <h4 class="category-title">{category.title}</h4>
          <div class="shortcut-list">
            {#each category.shortcuts as shortcut (shortcut.description)}
              <div class="shortcut-row">
                <span class="shortcut-description">{shortcut.description}</span>
                <span class="shortcut-keys">
                  {#each shortcut.keys as key, k (key)}
                    {#if k > 0}
                      <span class="key-separator">+</span>
                    {/if}
                    <kbd>{key}</kbd>
                  {/each}
                </span>
              </div>
            {/each}
          </div>
        </div>
      {/each}
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
    width: 560px;
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

  .category {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .category-title {
    margin: 0 0 4px;
    font-size: 13px;
    font-weight: 600;
    color: #e94560;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .shortcut-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .shortcut-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 5px 8px;
    border-radius: 4px;
    transition: background 0.1s;
  }

  .shortcut-row:hover {
    background: rgb(255 255 255 / 4%);
  }

  .shortcut-description {
    font-size: 13px;
    color: #ddd;
  }

  .shortcut-keys {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .key-separator {
    font-size: 11px;
    color: #666;
  }

  kbd {
    display: inline-block;
    min-width: 24px;
    padding: 2px 7px;
    background: #16213e;
    border: 1px solid #3a3a5a;
    border-radius: 4px;
    box-shadow: 0 1px 0 #3a3a5a;
    color: #ccc;
    font-family: inherit;
    font-size: 12px;
    text-align: center;
    line-height: 1.4;
  }

  .divider {
    height: 1px;
    background: #2a2a4a;
    margin: 12px 0;
  }
</style>
