/**
 * Mock for @tauri-apps/api/core
 * All invoke calls are intercepted and can be controlled per-test.
 */
import { vi } from 'vitest';

// Default mock: resolve with undefined
export const invoke = vi.fn().mockResolvedValue(undefined);

/**
 * Helper to set up invoke mock responses for specific commands.
 * Usage:
 *   mockInvokeResponses({ get_all_tracks: [track1, track2] });
 */
export function mockInvokeResponses(responses: Record<string, unknown>) {
  invoke.mockImplementation((cmd: string, _args?: Record<string, unknown>) => {
    if (cmd in responses) {
      return Promise.resolve(responses[cmd]);
    }
    return Promise.resolve(undefined);
  });
}

/**
 * Helper to make invoke reject for a specific command.
 */
export function mockInvokeError(cmd: string, error: string) {
  invoke.mockImplementation((command: string) => {
    if (command === cmd) {
      return Promise.reject(new Error(error));
    }
    return Promise.resolve(undefined);
  });
}
