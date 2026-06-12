<script lang="ts">
  import type { Track } from '$lib/types';
  import { formatTotalDuration, formatFileSize, formatTrackCount } from '$lib/logic/format';

  let { tracks }: { tracks: Track[] } = $props();

  let count = $derived(tracks.length);
  let totalDuration = $derived(tracks.reduce((sum, t) => sum + t.duration_secs, 0));
  let totalSize = $derived(tracks.reduce((sum, t) => sum + t.file_size_bytes, 0));
</script>

{#if count > 0}
  <div class="status-bar">
    <span>{formatTrackCount(count)}</span>
    <span class="sep">|</span>
    <span>{formatTotalDuration(totalDuration)}</span>
    <span class="sep">|</span>
    <span>{formatFileSize(totalSize)}</span>
  </div>
{/if}

<style>
  .status-bar {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
    padding: 8px 12px;
    font-size: 12px;
    color: #999;
    flex-shrink: 0;
    border-top: 1px solid #2a2a4a;
    background: #1a1a2e;
  }

  .sep {
    color: #555;
  }
</style>
