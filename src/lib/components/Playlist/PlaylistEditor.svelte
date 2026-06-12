<script lang="ts">
  import type { Track, TrackDetails } from '$lib/types';
  import TrackList from '../Library/TrackList.svelte';
  import TrackPropertiesDialog from '../Library/TrackPropertiesDialog.svelte';
  import StatusBar from '../Library/StatusBar.svelte';
  import { getPlayerState } from '$lib/state/playerState.svelte';
  import { getPlaylistState } from '$lib/state/playlistState.svelte';
  import * as playlistApi from '$lib/api/playlist';
  import * as libraryApi from '$lib/api/library';
  import { startPlayingTrack } from '$lib/logic/playback-actions';
  import { optimisticTrash, optimisticPlaylistRemove } from '$lib/logic/track-actions';
  import { notifyCritical } from '$lib/logic/error-handler';

  let {
    playlistId,
    playlistName,
  }: {
    playlistId: number;
    playlistName: string;
  } = $props();

  const player = getPlayerState();

  let tracks = $state<Track[]>([]);

  let showProperties = $state(false);
  let propertiesDetails = $state<TrackDetails | null>(null);

  /**
   * Monotonically increasing id of the latest load. Switching playlists
   * reuses this component instance, so a slow response for the previous
   * playlist must not overwrite the tracks of the one shown now.
   */
  let loadEpoch = 0;

  async function loadTracks() {
    const epoch = ++loadEpoch;
    try {
      const loaded = await playlistApi.getPlaylistTracks(playlistId);
      if (epoch === loadEpoch) {
        tracks = loaded;
      }
    } catch (err) {
      if (epoch === loadEpoch) {
        notifyCritical('Load playlist tracks', err);
      }
    }
  }

  async function handlePlay(track: Track) {
    await startPlayingTrack(track, tracks);
  }

  async function handleRemove(tracksToRemove: Track[]) {
    await optimisticPlaylistRemove(playlistId, tracksToRemove, {
      onComplete: loadTracks,
    });
  }

  async function handleTrash(tracksToTrash: Track[]) {
    await optimisticTrash(tracksToTrash, {
      getLocalTracks: () => tracks,
      setLocalTracks: (v) => {
        tracks = v;
      },
      onComplete: loadTracks,
    });
  }

  async function handleProperties(track: Track) {
    try {
      propertiesDetails = await libraryApi.getTrackDetails(track.id);
      showProperties = true;
    } catch (err) {
      notifyCritical('Get track details', err);
    }
  }

  async function handleReorder(trackIds: number[]) {
    // Optimistic update
    const trackMap = new Map(tracks.map((t) => [t.id, t]));
    tracks = trackIds.map((id) => trackMap.get(id)!).filter(Boolean);
    // Update playlistState
    const playlistState = getPlaylistState();
    playlistState.playlists = playlistState.playlists.map((pl) =>
      pl.id === playlistId ? { ...pl, track_ids: trackIds } : pl,
    );
    try {
      await playlistApi.reorderPlaylist(playlistId, trackIds);
    } catch (err) {
      notifyCritical('Reorder playlist', err);
      await loadTracks(); // fallback
    }
  }

  $effect(() => {
    void playlistId;
    loadTracks();
  });
</script>

<div class="playlist-editor">
  <div class="header">
    <h2>{playlistName}</h2>
  </div>

  <TrackList
    {tracks}
    currentTrackId={player.currentTrack?.id ?? null}
    onplay={handlePlay}
    onremove={handleRemove}
    ontrash={handleTrash}
    onproperties={handleProperties}
    onreorder={handleReorder}
  />

  <StatusBar {tracks} />
</div>

{#if showProperties && propertiesDetails}
  <TrackPropertiesDialog
    details={propertiesDetails}
    onclose={() => {
      showProperties = false;
      propertiesDetails = null;
    }}
  />
{/if}

<style>
  .playlist-editor {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 20px;
  }

  .header {
    display: flex;
    align-items: baseline;
    gap: 12px;
    margin-bottom: 16px;
    flex-shrink: 0;
  }

  h2 {
    margin: 0;
    font-size: 22px;
    font-weight: 700;
    color: #eee;
  }
</style>
