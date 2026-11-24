import { describe, it, expect } from 'vitest';
import { LogicalSize, PhysicalSize } from '@tauri-apps/api/dpi';
import { createMiniWindowSync, MINI_SIZE, type MiniWindow } from './mini-window';

/** Fake window that applies state changes at once and logs every call. */
function createFakeWindow(init: { fullscreen?: boolean; maximized?: boolean; scale?: number }) {
  const state = {
    fullscreen: init.fullscreen ?? false,
    maximized: init.maximized ?? false,
    scale: init.scale ?? 1,
    // logical size of the window while neither maximized nor fullscreen
    size: new LogicalSize(1200, 800),
    alwaysOnTop: false,
  };
  const calls: string[] = [];
  const SCREEN = new LogicalSize(1920, 1080);
  const win: MiniWindow = {
    isFullscreen: async () => state.fullscreen,
    isMaximized: async () => state.maximized,
    setFullscreen: async (v) => {
      calls.push(`setFullscreen(${v})`);
      state.fullscreen = v;
    },
    maximize: async () => {
      calls.push('maximize');
      state.maximized = true;
    },
    unmaximize: async () => {
      calls.push('unmaximize');
      state.maximized = false;
    },
    innerSize: async () => {
      const s = state.fullscreen || state.maximized ? SCREEN : state.size;
      return new PhysicalSize(s.width * state.scale, s.height * state.scale);
    },
    scaleFactor: async () => state.scale,
    setSize: async (s) => {
      calls.push(`setSize(${s.width}x${s.height})`);
      state.size = s;
    },
    setAlwaysOnTop: async (v) => {
      calls.push(`setAlwaysOnTop(${v})`);
      state.alwaysOnTop = v;
    },
  };
  return { win, state, calls };
}

describe('createMiniWindowSync', () => {
  it('shrinks a normal window and restores its size afterwards', async () => {
    const { win, state, calls } = createFakeWindow({});
    const sync = createMiniWindowSync(win);

    await sync(true);
    expect(state.size).toEqual(MINI_SIZE);
    expect(state.alwaysOnTop).toBe(true);
    expect(calls).not.toContain('unmaximize');
    expect(calls).not.toContain('setFullscreen(false)');

    await sync(false);
    expect(state.size).toEqual(new LogicalSize(1200, 800));
    expect(state.alwaysOnTop).toBe(false);
    expect(state.maximized).toBe(false);
    expect(state.fullscreen).toBe(false);
  });

  it('restores the logical size on a HiDPI display', async () => {
    const { win, state } = createFakeWindow({ scale: 2 });
    const sync = createMiniWindowSync(win);

    await sync(true);
    await sync(false);

    expect(state.size).toEqual(new LogicalSize(1200, 800));
  });

  it('leaves the maximized state before shrinking, and maximizes again on exit', async () => {
    const { win, state, calls } = createFakeWindow({ maximized: true });
    const sync = createMiniWindowSync(win);

    await sync(true);
    expect(state.maximized).toBe(false);
    expect(state.size).toEqual(MINI_SIZE);
    expect(calls.indexOf('unmaximize')).toBeLessThan(calls.indexOf('setSize(420x80)'));

    await sync(false);
    expect(state.maximized).toBe(true);
    // The un-maximized size must not stay mini-sized, nor become screen-sized.
    expect(state.size).toEqual(new LogicalSize(1024, 680));
  });

  it('leaves fullscreen before shrinking, and returns to fullscreen on exit', async () => {
    const { win, state, calls } = createFakeWindow({ fullscreen: true });
    const sync = createMiniWindowSync(win);

    await sync(true);
    expect(state.fullscreen).toBe(false);
    expect(state.size).toEqual(MINI_SIZE);
    expect(calls.indexOf('setFullscreen(false)')).toBeLessThan(calls.indexOf('setSize(420x80)'));

    await sync(false);
    expect(state.fullscreen).toBe(true);
    expect(state.size).toEqual(new LogicalSize(1024, 680));
  });

  it('keeps the last normal size across a later maximized round trip', async () => {
    const { win, state } = createFakeWindow({});
    const sync = createMiniWindowSync(win);
    await sync(true);
    await sync(false); // normal size 1200x800 captured

    state.maximized = true;
    await sync(true);
    await sync(false);

    expect(state.maximized).toBe(true);
    expect(state.size).toEqual(new LogicalSize(1200, 800));
  });

  it('applies rapid toggles in order', async () => {
    const { win, state } = createFakeWindow({ maximized: true });
    const sync = createMiniWindowSync(win);

    const first = sync(true);
    const second = sync(false);
    await Promise.all([first, second]);

    expect(state.maximized).toBe(true);
    expect(state.alwaysOnTop).toBe(false);
  });
});
