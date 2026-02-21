import { describe, it, expect } from 'vitest';
import { createMockTracks } from '$lib/test-helpers';
import { getPlayerState } from './playerState.svelte';

describe('playerState derived state', () => {
  it('hasNext is true when not at end of queue', () => {
    const state = getPlayerState();
    state.playQueue = createMockTracks(3);
    state.currentIndex = 0;
    expect(state.hasNext).toBe(true);
    state.playQueue = [];
    state.currentIndex = -1;
  });

  it('hasNext is false when at end of queue', () => {
    const state = getPlayerState();
    state.playQueue = createMockTracks(3);
    state.currentIndex = 2;
    expect(state.hasNext).toBe(false);
    state.playQueue = [];
    state.currentIndex = -1;
  });

  it('hasPrev is true when not at start of queue', () => {
    const state = getPlayerState();
    state.playQueue = createMockTracks(3);
    state.currentIndex = 1;
    expect(state.hasPrev).toBe(true);
    state.playQueue = [];
    state.currentIndex = -1;
  });

  it('hasPrev is false when at start of queue', () => {
    const state = getPlayerState();
    state.playQueue = createMockTracks(3);
    state.currentIndex = 0;
    expect(state.hasPrev).toBe(false);
    state.playQueue = [];
    state.currentIndex = -1;
  });

  it('shared state is consistent across multiple getPlayerState calls', () => {
    const state1 = getPlayerState();
    const state2 = getPlayerState();
    state1.volume = 0.3;
    expect(state2.volume).toBe(0.3);
    state1.volume = 0.8;
  });
});
