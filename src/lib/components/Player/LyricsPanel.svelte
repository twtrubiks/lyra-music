<script lang="ts">
  import { getPlayerState } from '$lib/state/playerState.svelte';
  import * as libraryApi from '$lib/api/library';
  import { parseLyrics, currentLineIndex } from '$lib/logic/lrc';
  import type { ParsedLyrics } from '$lib/logic/lrc';
  import { warnNonCritical } from '$lib/logic/error-handler';

  const player = getPlayerState();

  let lyrics = $state<ParsedLyrics | null>(null);
  let loading = $state(false);
  let userScrolling = $state(false);
  let container = $state<HTMLElement>();
  let scrollTimer: ReturnType<typeof setTimeout> | undefined;

  const trackId = $derived(player.currentTrack?.id ?? null);

  // Fetch lyrics on track change. A late response for a previous track must
  // not overwrite the current one — guard on the id captured at request time.
  $effect(() => {
    const id = trackId;
    lyrics = null;
    if (id === null) {
      loading = false;
      return;
    }
    loading = true;
    libraryApi
      .getTrackLyrics(id)
      .then((raw) => {
        if (trackId !== id) return;
        lyrics = raw === null ? null : parseLyrics(raw);
        loading = false;
      })
      .catch((err) => {
        if (trackId !== id) return;
        loading = false;
        warnNonCritical('Load lyrics', err);
      });
  });

  const activeIndex = $derived(
    lyrics?.synced ? currentLineIndex(lyrics.lines, player.positionSecs) : -1,
  );

  // Auto-scroll the active line to center, unless the user is browsing.
  $effect(() => {
    const idx = activeIndex;
    if (idx < 0 || userScrolling || !container) return;
    container
      .querySelector(`[data-line="${idx}"]`)
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });

  // A position jump (seek) re-enables auto-scroll immediately.
  let prevPos = player.positionSecs;
  $effect(() => {
    const pos = player.positionSecs;
    if (Math.abs(pos - prevPos) > 2) {
      clearTimeout(scrollTimer);
      userScrolling = false;
    }
    prevPos = pos;
  });

  $effect(() => () => clearTimeout(scrollTimer));

  function pauseAutoScroll() {
    userScrolling = true;
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      userScrolling = false;
    }, 3000);
  }
</script>

<div
  class="lyrics-panel"
  role="region"
  aria-label="Lyrics"
  bind:this={container}
  onwheel={pauseAutoScroll}
  ontouchmove={pauseAutoScroll}
>
  {#if !player.currentTrack}
    <p class="empty">目前沒有播放曲目</p>
  {:else if loading}
    <p class="empty">載入歌詞中…</p>
  {:else if !lyrics}
    <p class="empty">找不到歌詞</p>
  {:else if lyrics.synced}
    <div class="lines">
      {#each lyrics.lines as line, i (i)}
        <p class="line" class:active={i === activeIndex} data-line={i}>
          {line.text || '♪'}
        </p>
      {/each}
    </div>
  {:else}
    <div class="lines">
      {#each lyrics.lines as line, i (i)}
        <p class="line static">{line}</p>
      {/each}
    </div>
  {/if}
</div>

<style>
  .lyrics-panel {
    position: absolute;
    inset: 0;
    z-index: 10;
    overflow-y: auto;
    background: #1a1a2e;
  }

  .lines {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-width: 640px;
    margin: 0 auto;
    padding: 40vh 24px;
  }

  .line {
    padding: 6px 0;
    font-size: 18px;
    line-height: 1.5;
    color: #888;
    text-align: center;
    transition:
      color 0.3s,
      font-size 0.3s;
  }

  .line.active {
    color: #fff;
    font-size: 22px;
    font-weight: 700;
  }

  .line.static {
    color: #ccc;
  }

  .empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #666;
    font-size: 16px;
  }
</style>
