mod common;

use lyra_music_lib::storage::library_repo;
use lyra_music_lib::storage::playlist_repo;

// ============================================================
// Track CRUD tests
// ============================================================

#[test]
fn test_insert_and_get_tracks() {
    let conn = common::create_test_db();
    let track = common::create_test_track(1);

    let id = library_repo::insert_track(&conn, &track).unwrap();
    assert!(id > 0);

    let tracks = library_repo::get_all_tracks(&conn).unwrap();
    assert_eq!(tracks.len(), 1);
    assert_eq!(tracks[0].title, "Test Track 1");
    assert_eq!(tracks[0].artist, "Artist 1");
    assert_eq!(tracks[0].album, "Album 1");
}

#[test]
fn test_insert_multiple_tracks() {
    let conn = common::create_test_db();

    for i in 1..=5 {
        let track = common::create_test_track(i);
        library_repo::insert_track(&conn, &track).unwrap();
    }

    let tracks = library_repo::get_all_tracks(&conn).unwrap();
    assert_eq!(tracks.len(), 5);
}

#[test]
fn test_duplicate_file_path_no_error() {
    let conn = common::create_test_db();
    let track = common::create_test_track(1);

    let id1 = library_repo::insert_track(&conn, &track).unwrap();
    // Insert same track again -- should not error (INSERT OR IGNORE)
    let id2 = library_repo::insert_track(&conn, &track).unwrap();

    assert_eq!(id1, id2);

    let tracks = library_repo::get_all_tracks(&conn).unwrap();
    assert_eq!(tracks.len(), 1);
}

#[test]
fn test_get_track_by_id() {
    let conn = common::create_test_db();
    let track = common::create_test_track(1);
    let id = library_repo::insert_track(&conn, &track).unwrap();

    let found = library_repo::get_track_by_id(&conn, id).unwrap();
    assert!(found.is_some());
    let found = found.unwrap();
    assert_eq!(found.id, id);
    assert_eq!(found.title, "Test Track 1");
}

#[test]
fn test_get_track_by_id_not_found() {
    let conn = common::create_test_db();
    let found = library_repo::get_track_by_id(&conn, 9999).unwrap();
    assert!(found.is_none());
}

#[test]
fn test_get_track_cover_none() {
    let conn = common::create_test_db();
    let track = common::create_test_track(1);
    let id = library_repo::insert_track(&conn, &track).unwrap();

    let cover = library_repo::get_track_cover_path(&conn, id).unwrap();
    assert!(cover.is_none());
}

#[test]
fn test_get_track_cover_with_data() {
    let conn = common::create_test_db();
    let mut track = common::create_test_track(1);
    track.cover_art_path = Some("/tmp/covers/1.jpg".to_string());
    let id = library_repo::insert_track(&conn, &track).unwrap();

    let cover = library_repo::get_track_cover_path(&conn, id).unwrap();
    assert!(cover.is_some());
    assert!(cover.unwrap().starts_with("/tmp/covers/"));
}

#[test]
fn test_search_tracks_by_title() {
    let conn = common::create_test_db();
    for i in 1..=3 {
        library_repo::insert_track(&conn, &common::create_test_track(i)).unwrap();
    }

    let results = library_repo::search_tracks(&conn, "Track 2").unwrap();
    assert_eq!(results.len(), 1);
    assert_eq!(results[0].title, "Test Track 2");
}

#[test]
fn test_search_tracks_by_artist() {
    let conn = common::create_test_db();
    for i in 1..=3 {
        library_repo::insert_track(&conn, &common::create_test_track(i)).unwrap();
    }

    let results = library_repo::search_tracks(&conn, "Artist 1").unwrap();
    assert_eq!(results.len(), 1);
}

#[test]
fn test_search_tracks_no_match() {
    let conn = common::create_test_db();
    library_repo::insert_track(&conn, &common::create_test_track(1)).unwrap();

    let results = library_repo::search_tracks(&conn, "nonexistent").unwrap();
    assert!(results.is_empty());
}

#[test]
fn test_file_size_bytes_stored_and_retrieved() {
    let conn = common::create_test_db();
    let mut track = common::create_test_track(1);
    track.file_size_bytes = 5_242_880; // 5 MB

    let id = library_repo::insert_track(&conn, &track).unwrap();
    let found = library_repo::get_track_by_id(&conn, id).unwrap().unwrap();
    assert_eq!(found.file_size_bytes, 5_242_880);

    let all = library_repo::get_all_tracks(&conn).unwrap();
    assert_eq!(all[0].file_size_bytes, 5_242_880);

    let searched = library_repo::search_tracks(&conn, "Test Track 1").unwrap();
    assert_eq!(searched[0].file_size_bytes, 5_242_880);
}

// ============================================================
// Delete track tests
// ============================================================

#[test]
fn test_delete_track_basic() {
    let conn = common::create_test_db();
    let track = common::create_test_track(1);
    let id = library_repo::insert_track(&conn, &track).unwrap();

    library_repo::delete_track(&conn, id).unwrap();

    let tracks = library_repo::get_all_tracks(&conn).unwrap();
    assert!(tracks.is_empty());
}

#[test]
fn test_delete_track_cascade_removes_from_playlist() {
    let conn = common::create_test_db();
    let track = common::create_test_track(1);
    let t_id = library_repo::insert_track(&conn, &track).unwrap();

    let pl_id = playlist_repo::create_playlist(&conn, "Test PL").unwrap();
    playlist_repo::add_to_playlist(&conn, pl_id, t_id).unwrap();

    library_repo::delete_track(&conn, t_id).unwrap();

    let pl_tracks = playlist_repo::get_playlist_tracks(&conn, pl_id).unwrap();
    assert!(pl_tracks.is_empty());

    // Playlist itself should still exist
    let playlists = playlist_repo::get_all_playlists(&conn).unwrap();
    assert_eq!(playlists.len(), 1);
}

#[test]
fn test_delete_track_in_multiple_playlists() {
    let conn = common::create_test_db();
    let track = common::create_test_track(1);
    let t_id = library_repo::insert_track(&conn, &track).unwrap();

    let pl1 = playlist_repo::create_playlist(&conn, "PL 1").unwrap();
    let pl2 = playlist_repo::create_playlist(&conn, "PL 2").unwrap();
    let pl3 = playlist_repo::create_playlist(&conn, "PL 3").unwrap();
    playlist_repo::add_to_playlist(&conn, pl1, t_id).unwrap();
    playlist_repo::add_to_playlist(&conn, pl2, t_id).unwrap();
    playlist_repo::add_to_playlist(&conn, pl3, t_id).unwrap();

    library_repo::delete_track(&conn, t_id).unwrap();

    assert!(playlist_repo::get_playlist_tracks(&conn, pl1)
        .unwrap()
        .is_empty());
    assert!(playlist_repo::get_playlist_tracks(&conn, pl2)
        .unwrap()
        .is_empty());
    assert!(playlist_repo::get_playlist_tracks(&conn, pl3)
        .unwrap()
        .is_empty());
}

#[test]
fn test_delete_nonexistent_track_no_error() {
    let conn = common::create_test_db();
    let result = library_repo::delete_track(&conn, 9999);
    assert!(result.is_ok());
}

#[test]
fn test_delete_track_other_tracks_unaffected() {
    let conn = common::create_test_db();
    let id1 = library_repo::insert_track(&conn, &common::create_test_track(1)).unwrap();
    let id2 = library_repo::insert_track(&conn, &common::create_test_track(2)).unwrap();
    let id3 = library_repo::insert_track(&conn, &common::create_test_track(3)).unwrap();

    library_repo::delete_track(&conn, id2).unwrap();

    let tracks = library_repo::get_all_tracks(&conn).unwrap();
    assert_eq!(tracks.len(), 2);
    let ids: Vec<i64> = tracks.iter().map(|t| t.id).collect();
    assert!(ids.contains(&id1));
    assert!(ids.contains(&id3));
}

// ============================================================
// Playlist CRUD tests
// ============================================================

#[test]
fn test_create_playlist() {
    let conn = common::create_test_db();
    let id = playlist_repo::create_playlist(&conn, "My Playlist").unwrap();
    assert!(id > 0);

    let playlists = playlist_repo::get_all_playlists(&conn).unwrap();
    assert_eq!(playlists.len(), 1);
    assert_eq!(playlists[0].name, "My Playlist");
    assert!(playlists[0].track_ids.is_empty());
}

#[test]
fn test_add_tracks_to_playlist() {
    let conn = common::create_test_db();

    let t1_id = library_repo::insert_track(&conn, &common::create_test_track(1)).unwrap();
    let t2_id = library_repo::insert_track(&conn, &common::create_test_track(2)).unwrap();

    let pl_id = playlist_repo::create_playlist(&conn, "Test PL").unwrap();
    playlist_repo::add_to_playlist(&conn, pl_id, t1_id).unwrap();
    playlist_repo::add_to_playlist(&conn, pl_id, t2_id).unwrap();

    let tracks = playlist_repo::get_playlist_tracks(&conn, pl_id).unwrap();
    assert_eq!(tracks.len(), 2);
    assert_eq!(tracks[0].id, t1_id);
    assert_eq!(tracks[1].id, t2_id);
}

#[test]
fn test_remove_from_playlist() {
    let conn = common::create_test_db();
    let t1_id = library_repo::insert_track(&conn, &common::create_test_track(1)).unwrap();
    let t2_id = library_repo::insert_track(&conn, &common::create_test_track(2)).unwrap();

    let pl_id = playlist_repo::create_playlist(&conn, "Test PL").unwrap();
    playlist_repo::add_to_playlist(&conn, pl_id, t1_id).unwrap();
    playlist_repo::add_to_playlist(&conn, pl_id, t2_id).unwrap();
    playlist_repo::remove_from_playlist(&conn, pl_id, t1_id).unwrap();

    let tracks = playlist_repo::get_playlist_tracks(&conn, pl_id).unwrap();
    assert_eq!(tracks.len(), 1);
    assert_eq!(tracks[0].id, t2_id);
}

#[test]
fn test_reorder_playlist() {
    let conn = common::create_test_db();
    let t1 = library_repo::insert_track(&conn, &common::create_test_track(1)).unwrap();
    let t2 = library_repo::insert_track(&conn, &common::create_test_track(2)).unwrap();
    let t3 = library_repo::insert_track(&conn, &common::create_test_track(3)).unwrap();

    let pl_id = playlist_repo::create_playlist(&conn, "Reorder PL").unwrap();
    playlist_repo::add_to_playlist(&conn, pl_id, t1).unwrap();
    playlist_repo::add_to_playlist(&conn, pl_id, t2).unwrap();
    playlist_repo::add_to_playlist(&conn, pl_id, t3).unwrap();

    // Reverse order
    playlist_repo::reorder_playlist(&conn, pl_id, &[t3, t1, t2]).unwrap();

    let tracks = playlist_repo::get_playlist_tracks(&conn, pl_id).unwrap();
    assert_eq!(tracks.len(), 3);
    assert_eq!(tracks[0].id, t3);
    assert_eq!(tracks[1].id, t1);
    assert_eq!(tracks[2].id, t2);
}

#[test]
fn test_save_and_get_playback_position() {
    let conn = common::create_test_db();
    let t_id = library_repo::insert_track(&conn, &common::create_test_track(1)).unwrap();
    let pl_id = playlist_repo::create_playlist(&conn, "Pos PL").unwrap();

    playlist_repo::save_playback_position(&conn, pl_id, t_id, 42.5).unwrap();

    let (track, secs) = playlist_repo::get_last_playback_position(&conn, pl_id).unwrap();
    assert_eq!(track, Some(t_id));
    assert_eq!(secs, Some(42.5));
}

#[test]
fn test_playback_position_default_none() {
    let conn = common::create_test_db();
    let pl_id = playlist_repo::create_playlist(&conn, "Empty PL").unwrap();

    let (track, secs) = playlist_repo::get_last_playback_position(&conn, pl_id).unwrap();
    assert!(track.is_none());
    // Default in schema is 0.0 for last_position_secs
    assert_eq!(secs, Some(0.0));
}

#[test]
fn test_delete_playlist_cascade() {
    let conn = common::create_test_db();
    let t_id = library_repo::insert_track(&conn, &common::create_test_track(1)).unwrap();
    let pl_id = playlist_repo::create_playlist(&conn, "Delete PL").unwrap();
    playlist_repo::add_to_playlist(&conn, pl_id, t_id).unwrap();

    // Verify track is in playlist
    let tracks = playlist_repo::get_playlist_tracks(&conn, pl_id).unwrap();
    assert_eq!(tracks.len(), 1);

    // Delete playlist -- should cascade-delete playlist_tracks
    playlist_repo::delete_playlist(&conn, pl_id).unwrap();

    let playlists = playlist_repo::get_all_playlists(&conn).unwrap();
    assert!(playlists.is_empty());

    // Verify playlist_tracks are gone
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM playlist_tracks WHERE playlist_id = ?1",
            rusqlite::params![pl_id],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(count, 0);

    // The track itself should still exist
    let all_tracks = library_repo::get_all_tracks(&conn).unwrap();
    assert_eq!(all_tracks.len(), 1);
}

#[test]
fn test_get_all_playlists_includes_track_ids() {
    let conn = common::create_test_db();
    let t1 = library_repo::insert_track(&conn, &common::create_test_track(1)).unwrap();
    let t2 = library_repo::insert_track(&conn, &common::create_test_track(2)).unwrap();

    let pl_id = playlist_repo::create_playlist(&conn, "With Tracks").unwrap();
    playlist_repo::add_to_playlist(&conn, pl_id, t1).unwrap();
    playlist_repo::add_to_playlist(&conn, pl_id, t2).unwrap();

    let playlists = playlist_repo::get_all_playlists(&conn).unwrap();
    assert_eq!(playlists.len(), 1);
    assert_eq!(playlists[0].track_ids, vec![t1, t2]);
}

#[test]
fn test_multiple_playlists() {
    let conn = common::create_test_db();
    playlist_repo::create_playlist(&conn, "PL 1").unwrap();
    playlist_repo::create_playlist(&conn, "PL 2").unwrap();
    playlist_repo::create_playlist(&conn, "PL 3").unwrap();

    let playlists = playlist_repo::get_all_playlists(&conn).unwrap();
    assert_eq!(playlists.len(), 3);
}

#[test]
fn test_get_playback_position_nonexistent_playlist() {
    let conn = common::create_test_db();
    let (track, secs) = playlist_repo::get_last_playback_position(&conn, 9999).unwrap();
    assert!(track.is_none());
    assert!(secs.is_none());
}

// ============================================================
// Cover art cleanup tests (Task 17)
// The actual file cleanup is in commands/library.rs::remove_track,
// which calls get_track_cover_path + fs::remove_file before deleting.
// Here we test the underlying repo-level behavior and simulate
// the cleanup pattern.
// ============================================================

#[test]
fn test_cover_art_path_removed_with_track() {
    let conn = common::create_test_db();
    let dir = tempfile::tempdir().expect("failed to create temp dir");

    // Create a fake cover art file
    let cover_path = dir.path().join("cover_1.jpg");
    std::fs::write(&cover_path, b"fake jpeg data").unwrap();
    assert!(cover_path.exists());

    // Insert track with cover art path
    let mut track = common::create_test_track(1);
    track.cover_art_path = Some(cover_path.to_str().unwrap().to_string());
    let id = library_repo::insert_track(&conn, &track).unwrap();

    // Verify cover art path is stored
    let stored_path = library_repo::get_track_cover_path(&conn, id).unwrap();
    assert!(stored_path.is_some());

    // Simulate what commands::remove_track does:
    // 1. Get cover art path before deleting
    if let Ok(Some(path)) = library_repo::get_track_cover_path(&conn, id) {
        let _ = std::fs::remove_file(&path);
    }
    // 2. Delete the track
    library_repo::delete_track(&conn, id).unwrap();

    // Verify cover art file is deleted
    assert!(!cover_path.exists(), "cover art file should be deleted");

    // Verify track is gone from DB
    let found = library_repo::get_track_by_id(&conn, id).unwrap();
    assert!(found.is_none());
}

#[test]
fn test_cover_art_cleanup_with_no_cover() {
    let conn = common::create_test_db();

    // Insert track without cover art
    let track = common::create_test_track(1);
    let id = library_repo::insert_track(&conn, &track).unwrap();

    // Cover path should be None
    let cover_path = library_repo::get_track_cover_path(&conn, id).unwrap();
    assert!(cover_path.is_none());

    // Simulate cleanup pattern — should not error even with no cover
    if let Ok(Some(path)) = library_repo::get_track_cover_path(&conn, id) {
        let _ = std::fs::remove_file(&path);
    }
    library_repo::delete_track(&conn, id).unwrap();

    let found = library_repo::get_track_by_id(&conn, id).unwrap();
    assert!(found.is_none());
}

#[test]
fn test_cover_art_cleanup_file_already_gone() {
    let conn = common::create_test_db();

    // Insert track pointing to a non-existent cover art file
    let mut track = common::create_test_track(1);
    track.cover_art_path = Some("/tmp/nonexistent_cover_12345.jpg".to_string());
    let id = library_repo::insert_track(&conn, &track).unwrap();

    // Simulate cleanup — removing a non-existent file should not panic
    if let Ok(Some(path)) = library_repo::get_track_cover_path(&conn, id) {
        let _ = std::fs::remove_file(&path); // Ignores error
    }
    library_repo::delete_track(&conn, id).unwrap();

    let found = library_repo::get_track_by_id(&conn, id).unwrap();
    assert!(found.is_none());
}

#[test]
fn test_cover_art_multiple_tracks_independent_cleanup() {
    let conn = common::create_test_db();
    let dir = tempfile::tempdir().expect("failed to create temp dir");

    // Create two cover art files
    let cover1 = dir.path().join("cover_1.jpg");
    let cover2 = dir.path().join("cover_2.jpg");
    std::fs::write(&cover1, b"cover 1").unwrap();
    std::fs::write(&cover2, b"cover 2").unwrap();

    let mut t1 = common::create_test_track(1);
    t1.cover_art_path = Some(cover1.to_str().unwrap().to_string());
    let id1 = library_repo::insert_track(&conn, &t1).unwrap();

    let mut t2 = common::create_test_track(2);
    t2.cover_art_path = Some(cover2.to_str().unwrap().to_string());
    let id2 = library_repo::insert_track(&conn, &t2).unwrap();

    // Delete only track 1 with cleanup
    if let Ok(Some(path)) = library_repo::get_track_cover_path(&conn, id1) {
        let _ = std::fs::remove_file(&path);
    }
    library_repo::delete_track(&conn, id1).unwrap();

    // Cover 1 should be gone, cover 2 should still exist
    assert!(!cover1.exists(), "cover_1 should be deleted");
    assert!(cover2.exists(), "cover_2 should still exist");

    // Track 2 should still be in the DB
    let found = library_repo::get_track_by_id(&conn, id2).unwrap();
    assert!(found.is_some());
}

// ============================================================
// Playlist validation tests (Task 18)
// ============================================================

#[test]
fn test_reorder_playlist_with_invalid_track_id_returns_error() {
    let conn = common::create_test_db();
    let t1 = library_repo::insert_track(&conn, &common::create_test_track(1)).unwrap();
    let t2 = library_repo::insert_track(&conn, &common::create_test_track(2)).unwrap();

    let pl_id = playlist_repo::create_playlist(&conn, "Validate PL").unwrap();
    playlist_repo::add_to_playlist(&conn, pl_id, t1).unwrap();
    playlist_repo::add_to_playlist(&conn, pl_id, t2).unwrap();

    // Try to reorder with an ID that doesn't belong to the playlist
    let result = playlist_repo::reorder_playlist(&conn, pl_id, &[t1, 9999]);
    assert!(result.is_err(), "reorder with invalid track ID should fail");
}

#[test]
fn test_reorder_playlist_with_missing_track_returns_error() {
    let conn = common::create_test_db();
    let t1 = library_repo::insert_track(&conn, &common::create_test_track(1)).unwrap();
    let t2 = library_repo::insert_track(&conn, &common::create_test_track(2)).unwrap();
    let t3 = library_repo::insert_track(&conn, &common::create_test_track(3)).unwrap();

    let pl_id = playlist_repo::create_playlist(&conn, "Validate PL 2").unwrap();
    playlist_repo::add_to_playlist(&conn, pl_id, t1).unwrap();
    playlist_repo::add_to_playlist(&conn, pl_id, t2).unwrap();
    playlist_repo::add_to_playlist(&conn, pl_id, t3).unwrap();

    // Try to reorder with only 2 of 3 tracks — but with an invalid one
    let result = playlist_repo::reorder_playlist(&conn, pl_id, &[t1, t2, 8888]);
    assert!(
        result.is_err(),
        "reorder with non-member track ID should fail"
    );
}

#[test]
fn test_reorder_playlist_valid_ids_succeeds() {
    let conn = common::create_test_db();
    let t1 = library_repo::insert_track(&conn, &common::create_test_track(1)).unwrap();
    let t2 = library_repo::insert_track(&conn, &common::create_test_track(2)).unwrap();

    let pl_id = playlist_repo::create_playlist(&conn, "Valid Reorder").unwrap();
    playlist_repo::add_to_playlist(&conn, pl_id, t1).unwrap();
    playlist_repo::add_to_playlist(&conn, pl_id, t2).unwrap();

    // Valid reorder (reverse)
    let result = playlist_repo::reorder_playlist(&conn, pl_id, &[t2, t1]);
    assert!(
        result.is_ok(),
        "reorder with valid track IDs should succeed"
    );

    let tracks = playlist_repo::get_playlist_tracks(&conn, pl_id).unwrap();
    assert_eq!(tracks[0].id, t2);
    assert_eq!(tracks[1].id, t1);
}

#[test]
fn test_reorder_empty_playlist_with_empty_list_succeeds() {
    let conn = common::create_test_db();
    let pl_id = playlist_repo::create_playlist(&conn, "Empty Reorder").unwrap();

    // Reordering an empty playlist with an empty list should succeed
    let result = playlist_repo::reorder_playlist(&conn, pl_id, &[]);
    assert!(
        result.is_ok(),
        "reorder empty playlist with empty list should succeed"
    );
}

#[test]
fn test_reorder_with_duplicate_track_ids_returns_error() {
    let conn = common::create_test_db();
    let t1 = library_repo::insert_track(&conn, &common::create_test_track(1)).unwrap();

    let pl_id = playlist_repo::create_playlist(&conn, "Dup Reorder").unwrap();
    playlist_repo::add_to_playlist(&conn, pl_id, t1).unwrap();

    // Try to reorder with the same track ID twice
    let result = playlist_repo::reorder_playlist(&conn, pl_id, &[t1, t1]);
    assert!(
        result.is_err(),
        "reorder with duplicate track IDs should fail"
    );
}

// ============================================================
// Remove-from-playlist does NOT delete the track
// ============================================================

#[test]
fn test_remove_from_playlist_does_not_delete_track() {
    let conn = common::create_test_db();
    let t1_id = library_repo::insert_track(&conn, &common::create_test_track(1)).unwrap();
    let t2_id = library_repo::insert_track(&conn, &common::create_test_track(2)).unwrap();

    let pl_id = playlist_repo::create_playlist(&conn, "Keep Track PL").unwrap();
    playlist_repo::add_to_playlist(&conn, pl_id, t1_id).unwrap();
    playlist_repo::add_to_playlist(&conn, pl_id, t2_id).unwrap();

    // Remove t1 from playlist
    playlist_repo::remove_from_playlist(&conn, pl_id, t1_id).unwrap();

    // t1 should still exist in the tracks table
    let all_tracks = library_repo::get_all_tracks(&conn).unwrap();
    assert_eq!(all_tracks.len(), 2);
    let ids: Vec<i64> = all_tracks.iter().map(|t| t.id).collect();
    assert!(ids.contains(&t1_id));
    assert!(ids.contains(&t2_id));

    // But playlist should only have t2
    let pl_tracks = playlist_repo::get_playlist_tracks(&conn, pl_id).unwrap();
    assert_eq!(pl_tracks.len(), 1);
    assert_eq!(pl_tracks[0].id, t2_id);
}

#[test]
fn test_remove_from_playlist_track_not_in_playlist() {
    let conn = common::create_test_db();
    let t1_id = library_repo::insert_track(&conn, &common::create_test_track(1)).unwrap();

    let pl_id = playlist_repo::create_playlist(&conn, "Empty PL").unwrap();
    // t1 is NOT in the playlist — removing should not error
    let result = playlist_repo::remove_from_playlist(&conn, pl_id, t1_id);
    assert!(result.is_ok(), "removing a track not in playlist should not error");

    // Track should still exist
    let found = library_repo::get_track_by_id(&conn, t1_id).unwrap();
    assert!(found.is_some());
}

// ============================================================
// Album grouping tests (album + artist composite key)
// ============================================================

#[test]
fn test_get_all_albums_groups_by_album_and_artist() {
    let conn = common::create_test_db();

    // Two tracks with the same album name but different artists
    let mut t1 = common::create_test_track(1);
    t1.album = "Greatest Hits".to_string();
    t1.artist = "Artist A".to_string();

    let mut t2 = common::create_test_track(2);
    t2.album = "Greatest Hits".to_string();
    t2.artist = "Artist B".to_string();

    library_repo::insert_track(&conn, &t1).unwrap();
    library_repo::insert_track(&conn, &t2).unwrap();

    let albums = library_repo::get_all_albums(&conn).unwrap();
    assert_eq!(albums.len(), 2, "same album name with different artists should produce 2 entries");

    let names: Vec<&str> = albums.iter().map(|a| a.name.as_str()).collect();
    assert!(names.iter().all(|n| *n == "Greatest Hits"));

    let artists: Vec<&str> = albums.iter().map(|a| a.artist.as_str()).collect();
    assert!(artists.contains(&"Artist A"));
    assert!(artists.contains(&"Artist B"));
}

#[test]
fn test_get_all_albums_same_artist_same_album_merges() {
    let conn = common::create_test_db();

    for i in 1..=3 {
        let mut t = common::create_test_track(i);
        t.album = "The Album".to_string();
        t.artist = "Same Artist".to_string();
        library_repo::insert_track(&conn, &t).unwrap();
    }

    let albums = library_repo::get_all_albums(&conn).unwrap();
    assert_eq!(albums.len(), 1);
    assert_eq!(albums[0].name, "The Album");
    assert_eq!(albums[0].artist, "Same Artist");
    assert_eq!(albums[0].track_count, 3);
}

#[test]
fn test_get_tracks_by_album_filters_by_artist() {
    let conn = common::create_test_db();

    let mut t1 = common::create_test_track(1);
    t1.album = "Greatest Hits".to_string();
    t1.artist = "Artist A".to_string();

    let mut t2 = common::create_test_track(2);
    t2.album = "Greatest Hits".to_string();
    t2.artist = "Artist B".to_string();

    library_repo::insert_track(&conn, &t1).unwrap();
    library_repo::insert_track(&conn, &t2).unwrap();

    let tracks_a = library_repo::get_tracks_by_album(&conn, "Greatest Hits", "Artist A").unwrap();
    assert_eq!(tracks_a.len(), 1);
    assert_eq!(tracks_a[0].artist, "Artist A");

    let tracks_b = library_repo::get_tracks_by_album(&conn, "Greatest Hits", "Artist B").unwrap();
    assert_eq!(tracks_b.len(), 1);
    assert_eq!(tracks_b[0].artist, "Artist B");
}

#[test]
fn test_get_tracks_by_album_no_match() {
    let conn = common::create_test_db();

    let mut t = common::create_test_track(1);
    t.album = "Real Album".to_string();
    t.artist = "Real Artist".to_string();
    library_repo::insert_track(&conn, &t).unwrap();

    // Wrong artist
    let result = library_repo::get_tracks_by_album(&conn, "Real Album", "Wrong Artist").unwrap();
    assert!(result.is_empty());

    // Wrong album
    let result = library_repo::get_tracks_by_album(&conn, "Wrong Album", "Real Artist").unwrap();
    assert!(result.is_empty());
}

#[test]
fn test_get_all_albums_empty_library() {
    let conn = common::create_test_db();
    let albums = library_repo::get_all_albums(&conn).unwrap();
    assert!(albums.is_empty());
}

#[test]
fn test_get_tracks_by_album_multiple_tracks() {
    let conn = common::create_test_db();

    for i in 1..=5 {
        let mut t = common::create_test_track(i);
        t.album = "Big Album".to_string();
        t.artist = "The Band".to_string();
        library_repo::insert_track(&conn, &t).unwrap();
    }

    let tracks = library_repo::get_tracks_by_album(&conn, "Big Album", "The Band").unwrap();
    assert_eq!(tracks.len(), 5);
    for track in &tracks {
        assert_eq!(track.album, "Big Album");
        assert_eq!(track.artist, "The Band");
    }
}

// ============================================================
// Play count tests
// ============================================================

#[test]
fn test_increment_play_count() {
    let conn = common::create_test_db();
    let track = common::create_test_track(1);
    let id = library_repo::insert_track(&conn, &track).unwrap();

    // Initial play_count should be 0
    let found = library_repo::get_track_by_id(&conn, id).unwrap().unwrap();
    assert_eq!(found.play_count, 0);
    assert!(found.last_played_at.is_none());

    // Increment once
    library_repo::increment_play_count(&conn, id).unwrap();
    let found = library_repo::get_track_by_id(&conn, id).unwrap().unwrap();
    assert_eq!(found.play_count, 1);
    assert!(found.last_played_at.is_some());

    // Increment again
    library_repo::increment_play_count(&conn, id).unwrap();
    let found = library_repo::get_track_by_id(&conn, id).unwrap().unwrap();
    assert_eq!(found.play_count, 2);
}

#[test]
fn test_increment_play_count_nonexistent_track() {
    let conn = common::create_test_db();
    // Should not error (UPDATE on 0 rows is valid SQL)
    let result = library_repo::increment_play_count(&conn, 9999);
    assert!(result.is_ok());
}

#[test]
fn test_get_most_played_tracks() {
    let conn = common::create_test_db();

    // Insert 3 tracks
    let id1 = library_repo::insert_track(&conn, &common::create_test_track(1)).unwrap();
    let id2 = library_repo::insert_track(&conn, &common::create_test_track(2)).unwrap();
    let id3 = library_repo::insert_track(&conn, &common::create_test_track(3)).unwrap();

    // Track 2: 5 plays, Track 3: 3 plays, Track 1: 0 plays
    for _ in 0..5 {
        library_repo::increment_play_count(&conn, id2).unwrap();
    }
    for _ in 0..3 {
        library_repo::increment_play_count(&conn, id3).unwrap();
    }

    let most_played = library_repo::get_most_played_tracks(&conn, 50).unwrap();
    assert_eq!(most_played.len(), 2); // Track 1 excluded (play_count = 0)
    assert_eq!(most_played[0].id, id2); // 5 plays, first
    assert_eq!(most_played[0].play_count, 5);
    assert_eq!(most_played[1].id, id3); // 3 plays, second
    assert_eq!(most_played[1].play_count, 3);

    // Suppress unused variable warnings
    let _ = id1;
}

#[test]
fn test_get_most_played_tracks_respects_limit() {
    let conn = common::create_test_db();

    for i in 1..=10 {
        let id = library_repo::insert_track(&conn, &common::create_test_track(i)).unwrap();
        for _ in 0..i {
            library_repo::increment_play_count(&conn, id).unwrap();
        }
    }

    let top3 = library_repo::get_most_played_tracks(&conn, 3).unwrap();
    assert_eq!(top3.len(), 3);
    assert_eq!(top3[0].play_count, 10);
    assert_eq!(top3[1].play_count, 9);
    assert_eq!(top3[2].play_count, 8);
}

#[test]
fn test_get_most_played_empty_library() {
    let conn = common::create_test_db();
    let most_played = library_repo::get_most_played_tracks(&conn, 50).unwrap();
    assert!(most_played.is_empty());
}

#[test]
fn test_play_count_survives_in_all_queries() {
    let conn = common::create_test_db();
    let id = library_repo::insert_track(&conn, &common::create_test_track(1)).unwrap();

    library_repo::increment_play_count(&conn, id).unwrap();
    library_repo::increment_play_count(&conn, id).unwrap();

    // Verify via get_all_tracks
    let all = library_repo::get_all_tracks(&conn).unwrap();
    assert_eq!(all[0].play_count, 2);

    // Verify via search_tracks
    let searched = library_repo::search_tracks(&conn, "Test Track 1").unwrap();
    assert_eq!(searched[0].play_count, 2);

    // Verify via get_track_by_id
    let found = library_repo::get_track_by_id(&conn, id).unwrap().unwrap();
    assert_eq!(found.play_count, 2);
    assert!(found.last_played_at.is_some());
}
