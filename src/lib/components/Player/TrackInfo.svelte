<script lang="ts">
  import type { Track } from '$lib/types';

  let { track }: { track: Track | null } = $props();

  let titleEl = $state<HTMLDivElement | null>(null);
  let artistEl = $state<HTMLDivElement | null>(null);
  let titleOverflows = $state(false);
  let artistOverflows = $state(false);

  // Check overflow whenever track changes
  $effect(() => {
    // Access track to re-run when it changes
    const _ = track?.title;
    const __ = track?.artist;

    // Wait for DOM update
    requestAnimationFrame(() => {
      if (titleEl) {
        titleOverflows = titleEl.scrollWidth > titleEl.clientWidth;
      }
      if (artistEl) {
        artistOverflows = artistEl.scrollWidth > artistEl.clientWidth;
      }
    });
  });
</script>

<div class="track-info">
  {#if track}
    <div class="cover">
      {#if track.cover_art}
        <img src={track.cover_art} alt="Cover" />
      {:else}
        <div class="no-cover">&#9835;</div>
      {/if}
    </div>
    <div class="meta">
      <div class="text-scroll" class:scrolling={titleOverflows}>
        <div class="title" bind:this={titleEl}>{track.title}</div>
        {#if titleOverflows}
          <div class="title" aria-hidden="true">{track.title}</div>
        {/if}
      </div>
      <div class="text-scroll" class:scrolling={artistOverflows}>
        <div class="artist" bind:this={artistEl}>{track.artist}</div>
        {#if artistOverflows}
          <div class="artist" aria-hidden="true">{track.artist}</div>
        {/if}
      </div>
    </div>
  {:else}
    <div class="cover">
      <div class="no-cover">&#9835;</div>
    </div>
    <div class="meta">
      <div class="text-scroll">
        <div class="title">No track playing</div>
      </div>
      <div class="text-scroll">
        <div class="artist">&nbsp;</div>
      </div>
    </div>
  {/if}
</div>

<style>
  .track-info {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 220px;
    flex-shrink: 0;
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

  .text-scroll.scrolling {
    display: flex;
    gap: 3em;
    animation: marquee 12s linear infinite;
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
