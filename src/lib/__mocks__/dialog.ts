/**
 * Mock for @tauri-apps/plugin-dialog
 */
import { vi } from 'vitest';

export const open = vi.fn().mockResolvedValue(null);
