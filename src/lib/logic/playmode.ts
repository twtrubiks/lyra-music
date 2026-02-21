import type { RepeatMode } from '$lib/types';

/**
 * Fisher-Yates shuffle，生成洗牌後的索引陣列。
 * currentIndex 會被排在第一位（確保當前歌曲在 shuffle 後仍是第一首）。
 */
export function generateShuffledIndices(length: number, currentIndex: number): number[] {
  const indices = Array.from({ length }, (_, i) => i);

  // Fisher-Yates shuffle
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  // Move currentIndex to first position
  const pos = indices.indexOf(currentIndex);
  if (pos > 0) {
    [indices[0], indices[pos]] = [indices[pos], indices[0]];
  }

  return indices;
}

/**
 * 根據播放模式計算下一首的 queue index。
 * 回傳 null 表示應該停止播放。
 */
export function getNextIndex(
  currentIndex: number,
  queueLength: number,
  repeatMode: RepeatMode,
  shuffleEnabled: boolean,
  shuffledIndices: number[],
): number | null {
  if (queueLength === 0) return null;

  if (repeatMode === 'repeat-one') {
    return currentIndex;
  }

  if (shuffleEnabled && shuffledIndices.length === queueLength) {
    const shufflePos = shuffledIndices.indexOf(currentIndex);
    if (shufflePos < shuffledIndices.length - 1) {
      return shuffledIndices[shufflePos + 1];
    }
    // At end of shuffled list
    if (repeatMode === 'repeat-all') {
      return shuffledIndices[0];
    }
    return null;
  }

  // Sequential mode
  if (currentIndex < queueLength - 1) {
    return currentIndex + 1;
  }

  // At end of queue
  if (repeatMode === 'repeat-all') {
    return 0;
  }

  return null;
}

/**
 * 根據播放模式計算上一首的 queue index。
 * 回傳 null 表示已在開頭。
 */
export function getPrevIndex(
  currentIndex: number,
  queueLength: number,
  repeatMode: RepeatMode,
  shuffleEnabled: boolean,
  shuffledIndices: number[],
): number | null {
  if (queueLength === 0) return null;

  if (repeatMode === 'repeat-one') {
    return currentIndex;
  }

  if (shuffleEnabled && shuffledIndices.length === queueLength) {
    const shufflePos = shuffledIndices.indexOf(currentIndex);
    if (shufflePos > 0) {
      return shuffledIndices[shufflePos - 1];
    }
    // At start of shuffled list
    if (repeatMode === 'repeat-all') {
      return shuffledIndices[shuffledIndices.length - 1];
    }
    return null;
  }

  // Sequential mode
  if (currentIndex > 0) {
    return currentIndex - 1;
  }

  // At start of queue
  if (repeatMode === 'repeat-all') {
    return queueLength - 1;
  }

  return null;
}
