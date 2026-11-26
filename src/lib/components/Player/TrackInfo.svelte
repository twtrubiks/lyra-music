<script lang="ts">
  import type { Track } from '$lib/types';
  import { t } from '$lib/i18n/index.svelte';
  import { marqueeDurationSeconds, textOverflows } from '$lib/logic/marquee';

  let {
    track,
    onreveal,
  }: {
    track: Track | null;
    /** Show this track in the track list; omitted where there is no list (mini mode). */
    onreveal?: () => void;
  } = $props();

  let canReveal = $derived(track !== null && onreveal !== undefined);

  // The box clips; the text inside keeps its natural width (see `.marquee`), so the
  // comparison holds whether or not the marquee is currently running.
  let titleBox = $state<HTMLDivElement | null>(null);
  let titleEl = $state<HTMLDivElement | null>(null);
  let artistBox = $state<HTMLDivElement | null>(null);
  let artistEl = $state<HTMLDivElement | null>(null);
  let titleWidth = $state(0);
  let artistWidth = $state(0);
  let titleOverflows = $state(false);
  let artistOverflows = $state(false);

  // Check overflow whenever track changes
  $effect(() => {
    // Access track to re-run when it changes
    const _ = track?.title;
    const __ = track?.artist;

    // Wait for DOM update
    requestAnimationFrame(() => {
      if (titleEl && titleBox) {
        titleWidth = titleEl.offsetWidth;
        titleOverflows = textOverflows(titleWidth, titleBox.clientWidth);
      }
      if (artistEl && artistBox) {
        artistWidth = artistEl.offsetWidth;
        artistOverflows = textOverflows(artistWidth, artistBox.clientWidth);
      }
    });
  });
</script>

<button
  type="button"
  class="track-info"
  disabled={!canReveal}
  title={canReveal ? t('player.revealPlaying') : undefined}
  onclick={() => onreveal?.()}
>
  {#if track}
    <div class="cover">
      {#if track.cover_art}
        <img src={track.cover_art} alt={t('player.cover')} />
      {:else}
        <div class="no-cover">&#9835;</div>
      {/if}
    </div>
    <div class="meta">
      <div class="text-scroll" bind:this={titleBox}>
        <div
          class="marquee"
          class:scrolling={titleOverflows}
          style:animation-duration="{marqueeDurationSeconds(titleWidth)}s"
        >
          <div class="title" bind:this={titleEl}>{track.title}</div>
          {#if titleOverflows}
            <div class="title" aria-hidden="true">{track.title}</div>
          {/if}
        </div>
      </div>
      <div class="text-scroll" bind:this={artistBox}>
        <div
          class="marquee"
          class:scrolling={artistOverflows}
          style:animation-duration="{marqueeDurationSeconds(artistWidth)}s"
        >
          <div class="artist" bind:this={artistEl}>{track.artist}</div>
          {#if artistOverflows}
            <div class="artist" aria-hidden="true">{track.artist}</div>
          {/if}
        </div>
      </div>
    </div>
  {:else}
    <div class="cover">
      <div class="no-cover">&#9835;</div>
    </div>
    <div class="meta">
      <div class="text-scroll">
        <div class="title">{t('player.noTrack')}</div>
      </div>
      <div class="text-scroll">
        <div class="artist">&nbsp;</div>
      </div>
    </div>
  {/if}
</button>

<style>
  .track-info {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 220px;
    flex-shrink: 0;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .track-info:disabled {
    cursor: default;
  }

  .cover {
    width: 56px;
    height: 56px;
    flex-shrink: 0;
    border-radius: 4px;
    overflow: hidden;
    background: #16213e;
  }

  .cover img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .no-cover {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    color: #555;
  }

  .meta {
    overflow: hidden;
    flex: 1;
    min-width: 0;
  }

  .text-scroll {
    overflow: hidden;
    white-space: nowrap;
  }

  /* As wide as its text, so -50% in the keyframes is half the text, not half the box. */
  .marquee {
    display: flex;
    gap: 3em;
    width: max-content;
  }

  .marquee.scrolling {
    animation: marquee linear infinite;
  }

  .title {
    font-size: 14px;
    font-weight: 600;
    white-space: nowrap;
    color: #eee;
    flex-shrink: 0;
  }

  .artist {
    font-size: 12px;
    color: #888;
    white-space: nowrap;
    flex-shrink: 0;
  }

  @keyframes marquee {
    0% {
      transform: translateX(0);
    }

    100% {
      transform: translateX(calc(-50% - 1.5em));
    }
  }
</style>
