import type { Track, RepeatMode } from '$lib/types';

let currentTrack = $state<Track | null>(null);
let isPlaying = $state(false);
let positionSecs = $state(0);
let durationSecs = $state(0);
let volume = $state(0.5);
let playQueue = $state<Track[]>([]);
let currentIndex = $state(-1);

let shuffleEnabled = $state(false);
let repeatMode = $state<RepeatMode>('off');
let shuffledIndices = $state<number[]>([]);
let miniMode = $state(false);

const hasNext = $derived(currentIndex < playQueue.length - 1);
const hasPrev = $derived(currentIndex > 0);

export function getPlayerState() {
  return {
    get currentTrack() {
      return currentTrack;
    },
    set currentTrack(v: Track | null) {
      currentTrack = v;
    },
    get isPlaying() {
      return isPlaying;
    },
    set isPlaying(v: boolean) {
      isPlaying = v;
    },
    get positionSecs() {
      return positionSecs;
    },
    set positionSecs(v: number) {
      positionSecs = v;
    },
    get durationSecs() {
      return durationSecs;
    },
    set durationSecs(v: number) {
      durationSecs = v;
    },
    get volume() {
      return volume;
    },
    set volume(v: number) {
      volume = v;
    },
    get playQueue() {
      return playQueue;
    },
    set playQueue(v: Track[]) {
      playQueue = v;
    },
    get currentIndex() {
      return currentIndex;
    },
    set currentIndex(v: number) {
      currentIndex = v;
    },
    get hasNext() {
      return hasNext;
    },
    get hasPrev() {
      return hasPrev;
    },
    get shuffleEnabled() {
      return shuffleEnabled;
    },
    set shuffleEnabled(v: boolean) {
      shuffleEnabled = v;
    },
    get repeatMode() {
      return repeatMode;
    },
    set repeatMode(v: RepeatMode) {
      repeatMode = v;
    },
    get shuffledIndices() {
      return shuffledIndices;
    },
    set shuffledIndices(v: number[]) {
      shuffledIndices = v;
    },
    get miniMode() {
      return miniMode;
    },
    set miniMode(v: boolean) {
      miniMode = v;
    },
  };
}
