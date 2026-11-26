/** Input types where the webview's own menu is still useful (copy / paste). */
const TEXT_INPUT_TYPES: ReadonlySet<string> = new Set([
  'text',
  'search',
  'number',
  'url',
  'email',
  'password',
  'tel',
]);

/** Whether a right-click on `target` should still open the webview's built-in menu. */
export function keepsNativeContextMenu(target: EventTarget | null): boolean {
  if (target instanceof HTMLTextAreaElement) return true;
  return target instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(target.type);
}

/**
 * Suppress the webview's built-in context menu (Back / Forward / Reload / Inspect Element),
 * which means nothing in a desktop app. Text fields keep it. The app's own context menus
 * are unaffected: they already call `preventDefault` themselves.
 *
 * Returns a function that removes the listener.
 */
export function installNativeContextMenuBlock(target: Document): () => void {
  const onContextMenu = (e: Event) => {
    if (!keepsNativeContextMenu(e.target)) e.preventDefault();
  };
  target.addEventListener('contextmenu', onContextMenu);
  return () => target.removeEventListener('contextmenu', onContextMenu);
}
