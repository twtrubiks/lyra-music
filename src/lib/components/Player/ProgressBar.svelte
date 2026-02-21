<script lang="ts">
  import { formatDuration } from '$lib/logic/format';

  let {
    positionSecs,
    durationSecs,
    onseek,
  }: {
    positionSecs: number;
    durationSecs: number;
    onseek: (secs: number) => void;
  } = $props();

  let dragging = $state(false);
  let dragValue = $state(0);

  const displayPosition = $derived(dragging ? dragValue : positionSecs);
  const progress = $derived(durationSecs > 0 ? (displayPosition / durationSecs) * 100 : 0);

  function handleInput(e: Event) {
    const target = e.target as HTMLInputElement;
    dragValue = parseFloat(target.value);
  }

  function handleMouseDown() {
    dragging = true;
    dragValue = positionSecs;
  }

  function handleMouseUp(e: Event) {
    const target = e.target as HTMLInputElement;
    dragging = false;
    onseek(parseFloat(target.value));
  }
</script>

<div class="progress-bar">
  <span class="time">{formatDuration(displayPosition)}</span>
  <div class="slider-wrapper">
    <input
      type="range"
      min="0"
      max={durationSecs || 1}
      step="0.5"
      value={displayPosition}
      oninput={handleInput}
      onmousedown={handleMouseDown}
      onmouseup={handleMouseUp}
      ontouchstart={handleMouseDown}
      ontouchend={handleMouseUp}
      style="

--progress: {progress}%"
    />
  </div>
  <span class="time">{formatDuration(durationSecs)}</span>
</div>

<style>
  .progress-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    max-width: 500px;
  }

  .time {
    font-size: 12px;
    color: #888;
    min-width: 36px;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  .slider-wrapper {
    flex: 1;
  }

  input[type='range'] {
    appearance: none;
    width: 100%;
    height: 4px;
    border-radius: 2px;
    background: linear-gradient(
      to right,
      #e94560 0%,
      #e94560 var(--progress),
      #333 var(--progress),
      #333 100%
    );
    outline: none;
    cursor: pointer;
  }

  input[type='range']::-webkit-slider-thumb {
    appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #e94560;
    border: 2px solid #fff;
    cursor: pointer;
    transition: transform 0.1s;
  }

  input[type='range']::-webkit-slider-thumb:hover {
    transform: scale(1.2);
  }

  input[type='range']::-moz-range-thumb {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #e94560;
    border: 2px solid #fff;
    cursor: pointer;
  }
</style>
