import { error as logError, warn as logWarn } from '@tauri-apps/plugin-log';

/**
 * Frontend errors go to the same log file as the backend's (lyra.log), so a
 * user reporting a problem has them — a packaged app has no devtools console.
 */

/** At most this many entries per window; the rest are dropped. */
export const LOG_LIMIT_MAX = 30;
export const LOG_LIMIT_WINDOW_MS = 60_000;

/**
 * Fixed-window limiter: an error raised on every frame or every poll must not
 * flood the size-capped log file and push everything else out of it.
 */
export function createLogLimiter(max: number, windowMs: number): (now: number) => boolean {
  let windowStart = -Infinity;
  let count = 0;
  return (now) => {
    if (now - windowStart >= windowMs) {
      windowStart = now;
      count = 0;
    }
    count += 1;
    return count <= max;
  };
}

let allow = createLogLimiter(LOG_LIMIT_MAX, LOG_LIMIT_WINDOW_MS);

export function resetLogLimiterForTest(): void {
  allow = createLogLimiter(LOG_LIMIT_MAX, LOG_LIMIT_WINDOW_MS);
}

/**
 * Appends to the log file. Fire-and-forget, and never throws: a failing log
 * must not raise another error (which would be logged, and fail again).
 */
export function logToFile(level: 'error' | 'warn', message: string): void {
  if (!allow(Date.now())) return;
  try {
    void (level === 'error' ? logError : logWarn)(message).catch(() => {});
  } catch {
    // No IPC (tests, plain browser): nowhere to write.
  }
}

/**
 * An Error as "Name: message" plus its stack, anything else as a string.
 * V8 stacks already start with the message; WebKit's (the webview on Linux
 * and macOS) hold only the frames, so the message is added when missing.
 */
export function describeError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const summary = `${err.name}: ${err.message}`;
  if (!err.stack) return summary;
  return err.stack.startsWith(summary) ? err.stack : `${summary}\n${err.stack}`;
}

/**
 * The browser reports "ResizeObserver loop completed with undelivered
 * notifications." (older engines: "... loop limit exceeded") as an error event
 * whenever an observer callback changes layout; the notifications are simply
 * delivered on the next frame. Not a bug, and it fires on every resize.
 */
const RESIZE_OBSERVER_NOTICE = 'ResizeObserver loop';

/**
 * Logs errors nothing caught: uncaught exceptions and unhandled promise
 * rejections. These are the "clicked and nothing happened" bugs, invisible
 * without a console. Returns a function that removes the listeners.
 */
export function installGlobalErrorLogging(target: EventTarget): () => void {
  const onError = (e: Event) => {
    const { error, message } = e as ErrorEvent;
    if (error == null && message.startsWith(RESIZE_OBSERVER_NOTICE)) return;
    logToFile('error', `uncaught error: ${error == null ? message : describeError(error)}`);
  };
  const onRejection = (e: Event) => {
    logToFile(
      'error',
      `unhandled rejection: ${describeError((e as PromiseRejectionEvent).reason)}`,
    );
  };
  target.addEventListener('error', onError);
  target.addEventListener('unhandledrejection', onRejection);
  return () => {
    target.removeEventListener('error', onError);
    target.removeEventListener('unhandledrejection', onRejection);
  };
}
