import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import PlayButton from '$lib/components/Player/PlayButton.svelte';
import { setLocale } from './index.svelte';

describe('locale switch in a mounted component', () => {
  let target: HTMLElement;
  let component: ReturnType<typeof mount>;

  beforeEach(() => {
    localStorage.clear();
    setLocale('en');
    target = document.createElement('div');
    document.body.appendChild(target);
    component = mount(PlayButton, { target, props: { isPlaying: false, onclick: () => {} } });
  });

  afterEach(() => {
    unmount(component);
    target.remove();
  });

  it('updates rendered text in place, without remounting', () => {
    const button = target.querySelector('button');
    expect(button?.title).toBe('Play');

    setLocale('zh-TW');
    flushSync();

    expect(target.querySelector('button')).toBe(button);
    expect(button?.title).toBe('播放');
  });
});
