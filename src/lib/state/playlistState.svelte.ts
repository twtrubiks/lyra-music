import type { Playlist } from '$lib/types';

type ActiveView =
  | { kind: 'library' }
  | { kind: 'playlist'; playlistId: number }
  | { kind: 'artists' }
  | { kind: 'artist-detail'; artistName: string }
  | { kind: 'albums' }
  | { kind: 'album-detail'; albumName: string; artistName: string }
  | { kind: 'most-played' };

let playlists = $state<Playlist[]>([]);
let activeView = $state<ActiveView>({ kind: 'library' });
// Bumped when a playlist's tracks change outside the view showing it (files
// dropped into it); playlist views reload on change.
let tracksVersion = $state(0);

export function getPlaylistState() {
  return {
    get playlists() {
      return playlists;
    },
    set playlists(v: Playlist[]) {
      playlists = v;
    },
    get activeView() {
      return activeView;
    },
    set activeView(v: ActiveView) {
      activeView = v;
    },
    get tracksVersion() {
      return tracksVersion;
    },
    set tracksVersion(v: number) {
      tracksVersion = v;
    },
  };
}
