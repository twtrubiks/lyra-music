export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

/** Gap kept between a context menu and the window edge. */
export const MENU_VIEWPORT_MARGIN = 8;

/**
 * Where to put a context menu opened at `click` so that it stays inside the viewport.
 * A menu larger than the viewport is pinned to the top-left margin.
 */
export function clampMenuPosition(click: Point, menu: Size, viewport: Size): Point {
  const maxX = viewport.width - menu.width - MENU_VIEWPORT_MARGIN;
  const maxY = viewport.height - menu.height - MENU_VIEWPORT_MARGIN;
  return {
    x: Math.max(MENU_VIEWPORT_MARGIN, Math.min(click.x, maxX)),
    y: Math.max(MENU_VIEWPORT_MARGIN, Math.min(click.y, maxY)),
  };
}
