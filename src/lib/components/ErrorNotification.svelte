<script lang="ts">
  import { getErrorState, dismissError } from '$lib/state/errorState.svelte';

  const errorState = getErrorState();
</script>

{#if errorState.errors.length > 0}
  <div class="error-stack">
    {#each errorState.errors as err (err.id)}
      <div class="error-toast" class:warn={err.level === 'warn'}>
        <span>{err.message}</span>
        <button class="dismiss-btn" onclick={() => dismissError(err.id)}>&times;</button>
      </div>
    {/each}
  </div>
{/if}

<style>
  .error-stack {
    position: fixed;
    bottom: 96px;
    right: 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    z-index: 1000;
    pointer-events: none;
  }

  .error-toast {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    border-radius: 6px;
    background: #c0392b;
    color: #fff;
    font-size: 13px;
    pointer-events: auto;
    animation: slide-in 0.2s ease-out;
    max-width: 320px;
  }

  .error-toast.warn {
    background: #7f6b00;
  }

  .dismiss-btn {
    background: transparent;
    border: none;
    color: #fff;
    font-size: 16px;
    cursor: pointer;
    padding: 0 2px;
    line-height: 1;
    opacity: 0.7;
  }

  .dismiss-btn:hover {
    opacity: 1;
  }

  @keyframes slide-in {
    from {
      opacity: 0;
      transform: translateX(20px);
    }

    to {
      opacity: 1;
      transform: translateX(0);
    }
  }
</style>
