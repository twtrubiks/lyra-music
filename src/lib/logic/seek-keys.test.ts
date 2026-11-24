import { describe, it, expect } from 'vitest';
import { seekKeyTarget } from './seek-keys';

describe('seekKeyTarget', () => {
  it('steps 5 seconds with the arrow keys', () => {
    expect(seekKeyTarget('ArrowRight', 60, 200)).toBe(65);
    expect(seekKeyTarget('ArrowUp', 60, 200)).toBe(65);
    expect(seekKeyTarget('ArrowLeft', 60, 200)).toBe(55);
    expect(seekKeyTarget('ArrowDown', 60, 200)).toBe(55);
  });

  it('steps 30 seconds with PageUp / PageDown', () => {
    expect(seekKeyTarget('PageUp', 60, 200)).toBe(90);
    expect(seekKeyTarget('PageDown', 60, 200)).toBe(30);
  });

  it('jumps to the start and the end with Home / End', () => {
    expect(seekKeyTarget('Home', 60, 200)).toBe(0);
    expect(seekKeyTarget('End', 60, 200)).toBe(200);
  });

  it('clamps to the track bounds', () => {
    expect(seekKeyTarget('ArrowLeft', 2, 200)).toBe(0);
    expect(seekKeyTarget('ArrowRight', 198, 200)).toBe(200);
    expect(seekKeyTarget('PageUp', 190, 200)).toBe(200);
  });

  it('ignores other keys', () => {
    expect(seekKeyTarget('a', 60, 200)).toBeNull();
    expect(seekKeyTarget('Tab', 60, 200)).toBeNull();
    expect(seekKeyTarget(' ', 60, 200)).toBeNull();
  });

  it('does nothing when there is no track duration', () => {
    expect(seekKeyTarget('ArrowRight', 0, 0)).toBeNull();
  });
});
