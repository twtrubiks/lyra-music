import { describe, it, expect } from 'vitest';
import { installNativeContextMenuBlock, keepsNativeContextMenu } from './native-context-menu';

function input(type: string): HTMLInputElement {
  const el = document.createElement('input');
  el.type = type;
  return el;
}

describe('keepsNativeContextMenu', () => {
  it('keeps the menu on text inputs and textareas (copy / paste)', () => {
    expect(keepsNativeContextMenu(input('text'))).toBe(true);
    expect(keepsNativeContextMenu(input('search'))).toBe(true);
    expect(keepsNativeContextMenu(document.createElement('textarea'))).toBe(true);
  });

  it('does not keep it on non-text inputs such as sliders', () => {
    expect(keepsNativeContextMenu(input('range'))).toBe(false);
    expect(keepsNativeContextMenu(input('checkbox'))).toBe(false);
  });

  it('does not keep it on ordinary elements or non-elements', () => {
    expect(keepsNativeContextMenu(document.createElement('div'))).toBe(false);
    expect(keepsNativeContextMenu(document.createElement('button'))).toBe(false);
    expect(keepsNativeContextMenu(null)).toBe(false);
  });
});

describe('installNativeContextMenuBlock', () => {
  function rightClick(el: Element): boolean {
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    el.dispatchEvent(event);
    return event.defaultPrevented;
  }

  it('blocks the native menu on empty areas but not in text fields', () => {
    const uninstall = installNativeContextMenuBlock(document);
    const div = document.body.appendChild(document.createElement('div'));
    const field = document.body.appendChild(input('text'));

    expect(rightClick(div)).toBe(true);
    expect(rightClick(field)).toBe(false);

    uninstall();
    expect(rightClick(div)).toBe(false);
    div.remove();
    field.remove();
  });
});
