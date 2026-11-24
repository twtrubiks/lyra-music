import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@tauri-apps/plugin-log', () => ({
  error: vi.fn().mockResolvedValue(undefined),
  warn: vi.fn().mockResolvedValue(undefined),
}));

import * as pluginLog from '@tauri-apps/plugin-log';
import {
  createLogLimiter,
  describeError,
  installGlobalErrorLogging,
  logToFile,
  resetLogLimiterForTest,
  LOG_LIMIT_MAX,
} from './frontend-log';

const errorMock = vi.mocked(pluginLog.error);
const warnMock = vi.mocked(pluginLog.warn);

beforeEach(() => {
  errorMock.mockClear();
  errorMock.mockResolvedValue(undefined);
  warnMock.mockClear();
  resetLogLimiterForTest();
});

describe('createLogLimiter', () => {
  it('allows up to max entries per window, then blocks', () => {
    const allow = createLogLimiter(3, 1000);
    expect([allow(0), allow(1), allow(2)]).toEqual([true, true, true]);
    expect(allow(3)).toBe(false);
    expect(allow(999)).toBe(false);
  });

  it('opens a new window once the previous one has passed', () => {
    const allow = createLogLimiter(1, 1000);
    expect(allow(0)).toBe(true);
    expect(allow(500)).toBe(false);
    expect(allow(1000)).toBe(true);
    expect(allow(1001)).toBe(false);
  });
});

describe('describeError', () => {
  it('uses the stack of an Error when there is one', () => {
    const err = new Error('boom');
    err.stack = 'Error: boom\n    at f (app.js:1:2)';
    expect(describeError(err)).toBe('Error: boom\n    at f (app.js:1:2)');
  });

  it('prepends name and message when the stack lacks them (WebKit)', () => {
    const err = new Error('boom');
    err.stack = '@http://127.0.0.1/src/main.ts:10:17';
    expect(describeError(err)).toBe('Error: boom\n@http://127.0.0.1/src/main.ts:10:17');
  });

  it('falls back to name and message without a stack', () => {
    const err = new TypeError('bad');
    err.stack = undefined;
    expect(describeError(err)).toBe('TypeError: bad');
  });

  it('stringifies anything else', () => {
    expect(describeError('plain')).toBe('plain');
    expect(describeError(42)).toBe('42');
    expect(describeError(null)).toBe('null');
  });
});

describe('logToFile', () => {
  it('routes by level', () => {
    logToFile('error', 'a');
    logToFile('warn', 'b');
    expect(errorMock).toHaveBeenCalledWith('a');
    expect(warnMock).toHaveBeenCalledWith('b');
  });

  it('never throws or rejects when the backend call fails', async () => {
    errorMock.mockRejectedValue(new Error('no backend'));
    expect(() => logToFile('error', 'a')).not.toThrow();
    await Promise.resolve();
  });

  it('never throws when the backend call throws synchronously', () => {
    errorMock.mockImplementation(() => {
      throw new Error('no ipc');
    });
    expect(() => logToFile('error', 'a')).not.toThrow();
  });

  it('stops writing once the limit is reached', () => {
    for (let i = 0; i < LOG_LIMIT_MAX + 10; i++) logToFile('warn', `m${i}`);
    expect(warnMock).toHaveBeenCalledTimes(LOG_LIMIT_MAX);
  });
});

describe('installGlobalErrorLogging', () => {
  it('logs uncaught errors and unhandled rejections, and stops after uninstall', () => {
    const target = new EventTarget();
    const uninstall = installGlobalErrorLogging(target);

    const err = new Error('boom');
    err.stack = 'Error: boom\n    at f';
    target.dispatchEvent(Object.assign(new Event('error'), { error: err, message: 'boom' }));
    expect(errorMock).toHaveBeenLastCalledWith('uncaught error: Error: boom\n    at f');

    target.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: 'nope' }));
    expect(errorMock).toHaveBeenLastCalledWith('unhandled rejection: nope');

    uninstall();
    target.dispatchEvent(Object.assign(new Event('error'), { error: err }));
    expect(errorMock).toHaveBeenCalledTimes(2);
  });

  it('falls back to the event message when there is no error object', () => {
    const target = new EventTarget();
    installGlobalErrorLogging(target);
    target.dispatchEvent(
      Object.assign(new Event('error'), { error: null, message: 'Script error.' }),
    );
    expect(errorMock).toHaveBeenLastCalledWith('uncaught error: Script error.');
  });

  it('ignores the benign ResizeObserver loop notice', () => {
    const target = new EventTarget();
    installGlobalErrorLogging(target);
    for (const message of [
      'ResizeObserver loop completed with undelivered notifications.',
      'ResizeObserver loop limit exceeded',
    ]) {
      target.dispatchEvent(Object.assign(new Event('error'), { error: null, message }));
    }
    expect(errorMock).not.toHaveBeenCalled();
  });
});
