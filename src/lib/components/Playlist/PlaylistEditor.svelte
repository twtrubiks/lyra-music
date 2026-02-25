<script lang="ts">
  import type { Track, TrackDetails } from '$lib/types';
  import TrackList from '../Library/TrackList.svelte';
  import TrackPropertiesDialog from '../Library/TrackPropertiesDialog.svelte';
  import StatusBar from '../Library/StatusBar.svelte';
  import { getPlayerState } from '$lib/state/playerState.svelte';
  import { getLibraryState } from '$lib/state/libraryState.svelte';
  import { getPlaylistState } from '$lib/state/playlistState.svelte';
  import * as playlistApi from '$lib/api/playlist';
  import * as libraryApi from '$lib/api/library';
  import { startPlayingTrack, handleTrackRemoved } from '$lib/logic/playback-actions';
  import { notifyCritical } from '$lib/logic/error-handler';

  let {
    playlistId,
    playlistName,
  }: {
    playlistId: number;
    playlistName: string;
  } = $props();

  const player = getPlayerState();
  const library = getLibraryState();

  let tracks = $state<Track[]>([]);

  let showProperties = $state(false);
  let propertiesDetails = $state<TrackDetails | null>(null);

  async function loadTracks() {
    try {
      tracks = await playlistApi.getPlaylistTracks(playlistId);
    } catch (err) {
      notifyCritical('Load playlist tracks', err);
    }
  }

  async function handlePlay(track: Track) {
    await startPlayingTrack(track, tracks);
  }

  async function handleRemove(tracksToRemove: Track[]) {
    try {
      for (const track of tracksToRemove) {
        await playlistApi.removeFromPlaylist(playlistId, track.id);
      }
      const removedIds = new Set(tracksToRemove.map((t) => t.id));
      const playlistState = getPlaylistState();
      playlistState.playlists = playlistState.playlists.map((pl) =>
        pl.id === playlistId
          ? { ...pl, track_ids: pl.track_ids.filter((id) => !removedIds.has(id)) }
          : pl,
      );
      await loadTracks();
    } catch (err) {
      notifyCritical('Remove from playlist', err);
    }
  }

  async function handleTrash(tracksToTrash: Track[]) {
    try {
      for (const track of tracksToTrash) {
        await libraryApi.trashTrack(track.id);
        await handleTrackRemoved(track.id);
      }
      const ids = new Set(tracksToTrash.map((t) => t.id));
      library.allTracks = library.allTracks.filter((t) => !ids.has(t.id));
      await loadTracks();
    } catch (err) {
      notifyCritical('Trash tracks', err);
    }
  }

  async function handleProperties(track: Track) {
    try {
      propertiesDetails = await libraryApi.getTrackDetails(track.id);
      showProperties = true;
    } catch (err) {
      notifyCritical('Get track details', err);
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
