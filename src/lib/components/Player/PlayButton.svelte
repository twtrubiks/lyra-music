<script lang="ts">
  let {
    isPlaying,
    disabled = false,
    onclick,
  }: {
    isPlaying: boolean;
    disabled?: boolean;
    onclick: () => void;
  } = $props();
</script>

<button class="play-btn" {disabled} {onclick} title={isPlaying ? 'Pause' : 'Play'}>
  {#if isPlaying}
    <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  {:else}
    <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
      <polygon points="6,4 20,12 6,20" />
    </svg>
  {/if}
</button>

<style>
  .play-btn {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    border: none;
    background: #e94560;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition:
      background 0.2s,
      transform 0.1s;
    padding: 0;
  }

  .play-btn:hover:not(:disabled) {
    background: #ff6b81;
    transform: scale(1.05);
  }

  .play-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }
</style>
