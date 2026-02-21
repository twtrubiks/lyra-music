<script lang="ts">
  import PlaylistEditor from './PlaylistEditor.svelte';
  import { getPlaylistState } from '$lib/state/playlistState.svelte';

  const playlistState = getPlaylistState();

  const activePlaylist = $derived.by(() => {
    const view = playlistState.activeView;
    if (view.kind !== 'playlist') return null;
    return playlistState.playlists.find((p) => p.id === view.playlistId) ?? null;
  });
</script>

{#if activePlaylist}
  <PlaylistEditor playlistId={activePlaylist.id} playlistName={activePlaylist.name} />
{/if}
