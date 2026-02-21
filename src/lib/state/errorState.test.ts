import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getErrorState, pushError, dismissError } from './errorState.svelte';

describe('errorState', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    const state = getErrorState();
    state.errors = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('pushError adds an error to the list', () => {
    const state = getErrorState();
    pushError('Test error', 'error');
    expect(state.errors).toHaveLength(1);
    expect(state.errors[0].message).toBe('Test error');
    expect(state.errors[0].level).toBe('error');
  });

  it('pushError auto-dismisses after timeout', () => {
    const state = getErrorState();
    pushError('Will disappear', 'error', 3000);
    expect(state.errors).toHaveLength(1);

    vi.advanceTimersByTime(3000);
    expect(state.errors).toHaveLength(0);
  });

  it('dismissError removes a specific error', () => {
    const state = getErrorState();
    const id = pushError('Dismiss me', 'warn');
    expect(state.errors).toHaveLength(1);

    dismissError(id);
    expect(state.errors).toHaveLength(0);
  });

  it('multiple errors stack correctly', () => {
    const state = getErrorState();
    pushError('Error 1', 'error');
    pushError('Error 2', 'warn');
    expect(state.errors).toHaveLength(2);
    expect(state.errors[0].message).toBe('Error 1');
    expect(state.errors[1].message).toBe('Error 2');
  });

  it('shared state across getErrorState calls', () => {
    const s1 = getErrorState();
    const s2 = getErrorState();
    pushError('Shared', 'error');
    expect(s1.errors).toHaveLength(1);
    expect(s2.errors).toHaveLength(1);
  });

  it('default level is error', () => {
    const state = getErrorState();
    pushError('Default level');
    expect(state.errors[0].level).toBe('error');
  });

  it('each error gets a unique id', () => {
    const state = getErrorState();
    pushError('A');
    pushError('B');
    expect(state.errors[0].id).not.toBe(state.errors[1].id);
  });
});
