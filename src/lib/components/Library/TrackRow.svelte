<script lang="ts">
  import type { Track } from '$lib/types';
  import { formatDuration } from '$lib/logic/format';

  let {
    track,
    isActive = false,
    isSelected = false,
    isFocused = false,
    ondblclick,
    onclick,
    oncontextmenu,
  }: {
    track: Track;
    isActive?: boolean;
    isSelected?: boolean;
    isFocused?: boolean;
    ondblclick: (track: Track) => void;
    onclick?: (e: MouseEvent) => void;
    oncontextmenu?: (e: MouseEvent) => void;
  } = $props();

  // Drag support
  function handleDragStart(e: DragEvent) {
    if (!e.dataTransfer) return;
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('application/x-track-id', String(track.id));
    e.dataTransfer.setData('text/plain', track.title);
  }
</script>

<tr
  class="track-row"
  class:active={isActive}
  class:selected={isSelected}
  class:focused={isFocused}
  ondblclick={() => ondblclick(track)}
  {onclick}
  {oncontextmenu}
  draggable="true"
  ondragstart={handleDragStart}
>
  <td class="col-title">{track.title}</td>
  <td class="col-artist">{track.artist}</td>
  <td class="col-album">{track.album}</td>
  <td class="col-plays">{track.play_count > 0 ? track.play_count : ''}</td>
  <td class="col-duration">{formatDuration(track.duration_secs)}</td>
</tr>

<style>
  .track-row {
    cursor: default;
    user-select: none;
  }

  .track-row ::selection {
    background: transparent;
  }

  .track-row:hover td {
    background: rgb(233 69 96 / 10%);
  }

  .track-row.active td {
    background: rgb(233 69 96 / 20%);
  }

  .track-row.active {
    color: #e94560;
  }

  .track-row.selected td {
    background: rgb(233 69 96 / 15%);
  }

  .track-row.selected:hover td {
    background: rgb(233 69 96 / 20%);
  }

  .track-row.active.selected td {
    background: rgb(233 69 96 / 25%);
  }

  .track-row.active.selected {
    color: #e94560;
  }

  .track-row.focused {
    outline: 1px solid rgb(233 69 96 / 40%);
    outline-offset: -1px;
  }

  .track-row[draggable='true'] {
    cursor: grab;
  }

  .track-row[draggable='true']:active {
    cursor: grabbing;
  }

  td {
    padding: 8px 12px;
    transition: background 0.15s;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    border-bottom: 1px solid #1f1f3a;
    font-size: 13px;
  }

  .col-title {
    font-weight: 500;
  }

  .col-artist {
    color: #aaa;
  }

  .col-album {
    color: #888;
  }

  .col-plays {
    text-align: right;
    color: #888;
    font-variant-numeric: tabular-nums;
  }

  .col-duration {
    text-align: right;
    color: #888;
    font-variant-numeric: tabular-nums;
  }
</style>
