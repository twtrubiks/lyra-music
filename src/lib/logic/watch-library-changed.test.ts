import { describe, it, expect, vi, beforeEach } from 'vitest';

type EventCallback = () => void;

const mockUnlisten = vi.fn();
let listenCallback: EventCallback | null = null;
let listenPromise: Promise<() => void>;

const mockListen = vi.fn((_event: string, cb: EventCallback) => {
  listenCallback = cb;
  return listenPromise;
});

vi.mock('@tauri-apps/api/event', () => ({
  listen: (...args: [string, EventCallback]) => mockListen(...args),
}));

import { watchLibraryChanged } from './watch-library-changed';

describe('watchLibraryChanged', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listenCallback = null;
    listenPromise = Promise.resolve(mockUnlisten);
  });

  it('subscribes to library-changed and forwards the notification', async () => {
    const onChanged = vi.fn();
    watchLibraryChanged(onChanged);
    await listenPromise;

    expect(mockListen).toHaveBeenCalledWith('library-changed', expect.any(Function));

    listenCallback!();

    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('unlistens when the returned cleanup runs after subscription resolves', async () => {
    const cleanup = watchLibraryChanged(vi.fn());
    await listenPromise;

    cleanup();

    expect(mockUnlisten).toHaveBeenCalledTimes(1);
  });

  it('unlistens even when cleanup runs before the subscription resolves', async () => {
    let resolveListen: (un: () => void) => void;
    listenPromise = new Promise((resolve) => {
      resolveListen = resolve;
    });

    const cleanup = watchLibraryChanged(vi.fn());
    cleanup(); // component destroyed before listen() resolved

    resolveListen!(mockUnlisten);
    await listenPromise;

    expect(mockUnlisten).toHaveBeenCalledTimes(1);
  });

  it('does not throw when the listen registration fails', async () => {
    listenPromise = Promise.reject(new Error('no tauri'));

    expect(() => watchLibraryChanged(vi.fn())).not.toThrow();
    await listenPromise.catch(() => undefined);
    await Promise.resolve(); // let the internal .catch settle
  });
});
