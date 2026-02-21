mod common;

use lyra_music_lib::storage::library_repo;
use lyra_music_lib::storage::playlist_repo;

// ============================================================
// Edge cases: duplicate track in playlist (INSERT OR IGNORE)
// ============================================================

#[test]
fn test_add_same_track_to_playlist_twice_is_idempotent() {
    let conn = common::create_test_db();
    let t_id = library_repo::insert_track(&conn, &common::create_test_track(1)).unwrap();
    let pl_id = playlist_repo::create_playlist(&conn, "Dupes").unwrap();

    playlist_repo::add_to_playlist(&conn, pl_id, t_id).unwrap();
    // Adding the same track again should not error (INSERT OR IGNORE)
    playlist_repo::add_to_playlist(&conn, pl_id, t_id).unwrap();

    let tracks = playlist_repo::get_playlist_tracks(&conn, pl_id).unwrap();
    // Should still be 1 track, not 2
    assert_eq!(tracks.len(), 1);
}

// ============================================================
// Edge cases: reorder with empty list
// ============================================================

#[test]
fn test_reorder_playlist_with_empty_list_clears_all() {
    let conn = common::create_test_db();
    let t1 = library_repo::insert_track(&conn, &common::create_test_track(1)).unwrap();
    let t2 = library_repo::insert_track(&conn, &common::create_test_track(2)).unwrap();

    let pl_id = playlist_repo::create_playlist(&conn, "Reorder Empty").unwrap();
    playlist_repo::add_to_playlist(&conn, pl_id, t1).unwrap();
    playlist_repo::add_to_playlist(&conn, pl_id, t2).unwrap();

    // Reorder with empty list → clears all tracks from playlist
    playlist_repo::reorder_playlist(&conn, pl_id, &[]).unwrap();

    let tracks = playlist_repo::get_playlist_tracks(&conn, pl_id).unwrap();
    assert!(tracks.is_empty());
}

// ============================================================
// Edge cases: get_all_tracks returns cover_art as None
// ============================================================

#[test]
fn test_get_all_tracks_excludes_cover_art() {
    let conn = common::create_test_db();
    let mut track = common::create_test_track(1);
    track.cover_art = Some("data:image/jpeg;base64,abc123".to_string());

    library_repo::insert_track(&conn, &track).unwrap();

    let tracks = library_repo::get_all_tracks(&conn).unwrap();
    assert_eq!(tracks.len(), 1);
    // get_all_tracks intentionally excludes cover_art for performance
    assert!(tracks[0].cover_art.is_none());
}

// ============================================================
// Edge cases: get_track_by_id includes cover_art
// ============================================================

#[test]
fn test_get_track_by_id_includes_cover_art() {
    let conn = common::create_test_db();
    let mut track = common::create_test_track(1);
    track.cover_art_path = Some("/tmp/covers/1.png".to_string());

    let id = library_repo::insert_track(&conn, &track).unwrap();

    let found = library_repo::get_track_by_id(&conn, id).unwrap().unwrap();
    // get_track_by_id DOES include cover_art_path
    assert!(found.cover_art_path.is_some());
    assert!(found.cover_art_path.unwrap().starts_with("/tmp/covers/"));
}

// ============================================================
// Edge cases: search with special characters
// ============================================================

#[test]
fn test_search_tracks_with_percent_char() {
    let conn = common::create_test_db();
    let mut track = common::create_test_track(1);
    track.title = "100% Pure".to_string();
    library_repo::insert_track(&conn, &track).unwrap();

    // Search for "%" — LIKE pattern becomes "%%%"
    // This is a known SQL injection-like edge case for LIKE queries
    let results = library_repo::search_tracks(&conn, "%").unwrap();
    // "%" in the pattern matches everything, so all tracks match
    assert!(!results.is_empty());
}

#[test]
fn test_search_tracks_with_underscore_char() {
    let conn = common::create_test_db();
    let mut track = common::create_test_track(1);
    track.title = "song_name".to_string();
    library_repo::insert_track(&conn, &track).unwrap();

    let mut track2 = common::create_test_track(2);
    track2.title = "songXname".to_string();
    library_repo::insert_track(&conn, &track2).unwrap();

    // "_" is a wildcard in LIKE, matching any single character
    let results = library_repo::search_tracks(&conn, "_").unwrap();
    // Both tracks match because "_" in LIKE matches ANY single char
    // This documents a known limitation of the naive LIKE search
    assert!(results.len() >= 1);
}

// ============================================================
// Edge cases: empty playlist name
// ============================================================

#[test]
fn test_create_playlist_empty_name() {
    let conn = common::create_test_db();
    // SQLite allows empty string — this is a business logic edge case
    let id = playlist_repo::create_playlist(&conn, "").unwrap();
    assert!(id > 0);

    let playlists = playlist_repo::get_all_playlists(&conn).unwrap();
    assert_eq!(playlists[0].name, "");
}

// ============================================================
// Edge cases: remove nonexistent track from playlist
// ============================================================

#[test]
fn test_remove_nonexistent_track_from_playlist_no_error() {
    let conn = common::create_test_db();
    let pl_id = playlist_repo::create_playlist(&conn, "PL").unwrap();

    // Removing a track that isn't in the playlist should not error
    let result = playlist_repo::remove_from_playlist(&conn, pl_id, 9999);
    assert!(result.is_ok());
}

// ============================================================
// Edge cases: delete nonexistent playlist
// ============================================================

#[test]
fn test_delete_nonexistent_playlist_no_error() {
    let conn = common::create_test_db();
    let result = playlist_repo::delete_playlist(&conn, 9999);
    assert!(result.is_ok());
}

// ============================================================
// Edge cases: save_playback_position overwrites previous
// ============================================================

#[test]
fn test_save_playback_position_overwrites() {
    let conn = common::create_test_db();
    let t1 = library_repo::insert_track(&conn, &common::create_test_track(1)).unwrap();
    let t2 = library_repo::insert_track(&conn, &common::create_test_track(2)).unwrap();
    let pl_id = playlist_repo::create_playlist(&conn, "Pos PL").unwrap();

    playlist_repo::save_playback_position(&conn, pl_id, t1, 10.0).unwrap();
    playlist_repo::save_playback_position(&conn, pl_id, t2, 99.5).unwrap();

    let (track_id, secs) = playlist_repo::get_last_playback_position(&conn, pl_id).unwrap();
    // Should be the LATEST saved position, not the first
    assert_eq!(track_id, Some(t2));
    assert_eq!(secs, Some(99.5));
}

// ============================================================
// Edge cases: tracks sorted by title in get_all_tracks
// ============================================================

#[test]
fn test_get_all_tracks_ordered_by_title() {
    let conn = common::create_test_db();

    let mut t_z = common::create_test_track(1);
    t_z.title = "Zebra Song".to_string();
    t_z.file_path = "/tmp/z.mp3".to_string();

    let mut t_a = common::create_test_track(2);
    t_a.title = "Apple Song".to_string();
    t_a.file_path = "/tmp/a.mp3".to_string();

    let mut t_m = common::create_test_track(3);
    t_m.title = "Mango Song".to_string();
    t_m.file_path = "/tmp/m.mp3".to_string();

    // Insert in Z, A, M order
    library_repo::insert_track(&conn, &t_z).unwrap();
    library_repo::insert_track(&conn, &t_a).unwrap();
    library_repo::insert_track(&conn, &t_m).unwrap();

    let tracks = library_repo::get_all_tracks(&conn).unwrap();
    // Should be sorted by title: Apple, Mango, Zebra
    assert_eq!(tracks[0].title, "Apple Song");
    assert_eq!(tracks[1].title, "Mango Song");
    assert_eq!(tracks[2].title, "Zebra Song");
}

// ============================================================
// Edge cases: playlist track order preserved by sort_order
// ============================================================

#[test]
fn test_playlist_tracks_respect_insertion_order() {
    let conn = common::create_test_db();

    let mut t1 = common::create_test_track(1);
    t1.title = "Third alphabetically".to_string();
    let mut t2 = common::create_test_track(2);
    t2.title = "First alphabetically".to_string();
    let mut t3 = common::create_test_track(3);
    t3.title = "Second alphabetically".to_string();

    let id1 = library_repo::insert_track(&conn, &t1).unwrap();
    let id2 = library_repo::insert_track(&conn, &t2).unwrap();
    let id3 = library_repo::insert_track(&conn, &t3).unwrap();

    let pl_id = playlist_repo::create_playlist(&conn, "Ordered").unwrap();
    // Add in order: id1, id2, id3
    playlist_repo::add_to_playlist(&conn, pl_id, id1).unwrap();
    playlist_repo::add_to_playlist(&conn, pl_id, id2).unwrap();
    playlist_repo::add_to_playlist(&conn, pl_id, id3).unwrap();

    let tracks = playlist_repo::get_playlist_tracks(&conn, pl_id).unwrap();
    // Playlist order should respect insertion (sort_order), NOT title order
    assert_eq!(tracks[0].id, id1);
    assert_eq!(tracks[1].id, id2);
    assert_eq!(tracks[2].id, id3);
}

// ============================================================
// Edge cases: get_track_cover for nonexistent track
// ============================================================

#[test]
fn test_get_track_cover_nonexistent_track() {
    let conn = common::create_test_db();
    let cover = library_repo::get_track_cover_path(&conn, 9999).unwrap();
    assert!(cover.is_none());
}

// ============================================================
// Edge cases: search is case-insensitive (SQLite LIKE default)
// ============================================================

#[test]
fn test_search_is_case_insensitive() {
    let conn = common::create_test_db();
    let mut track = common::create_test_track(1);
    track.title = "Bohemian Rhapsody".to_string();
    library_repo::insert_track(&conn, &track).unwrap();

    // SQLite LIKE is case-insensitive for ASCII by default
    let results = library_repo::search_tracks(&conn, "bohemian").unwrap();
    assert_eq!(results.len(), 1);

    let results = library_repo::search_tracks(&conn, "BOHEMIAN").unwrap();
    assert_eq!(results.len(), 1);
}
