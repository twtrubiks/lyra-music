import type { Track } from '$lib/types';

let allTracks = $state<Track[]>([]);
let isScanning = $state(false);

export function getLibraryState() {
  return {
    get allTracks() {
      return allTracks;
    },
    set allTracks(v: Track[]) {
      allTracks = v;
    },
    get isScanning() {
      return isScanning;
    },
    set isScanning(v: boolean) {
      isScanning = v;
    },
  };
}
