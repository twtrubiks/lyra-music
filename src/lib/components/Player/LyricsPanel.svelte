<script lang="ts">
  import { getPlayerState } from '$lib/state/playerState.svelte';
  import { getLyricsState } from '$lib/state/lyricsState.svelte';
  import { searchLyricsOnline } from '$lib/logic/lyrics-actions';
  import { currentLineIndex } from '$lib/logic/lrc';
  import { t } from '$lib/i18n/index.svelte';

  const player = getPlayerState();

  // Lyrics are loaded eagerly on track change (App.svelte → lyrics-actions),
  // so opening the panel shows content immediately.
  const lyricsState = getLyricsState();
  const lyrics = $derived(lyricsState.lyrics);
  const loading = $derived(lyricsState.loading);
  const onlineStatus = $derived(lyricsState.onlineStatus);

  let userScrolling = $state(false);
  let container = $state<HTMLElement>();
  let scrollTimer: ReturnType<typeof setTimeout> | undefined;

  // "Unknown Artist" mirrors the backend reader's missing-tag placeholder —
  // an LRCLIB query built from it can only mismatch, so don't offer search.
  const searchableOnline = $derived.by(() => {
    const artist = player.currentTrack?.artist ?? '';
    return artist.trim() !== '' && artist !== 'Unknown Artist';
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

<!-- mousedown covers scrollbar drags, which fire neither wheel nor touchmove;
     a stray click merely pauses auto-scroll for 3s. -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="lyrics-panel"
  role="region"
  aria-label={t('player.lyrics')}
  bind:this={container}
  onwheel={pauseAutoScroll}
  ontouchmove={pauseAutoScroll}
  onmousedown={pauseAutoScroll}
>
  {#if !player.currentTrack}
    <p class="empty">{t('lyrics.noTrack')}</p>
  {:else if loading}
    <p class="empty">{t('lyrics.loading')}</p>
  {:else if !lyrics}
    <div class="empty not-found">
      <p>{t('lyrics.notFound')}</p>
      {#if !searchableOnline}
        <p class="hint">{t('lyrics.missingArtist')}</p>
      {:else if onlineStatus === 'searching'}
        <p class="hint">{t('lyrics.searching')}</p>
      {:else}
        <button class="search-online" onclick={searchLyricsOnline}
          >{t('lyrics.searchOnline')}</button
        >
        {#if onlineStatus === 'notfound'}
          <p class="hint">{t('lyrics.onlineNotFound')}</p>
        {:else if onlineStatus === 'error'}
          <p class="hint">{t('lyrics.onlineError')}</p>
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
            <p class="hint">{t('lyrics.searching')}</p>
          {:else}
            <button class="search-online" onclick={searchLyricsOnline}
              >{t('lyrics.searchSynced')}</button
            >
            {#if onlineStatus === 'notfound'}
              <p class="hint">{t('lyrics.onlineSyncedNotFound')}</p>
            {:else if onlineStatus === 'error'}
              <p class="hint">{t('lyrics.onlineError')}</p>
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
