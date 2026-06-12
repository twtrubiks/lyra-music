<script lang="ts">
  import type { Track, Playlist, SortConfig, SortColumn } from '$lib/types';
  import TrackRow from './TrackRow.svelte';
  import { loadColumnWidths, saveColumnWidths, MIN_WIDTHS } from '$lib/logic/column-resize';
  import { getPlaylistState } from '$lib/state/playlistState.svelte';
  import * as playlistApi from '$lib/api/playlist';
  import { calculateVisibleRange, scrollTopForIndex, ROW_HEIGHT } from '$lib/logic/virtual-scroll';
  import {
    createEmptySelection,
    selectSingle,
    toggleSingle,
    selectRange,
    selectAll,
    resolveContextClick,
    removeFromSelection,
    getSelectedTracks,
    moveFocusDown,
    moveFocusUp,
    extendSelectionDown,
    extendSelectionUp,
    type SelectionState,
  } from '$lib/logic/selection';
  import { moveByKeyboard } from '$lib/logic/reorder';
  import { warnNonCritical } from '$lib/logic/error-handler';

  let {
    tracks,
    currentTrackId = null,
    onplay,
    onremove,
    ontrash,
    onproperties,
    onreorder,
    sortConfig,
    onsort,
  }: {
    tracks: Track[];
    currentTrackId?: number | null;
    onplay: (track: Track) => void;
    onremove?: (tracks: Track[]) => void;
    ontrash?: (tracks: Track[]) => void;
    onproperties?: (track: Track) => void;
    onreorder?: (trackIds: number[]) => void;
    sortConfig?: SortConfig;
    onsort?: (column: SortColumn) => void;
  } = $props();

  const playlistState = getPlaylistState();

  // Virtual scroll state
  let wrapperEl: HTMLDivElement | undefined = $state(undefined);
  let scrollTop = $state(0);
  let containerHeight = $state(0);
  let theadHeight = $state(0);

  function handleScroll() {
    if (wrapperEl) {
      scrollTop = wrapperEl.scrollTop;
    }
  }

  $effect(() => {
    if (!wrapperEl) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        containerHeight = entry.contentRect.height;
      }
      const thead = wrapperEl?.querySelector('thead');
      if (thead) {
        theadHeight = thead.offsetHeight;
      }
    });
    ro.observe(wrapperEl);
    return () => ro.disconnect();
  });

  let visibleRange = $derived(calculateVisibleRange(scrollTop, containerHeight, tracks.length));
  let visibleTracks = $derived(tracks.slice(visibleRange.startIndex, visibleRange.endIndex));

  // Selection state
  let selection = $state<SelectionState>(createEmptySelection());

  // Reset selection when tracks array reference changes (search filter, playlist switch)
  let prevTracksRef: Track[] | undefined;
  $effect(() => {
    if (prevTracksRef !== undefined && prevTracksRef !== tracks) {
      selection = createEmptySelection();
    }
    prevTracksRef = tracks;
  });

  // Context menu state
  let showMenu = $state(false);
  let menuX = $state(0);
  let menuY = $state(0);

  // Column resize state
  let columnWidths = $state(loadColumnWidths());
  let tableEl: HTMLTableElement | undefined = $state(undefined);

  let resizingIndex = $state(-1);
  let startX = 0;
  let startLeftW = 0;
  let startRightW = 0;
  let tableWidth = 0;
  let justResized = false;
  let justResizedTimer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    return () => {
      clearTimeout(justResizedTimer);
      // A drag aborted by unmount never reaches onResizeEnd, which would
      // leave these window listeners holding state of a destroyed component
      window.removeEventListener('mousemove', onResizeMove);
      window.removeEventListener('mouseup', onResizeEnd);
    };
  });

  function onResizeStart(e: MouseEvent, colIndex: number) {
    e.preventDefault();
    resizingIndex = colIndex;
    startX = e.clientX;
    startLeftW = columnWidths[colIndex];
    startRightW = columnWidths[colIndex + 1];
    tableWidth = tableEl?.offsetWidth ?? 1;

    window.addEventListener('mousemove', onResizeMove);
    window.addEventListener('mouseup', onResizeEnd);
  }

  function onResizeMove(e: MouseEvent) {
    if (resizingIndex < 0) return;
    const deltaX = e.clientX - startX;
    const deltaPct = deltaX / tableWidth;

    let newLeft = startLeftW + deltaPct;
    let newRight = startRightW - deltaPct;

    if (newLeft < MIN_WIDTHS[resizingIndex]) {
      newLeft = MIN_WIDTHS[resizingIndex];
      newRight = startLeftW + startRightW - newLeft;
    }
    if (newRight < MIN_WIDTHS[resizingIndex + 1]) {
      newRight = MIN_WIDTHS[resizingIndex + 1];
      newLeft = startLeftW + startRightW - newRight;
    }

    columnWidths[resizingIndex] = newLeft;
    columnWidths[resizingIndex + 1] = newRight;
  }

  function onResizeEnd() {
    resizingIndex = -1;
    justResized = true;
    window.removeEventListener('mousemove', onResizeMove);
    window.removeEventListener('mouseup', onResizeEnd);
    saveColumnWidths(columnWidths);
    clearTimeout(justResizedTimer);
    justResizedTimer = setTimeout(() => {
      justResized = false;
    }, 0);
  }

  // Selection handlers
  function handleRowClick(index: number, e: MouseEvent) {
    if (e.shiftKey) {
      e.preventDefault();
      window.getSelection()?.removeAllRanges();
      selection = selectRange(selection, tracks, index);
    } else if (e.ctrlKey || e.metaKey) {
      selection = toggleSingle(selection, tracks, index);
    } else {
      selection = selectSingle(tracks, index);
    }
  }

  function handleRowContextMenu(index: number, e: MouseEvent) {
    e.preventDefault();
    selection = resolveContextClick(selection, tracks, index);
    menuX = e.clientX;
    menuY = e.clientY;
    showMenu = true;
  }

  function scrollFocusedIntoView() {
    if (selection.focusedIndex === null || !wrapperEl) return;
    const newTop = scrollTopForIndex(
      selection.focusedIndex,
      scrollTop,
      containerHeight,
      ROW_HEIGHT,
      theadHeight,
    );
    if (newTop !== null) {
      wrapperEl.scrollTop = newTop;
    }
  }

  function handleTableKeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
      e.preventDefault();
      selection = selectAll(tracks);
    }
    if (onreorder && e.ctrlKey && e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      const direction = e.key === 'ArrowUp' ? 'up' : 'down';
      const newOrder = moveByKeyboard(tracks, selection.selectedIds, direction);
      if (newOrder) onreorder(newOrder);
      return;
    }
    // Arrow/Enter/Home/End: stopPropagation prevents global volume handler from firing
    if (e.key === 'ArrowDown' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      e.stopPropagation();
      selection = e.shiftKey
        ? extendSelectionDown(selection, tracks)
        : moveFocusDown(selection, tracks);
      scrollFocusedIntoView();
    } else if (e.key === 'ArrowUp' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      e.stopPropagation();
      selection = e.shiftKey
        ? extendSelectionUp(selection, tracks)
        : moveFocusUp(selection, tracks);
      scrollFocusedIntoView();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (selection.focusedIndex !== null && tracks[selection.focusedIndex]) {
        onplay(tracks[selection.focusedIndex]);
      }
    } else if (e.key === 'Home') {
      e.preventDefault();
      e.stopPropagation();
      if (tracks.length > 0) {
        selection = selectSingle(tracks, 0);
        scrollFocusedIntoView();
      }
    } else if (e.key === 'End') {
      e.preventDefault();
      e.stopPropagation();
      if (tracks.length > 0) {
        selection = selectSingle(tracks, tracks.length - 1);
        scrollFocusedIntoView();
      }
    }
  }

  // Context menu actions
  function handleWindowClick() {
    if (showMenu) showMenu = false;
  }

  async function handleMenuAddToPlaylist(pl: Playlist) {
    showMenu = false;
    const selected = getSelectedTracks(tracks, selection);
    if (selected.length === 0) return;
    try {
      await playlistApi.batchAddToPlaylist(
        pl.id,
        selected.map((t) => t.id),
      );
    } catch (err) {
      warnNonCritical('Add to playlist', err);
    }
  }

  function handleMenuRemove() {
    showMenu = false;
    const selected = getSelectedTracks(tracks, selection);
    if (selected.length === 0) return;
    const ids = new Set(selected.map((t) => t.id));
    selection = removeFromSelection(selection, ids);
    onremove?.(selected);
  }

  function handleMenuTrash() {
    showMenu = false;
    const selected = getSelectedTracks(tracks, selection);
    if (selected.length === 0) return;
    const ids = new Set(selected.map((t) => t.id));
    selection = removeFromSelection(selection, ids);
    ontrash?.(selected);
  }

  function handleMenuProperties() {
    showMenu = false;
    if (selection.selectedIds.size !== 1) return;
    const selected = getSelectedTracks(tracks, selection);
    if (selected.length === 1) {
      onproperties?.(selected[0]);
    }
  }

  // Reorder menu handlers
  function handleMenuMoveUp() {
    showMenu = false;
    const newOrder = moveByKeyboard(tracks, selection.selectedIds, 'up');
    if (newOrder) onreorder?.(newOrder);
  }

  function handleMenuMoveDown() {
    showMenu = false;
    const newOrder = moveByKeyboard(tracks, selection.selectedIds, 'down');
    if (newOrder) onreorder?.(newOrder);
  }

  let selectedCount = $derived(selection.selectedIds.size);
  let propertiesDisabled = $derived(selection.selectedIds.size !== 1);
  let canMoveUp = $derived(
    !!onreorder &&
      selection.selectedIds.size > 0 &&
      tracks.length > 0 &&
      !selection.selectedIds.has(tracks[0].id),
  );
  let canMoveDown = $derived(
    !!onreorder &&
      selection.selectedIds.size > 0 &&
      tracks.length > 0 &&
      !selection.selectedIds.has(tracks[tracks.length - 1].id),
  );

  const headers: { label: string; column: SortColumn }[] = [
    { label: 'Title', column: 'title' },
    { label: 'Artist', column: 'artist' },
    { label: 'Album', column: 'album' },
    { label: 'Plays', column: 'play_count' },
    { label: 'Duration', column: 'duration_secs' },
  ];

  function getSortIndicator(column: SortColumn): string {
    if (!sortConfig || sortConfig.column !== column) return '';
    return sortConfig.direction === 'asc' ? ' \u25B2' : ' \u25BC';
  }
</script>

<svelte:window onclick={handleWindowClick} />

<div class="track-list-wrapper" bind:this={wrapperEl} onscroll={handleScroll}>
  {#if tracks.length === 0}
    <div class="empty">
      <p>No tracks yet.</p>
      <p class="hint">Use "Scan Folder" or drag files here to add music.</p>
    </div>
  {:else}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <table
      class="track-table"
      bind:this={tableEl}
      tabindex="0"
      onkeydown={handleTableKeydown}
      onmousedown={(e) => {
        if (e.shiftKey) e.preventDefault();
      }}
    >
      <colgroup>
        {#each columnWidths as w, i (i)}
          <col style="width: {w * 100}%" />
        {/each}
      </colgroup>
      <thead>
        <tr>
          {#each headers as header, i (header.column)}
            <th
              class:th-duration={i === 4}
              class:th-sortable={!!onsort}
              class:th-sorted={sortConfig?.column === header.column}
              onclick={() => {
                if (justResized) return;
                onsort?.(header.column);
              }}
            >
              <span class="th-label">{header.label}{getSortIndicator(header.column)}</span>
              {#if i < 4}
                <div
                  class="resize-handle"
                  class:active={resizingIndex === i}
                  role="separator"
                  aria-orientation="vertical"
                  onmousedown={(e) => {
                    e.stopPropagation();
                    onResizeStart(e, i);
                  }}
                ></div>
              {/if}
            </th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#if visibleRange.topPadding > 0}
          <tr class="virtual-spacer" aria-hidden="true"
            ><td colspan="5" style="height:{visibleRange.topPadding}px"></td></tr
          >
        {/if}
        {#each visibleTracks as track, localIndex (track.id)}
          {@const globalIndex = visibleRange.startIndex + localIndex}
          <TrackRow
            {track}
            isActive={track.id === currentTrackId}
            isSelected={selection.selectedIds.has(track.id)}
            isFocused={selection.focusedIndex === globalIndex}
            ondblclick={onplay}
            onclick={(e) => handleRowClick(globalIndex, e)}
            oncontextmenu={(e) => handleRowContextMenu(globalIndex, e)}
          />
        {/each}
        {#if visibleRange.bottomPadding > 0}
          <tr class="virtual-spacer" aria-hidden="true"
            ><td colspan="5" style="height:{visibleRange.bottomPadding}px"></td></tr
          >
        {/if}
      </tbody>
    </table>
  {/if}
</div>

{#if showMenu}
  <div class="context-menu" style="left: {menuX}px; top: {menuY}px;" role="menu">
    {#if playlistState.playlists.length > 0}
      <div class="menu-header">Add to playlist</div>
      {#each playlistState.playlists as pl (pl.id)}
        <button
          class="menu-item"
          role="menuitem"
          onclick={(e) => {
            e.stopPropagation();
            handleMenuAddToPlaylist(pl);
          }}
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
            <path
              d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"
            />
          </svg>
          {pl.name}
        </button>
      {/each}
      <div class="menu-divider"></div>
    {/if}
    {#if onreorder}
      <button
        class="menu-item"
        class:menu-item-disabled={!canMoveUp}
        role="menuitem"
        onclick={(e) => {
          e.stopPropagation();
          if (canMoveUp) handleMenuMoveUp();
        }}
      >
        ▲ 上移 <span class="shortcut">Ctrl+Shift+↑</span>
      </button>
      <button
        class="menu-item"
        class:menu-item-disabled={!canMoveDown}
        role="menuitem"
        onclick={(e) => {
          e.stopPropagation();
          if (canMoveDown) handleMenuMoveDown();
        }}
      >
        ▼ 下移 <span class="shortcut">Ctrl+Shift+↓</span>
      </button>
      <div class="menu-divider"></div>
    {/if}
    <button
      class="menu-item"
      role="menuitem"
      onclick={(e) => {
        e.stopPropagation();
        handleMenuRemove();
      }}
    >
      <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
        <path d="M19 13H5v-2h14v2z" />
      </svg>
      移除{#if selectedCount > 1}
        ({selectedCount}){/if}
    </button>
    <button
      class="menu-item menu-item-danger"
      role="menuitem"
      onclick={(e) => {
        e.stopPropagation();
        handleMenuTrash();
      }}
    >
      <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
      </svg>
      丟進垃圾桶{#if selectedCount > 1}
        ({selectedCount}){/if}
    </button>
    <div class="menu-divider"></div>
    <button
      class="menu-item"
      class:menu-item-disabled={propertiesDisabled}
      role="menuitem"
      onclick={(e) => {
        e.stopPropagation();
        handleMenuProperties();
      }}
    >
      <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
        <path
          d="M11 17h2v-6h-2v6zm1-15C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zM11 9h2V7h-2v2z"
        />
      </svg>
      屬性
    </button>
  </div>
{/if}

<style>
  .track-list-wrapper {
    overflow-y: auto;
    flex: 1;
  }

  .track-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }

  .track-table:focus {
    outline: none;
  }

  .track-table:focus-visible {
    outline: none;
  }

  thead {
    position: sticky;
    top: 0;
    z-index: 1;
  }

  th {
    text-align: left;
    padding: 10px 12px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #666;
    background: #1a1a2e;
    border-bottom: 1px solid #2a2a4a;
    font-weight: 600;
    position: relative;
    user-select: none;
  }

  .th-duration {
    text-align: right;
  }

  .th-sortable {
    cursor: pointer;
  }

  .th-sortable:hover {
    color: #aaa;
  }

  .th-sorted {
    color: #e94560;
  }

  .th-label {
    pointer-events: none;
  }

  .resize-handle {
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    width: 4px;
    cursor: col-resize;
    background: transparent;
    transition: background 0.15s;
  }

  .resize-handle:hover,
  .resize-handle.active {
    background: rgb(233 69 96 / 50%);
  }

  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 300px;
    color: #666;
  }

  .empty p {
    margin: 4px 0;
  }

  .hint {
    font-size: 13px;
    color: #555;
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

  .menu-header {
    padding: 6px 12px;
    font-size: 11px;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-weight: 600;
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
    background: rgb(233 69 96 / 20%);
    color: #fff;
  }

  .menu-item-danger {
    color: #e94560;
  }

  .menu-item-danger:hover {
    background: rgb(233 69 96 / 30%);
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
