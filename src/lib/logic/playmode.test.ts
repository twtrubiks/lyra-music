import { describe, it, expect } from 'vitest';
import { generateShuffledIndices, getNextIndex, getPrevIndex } from './playmode';

describe('generateShuffledIndices', () => {
  it('returns array of correct length', () => {
    const result = generateShuffledIndices(5, 0);
    expect(result).toHaveLength(5);
  });

  it('places currentIndex at position 0', () => {
    const result = generateShuffledIndices(10, 7);
    expect(result[0]).toBe(7);
  });

  it('contains all indices', () => {
    const result = generateShuffledIndices(5, 2);
    expect(result.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
  });

  it('handles single element', () => {
    const result = generateShuffledIndices(1, 0);
    expect(result).toEqual([0]);
  });

  it('handles currentIndex at 0', () => {
    const result = generateShuffledIndices(5, 0);
    expect(result[0]).toBe(0);
    expect(result).toHaveLength(5);
  });
});

describe('getNextIndex', () => {
  it('returns next index in sequential mode', () => {
    expect(getNextIndex(0, 5, 'off', false, [])).toBe(1);
    expect(getNextIndex(3, 5, 'off', false, [])).toBe(4);
  });

  it('returns null at end in off mode', () => {
    expect(getNextIndex(4, 5, 'off', false, [])).toBeNull();
  });

  it('wraps to 0 in repeat-all mode', () => {
    expect(getNextIndex(4, 5, 'repeat-all', false, [])).toBe(0);
  });

  it('returns same index in repeat-one mode', () => {
    expect(getNextIndex(2, 5, 'repeat-one', false, [])).toBe(2);
  });

  it('returns null for empty queue', () => {
    expect(getNextIndex(0, 0, 'off', false, [])).toBeNull();
  });

  it('follows shuffle order', () => {
    const shuffled = [3, 1, 4, 0, 2];
    // currentIndex=3 is at shufflePos=0, next should be shuffled[1]=1
    expect(getNextIndex(3, 5, 'off', true, shuffled)).toBe(1);
  });

  it('returns null at end of shuffle in off mode', () => {
    const shuffled = [3, 1, 4, 0, 2];
    // currentIndex=2 is at shufflePos=4 (last), should return null
    expect(getNextIndex(2, 5, 'off', true, shuffled)).toBeNull();
  });

  it('wraps shuffle in repeat-all mode', () => {
    const shuffled = [3, 1, 4, 0, 2];
    // currentIndex=2 is at shufflePos=4 (last), should wrap to shuffled[0]=3
    expect(getNextIndex(2, 5, 'repeat-all', true, shuffled)).toBe(3);
  });

  it('repeat-one ignores shuffle', () => {
    const shuffled = [3, 1, 4, 0, 2];
    expect(getNextIndex(3, 5, 'repeat-one', true, shuffled)).toBe(3);
  });
});

describe('getPrevIndex', () => {
  it('returns previous index in sequential mode', () => {
    expect(getPrevIndex(3, 5, 'off', false, [])).toBe(2);
    expect(getPrevIndex(1, 5, 'off', false, [])).toBe(0);
  });

  it('returns null at start in off mode', () => {
    expect(getPrevIndex(0, 5, 'off', false, [])).toBeNull();
  });

  it('wraps to last in repeat-all mode', () => {
    expect(getPrevIndex(0, 5, 'repeat-all', false, [])).toBe(4);
  });

  it('returns same index in repeat-one mode', () => {
    expect(getPrevIndex(2, 5, 'repeat-one', false, [])).toBe(2);
  });

  it('returns null for empty queue', () => {
    expect(getPrevIndex(0, 0, 'off', false, [])).toBeNull();
  });

  it('follows shuffle order backwards', () => {
    const shuffled = [3, 1, 4, 0, 2];
    // currentIndex=4 is at shufflePos=2, prev should be shuffled[1]=1
    expect(getPrevIndex(4, 5, 'off', true, shuffled)).toBe(1);
  });

  it('returns null at start of shuffle in off mode', () => {
    const shuffled = [3, 1, 4, 0, 2];
    // currentIndex=3 is at shufflePos=0 (first), should return null
    expect(getPrevIndex(3, 5, 'off', true, shuffled)).toBeNull();
  });

  it('wraps shuffle backwards in repeat-all mode', () => {
    const shuffled = [3, 1, 4, 0, 2];
    // currentIndex=3 is at shufflePos=0 (first), should wrap to shuffled[4]=2
    expect(getPrevIndex(3, 5, 'repeat-all', true, shuffled)).toBe(2);
  });
});
