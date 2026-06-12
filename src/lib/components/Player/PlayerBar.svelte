<script lang="ts">
  import TrackInfo from './TrackInfo.svelte';
  import PlayButton from './PlayButton.svelte';
  import ProgressBar from './ProgressBar.svelte';
  import VolumeControl from './VolumeControl.svelte';
  import { getPlayerState } from '$lib/state/playerState.svelte';
  import * as playbackApi from '$lib/api/playback';
  import { getNextIndex, getPrevIndex } from '$lib/logic/playmode';
  import {
    handleNext,
    handlePrev,
    applyPlayerStateEvent,
    toggleShuffle,
    cycleRepeat,
    tryQueueNext,
  } from '$lib/logic/playback-actions';
  import { notifyCritical, warnNonCritical } from '$lib/logic/error-handler';
  import { listen } from '@tauri-apps/api/event';
  import type { PlayerState } from '$lib/types';

  const player = getPlayerState();

  const canNext = $derived(
    player.playQueue.length > 0 &&
      getNextIndex(
        player.currentIndex,
        player.playQueue.length,
        player.repeatMode,
        player.shuffleEnabled,
        player.shuffledIndices,
      ) !== null,
  );
  const canPrev = $derived(
    player.playQueue.length > 0 &&
      getPrevIndex(
        player.currentIndex,
        player.playQueue.length,
        player.repeatMode,
        player.shuffleEnabled,
        player.shuffledIndices,
      ) !== null,
  );

  async function handlePlayPause() {
    if (!player.currentTrack) return;
    try {
      if (player.isPlaying) {
        await playbackApi.pause();
        player.isPlaying = false;
      } else {
        await playbackApi.resume();
        player.isPlaying = true;
      }
    } catch (err) {
      notifyCritical('Play/Pause', err);
    }
  }

  async function handleSeek(secs: number) {
    player.positionSecs = secs;
    try {
      await playbackApi.seek(secs);
    } catch (err) {
      warnNonCritical('Seek', err);
    }
    tryQueueNext();
  }

  async function handleVolumeChange(v: number) {
    player.volume = v;
    try {
      await playbackApi.setVolume(v);
    } catch (err) {
      warnNonCritical('Set volume', err);
    }
  }

  // Listen for backend player state events
  $effect(() => {
    let unlisten: (() => void) | undefined;

    (async () => {
      try {
        unlisten = await listen<PlayerState>('player-state-changed', (event) => {
          applyPlayerStateEvent(event.payload);
        });
      } catch (err) {
        warnNonCritical('Player event listener', err);
      }
    })();

    return () => {
      unlisten?.();
    };
  });
</script>

<div class="player-bar" class:mini={player.miniMode}>
  <TrackInfo track={player.currentTrack} />

  <div class="controls">
    {#if !player.miniMode}
      <button
        class="mode-btn"
        class:active={player.shuffleEnabled}
        onclick={toggleShuffle}
        title="Shuffle"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
          <path
            d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"
          />
        </svg>
      </button>
    {/if}

    <button class="nav-btn" onclick={handlePrev} disabled={!canPrev} title="Previous">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
        <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
      </svg>
    </button>

    <PlayButton
      isPlaying={player.isPlaying}
      disabled={!player.currentTrack}
      onclick={handlePlayPause}
    />

    <button class="nav-btn" onclick={handleNext} disabled={!canNext} title="Next">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
        <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
      </svg>
    </button>

    {#if !player.miniMode}
      <button
        class="mode-btn"
        class:active={player.repeatMode !== 'off'}
        onclick={cycleRepeat}
        title="Repeat: {player.repeatMode}"
      >
        {#if player.repeatMode === 'repeat-one'}
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path
              d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4zm-4-2V9h-1l-2 1v1h1.5v4H13z"
            />
          </svg>
        {:else}
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z" />
          </svg>
        {/if}
      </button>
    {/if}
  </div>

  {#if !player.miniMode}
    <ProgressBar
      positionSecs={player.positionSecs}
      durationSecs={player.durationSecs}
      onseek={handleSeek}
    />

    <VolumeControl volume={player.volume} onchange={handleVolumeChange} />
  {/if}

  <button
    class="mode-btn"
    class:active={player.miniMode}
    onclick={() => (player.miniMode = !player.miniMode)}
    title="Mini player"
  >
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
      {#if player.miniMode}
        <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
      {:else}
        <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
      {/if}
    </svg>
  </button>
</div>

<style>
  .player-bar {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 0 20px;
    height: 80px;
    background: #0f0f23;
    border-top: 1px solid #2a2a4a;
  }

  .controls {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .nav-btn {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: none;
    background: transparent;
    color: #ccc;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: 0;
    transition: color 0.2s;
  }

  .nav-btn:hover:not(:disabled) {
    color: #fff;
  }

  .nav-btn:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .mode-btn {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: none;
    background: transparent;
    color: #888;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: 0;
    transition: color 0.2s;
  }

  .mode-btn:hover {
    color: #ccc;
  }

  .mode-btn.active {
    color: #e94560;
  }

  .player-bar.mini {
    height: 100%;
    border-top: none;
    gap: 12px;
    padding: 0 12px;
  }
</style>
