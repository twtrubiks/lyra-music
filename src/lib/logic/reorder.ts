/**
 * Pure function for reordering tracks in a playlist via keyboard/menu.
 * Follows the same pattern as selection.ts — no side effects, no imports.
 */

/**
 * Move all selected tracks one position up or down, preserving their relative order.
 *
 * @returns A new array of track IDs in the updated order, or `null` when the
 *          move is impossible (empty selection, already at boundary, stale IDs,
 *          or single-track list).
 */
export function moveByKeyboard(
  tracks: { id: number }[],
  selectedIds: Set<number>,
  direction: 'up' | 'down',
): number[] | null {
  if (selectedIds.size === 0 || tracks.length <= 1) return null;

  const ids = tracks.map((t) => t.id);

  // Collect indices of selected tracks (in display order)
  const selectedIndices: number[] = [];
  for (let i = 0; i < ids.length; i++) {
    if (selectedIds.has(ids[i])) selectedIndices.push(i);
  }

  // All selected IDs must exist in the tracks array
  if (selectedIndices.length !== selectedIds.size) return null;

  if (direction === 'up') {
    // Cannot move up if the first selected item is already at index 0
    if (selectedIndices[0] === 0) return null;
    // Swap each selected item with the item above it, top-to-bottom
    for (const idx of selectedIndices) {
      const tmp = ids[idx - 1];
      ids[idx - 1] = ids[idx];
      ids[idx] = tmp;
    }
  } else {
    // Cannot move down if the last selected item is already at the end
    if (selectedIndices[selectedIndices.length - 1] === ids.length - 1) return null;
    // Swap each selected item with the item below it, bottom-to-top
    for (let i = selectedIndices.length - 1; i >= 0; i--) {
      const idx = selectedIndices[i];
      const tmp = ids[idx + 1];
      ids[idx + 1] = ids[idx];
      ids[idx] = tmp;
    }
  }

  return ids;
}
