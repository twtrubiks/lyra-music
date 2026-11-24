/**
 * Window sizing for mini mode, kept apart from App.svelte so it can be
 * tested against a fake window.
 */
import { LogicalSize, type PhysicalSize } from '@tauri-apps/api/dpi';

export const MINI_SIZE = new LogicalSize(420, 80);

/** The subset of the Tauri window API that mini mode needs. */
export interface MiniWindow {
  isFullscreen(): Promise<boolean>;
  isMaximized(): Promise<boolean>;
  setFullscreen(fullscreen: boolean): Promise<void>;
  maximize(): Promise<void>;
  unmaximize(): Promise<void>;
  innerSize(): Promise<PhysicalSize>;
  scaleFactor(): Promise<number>;
  setSize(size: LogicalSize): Promise<void>;
  setAlwaysOnTop(alwaysOnTop: boolean): Promise<void>;
}

// Leaving fullscreen / the maximized state is asynchronous on some window
// managers; a resize issued before it lands is ignored.
const SETTLE_POLL_MS = 25;
const SETTLE_MAX_POLLS = 20;

async function waitUntilFloating(win: MiniWindow): Promise<void> {
  for (let i = 0; i < SETTLE_MAX_POLLS; i++) {
    const [fullscreen, maximized] = await Promise.all([win.isFullscreen(), win.isMaximized()]);
    if (!fullscreen && !maximized) return;
    await new Promise((resolve) => setTimeout(resolve, SETTLE_POLL_MS));
  }
}

/**
 * Returns `sync(mini)`, which resizes the window for entering or leaving
 * mini mode. A fullscreen or maximized window cannot be resized, so that
 * state is left first and restored on the way back. Calls are applied in
 * order even when toggled rapidly.
 */
export function createMiniWindowSync(win: MiniWindow): (mini: boolean) => Promise<void> {
  // Size to restore when leaving mini mode. Kept in logical pixels:
  // innerSize() reports physical pixels, so feeding it back through
  // LogicalSize would scale the window up on HiDPI displays.
  let normalSize = new LogicalSize(1024, 680);
  let wasFullscreen = false;
  let wasMaximized = false;
  let pending: Promise<void> = Promise.resolve();

  async function enter(): Promise<void> {
    [wasFullscreen, wasMaximized] = await Promise.all([win.isFullscreen(), win.isMaximized()]);
    if (wasFullscreen || wasMaximized) {
      // The current size is the screen's, not one worth restoring: keep the
      // last known floating size.
      if (wasFullscreen) await win.setFullscreen(false);
      if (wasMaximized) await win.unmaximize();
      await waitUntilFloating(win);
    } else {
      const [size, scaleFactor] = await Promise.all([win.innerSize(), win.scaleFactor()]);
      normalSize = size.toLogical(scaleFactor);
    }
    await win.setSize(MINI_SIZE);
    await win.setAlwaysOnTop(true);
  }

  async function leave(): Promise<void> {
    await win.setAlwaysOnTop(false);
    // Always restore the floating size, so un-maximizing later does not
    // drop the window back to the mini size.
    await win.setSize(normalSize);
    if (wasMaximized) await win.maximize();
    if (wasFullscreen) await win.setFullscreen(true);
    wasFullscreen = false;
    wasMaximized = false;
  }

  return (mini) => {
    const run = pending.then(() => (mini ? enter() : leave()));
    // A failed step must not block later toggles.
    pending = run.catch(() => {});
    return run;
  };
}
