<script lang="ts">
  import { getPlayerState } from '$lib/state/playerState.svelte';
  import * as libraryApi from '$lib/api/library';
  import { parseLyrics, currentLineIndex } from '$lib/logic/lrc';
  import type { ParsedLyrics } from '$lib/logic/lrc';
  import { warnNonCritical } from '$lib/logic/error-handler';

  const player = getPlayerState();

  let lyrics = $state<ParsedLyrics | null>(null);
  let loading = $state(false);
  let onlineStatus = $state<'idle' | 'searching' | 'notfound' | 'error'>('idle');
  let userScrolling = $state(false);
  let container = $state<HTMLElement>();
  let scrollTimer: ReturnType<typeof setTimeout> | undefined;

  const trackId = $derived(player.currentTrack?.id ?? null);

  // "Unknown Artist" mirrors the backend reader's missing-tag placeholder —
  // an LRCLIB query built from it can only mismatch, so don't offer search.
  const searchableOnline = $derived.by(() => {
    const artist = player.currentTrack?.artist ?? '';
    return artist.trim() !== '' && artist !== 'Unknown Artist';
  });

  // Fetch lyrics on track change. A late response for a previous track must
  // not overwrite the current one — guard on the id captured at request time.
  $effect(() => {
    const id = trackId;
    lyrics = null;
    onlineStatus = 'idle';
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

  // Manual online lookup (LRCLIB) — same late-response guard as the local
  // fetch above. A hit that parses to nothing counts as not found; so does a
  // plain result when local lyrics are already shown, because the button then
  // promises an upgrade to synced — never swap plain for plain.
  function searchOnline() {
    const id = trackId;
    if (id === null || onlineStatus === 'searching') return;
    onlineStatus = 'searching';
    libraryApi
      .fetchLyricsOnline(id)
      .then((raw) => {
        if (trackId !== id) return;
        const parsed = raw === null ? null : parseLyrics(raw);
        if (parsed === null || (lyrics !== null && !parsed.synced)) {
          onlineStatus = 'notfound';
          return;
        }
        lyrics = parsed;
        onlineStatus = 'idle';
      })
      .catch((err) => {
        if (trackId !== id) return;
        onlineStatus = 'error';
        warnNonCritical('Fetch lyrics online', err);
      });
  }

  function pauseAutoScroll() {
    userScrolling = true;
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      userScrolling = false;
    }, 3000);
  }
</script>

<!-- mousedown covers scrollbar drags, which fire neither wheel nor touchmove;
     a stray click merely pauses auto-scroll for 3s. -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="lyrics-panel"
  role="region"
  aria-label="Lyrics"
  bind:this={container}
  onwheel={pauseAutoScroll}
  ontouchmove={pauseAutoScroll}
  onmousedown={pauseAutoScroll}
>
  {#if !player.currentTrack}
    <p class="empty">目前沒有播放曲目</p>
  {:else if loading}
    <p class="empty">載入歌詞中…</p>
  {:else if !lyrics}
    <div class="empty not-found">
      <p>找不到歌詞</p>
      {#if !searchableOnline}
        <p class="hint">曲目缺少演出者標籤，無法線上搜尋</p>
      {:else if onlineStatus === 'searching'}
        <p class="hint">線上搜尋中…</p>
      {:else}
        <button class="search-online" onclick={searchOnline}>線上搜尋歌詞</button>
        {#if onlineStatus === 'notfound'}
          <p class="hint">線上也找不到這首歌的歌詞</p>
        {:else if onlineStatus === 'error'}
          <p class="hint">線上搜尋失敗，請檢查網路連線</p>
        {/if}
      {/if}
    </div>
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
      {#if searchableOnline}
        <div class="upgrade">
          {#if onlineStatus === 'searching'}
            <p class="hint">線上搜尋中…</p>
          {:else}
            <button class="search-online" onclick={searchOnline}>搜尋同步歌詞</button>
            {#if onlineStatus === 'notfound'}
              <p class="hint">線上沒有這首歌的同步歌詞</p>
            {:else if onlineStatus === 'error'}
              <p class="hint">線上搜尋失敗，請檢查網路連線</p>
            {/if}
          {/if}
        </div>
      {/if}
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

  .not-found {
    flex-direction: column;
    gap: 14px;
  }

  .upgrade {
    display: flex;
    flex-direction: column;
    gap: 10px;
    align-items: center;
    margin-bottom: 28px;
  }

  .search-online {
    padding: 6px 18px;
    border: 1px solid #444;
    border-radius: 6px;
    background: transparent;
    color: #aaa;
    font-size: 14px;
    cursor: pointer;
  }

  .search-online:hover {
    border-color: #777;
    color: #fff;
  }

  .hint {
    color: #555;
    font-size: 13px;
  }
</style>
