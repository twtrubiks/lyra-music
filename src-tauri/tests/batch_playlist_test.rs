mod common;

use lyra_music_lib::storage::library_repo;
use lyra_music_lib::storage::playlist_repo;

// ============================================================
// batch_add_to_playlist tests
// ============================================================

#[test]
fn test_batch_add_to_playlist_basic() {
    let conn = common::create_test_db();
    let id1 = library_repo::insert_track(&conn, &common::create_test_track(1)).unwrap();
    let id2 = library_repo::insert_track(&conn, &common::create_test_track(2)).unwrap();
    let id3 = library_repo::insert_track(&conn, &common::create_test_track(3)).unwrap();

    let pl_id = playlist_repo::create_playlist(&conn, "Test PL").unwrap();
    playlist_repo::batch_add_to_playlist(&conn, pl_id, &[id1, id2, id3]).unwrap();

    let tracks = playlist_repo::get_playlist_tracks(&conn, pl_id).unwrap();
    assert_eq!(tracks.len(), 3);
    assert_eq!(tracks[0].id, id1);
    assert_eq!(tracks[1].id, id2);
    assert_eq!(tracks[2].id, id3);
}

#[test]
fn test_batch_add_to_playlist_empty_is_noop() {
    let conn = common::create_test_db();
    let pl_id = playlist_repo::create_playlist(&conn, "Test PL").unwrap();

    playlist_repo::batch_add_to_playlist(&conn, pl_id, &[]).unwrap();

    let tracks = playlist_repo::get_playlist_tracks(&conn, pl_id).unwrap();
    assert!(tracks.is_empty());
}

#[test]
fn test_batch_add_to_playlist_preserves_existing_order() {
    let conn = common::create_test_db();
    let id1 = library_repo::insert_track(&conn, &common::create_test_track(1)).unwrap();
    let id2 = library_repo::insert_track(&conn, &common::create_test_track(2)).unwrap();
    let id3 = library_repo::insert_track(&conn, &common::create_test_track(3)).unwrap();

    let pl_id = playlist_repo::create_playlist(&conn, "Test PL").unwrap();
    playlist_repo::add_to_playlist(&conn, pl_id, id1).unwrap();

    playlist_repo::batch_add_to_playlist(&conn, pl_id, &[id2, id3]).unwrap();

    let tracks = playlist_repo::get_playlist_tracks(&conn, pl_id).unwrap();
    assert_eq!(tracks.len(), 3);
    assert_eq!(tracks[0].id, id1); // existing track still first
    assert_eq!(tracks[1].id, id2);
    assert_eq!(tracks[2].id, id3);
}

#[test]
fn test_batch_add_to_playlist_duplicate_skipped() {
    let conn = common::create_test_db();
    let id1 = library_repo::insert_track(&conn, &common::create_test_track(1)).unwrap();
    let id2 = library_repo::insert_track(&conn, &common::create_test_track(2)).unwrap();

    let pl_id = playlist_repo::create_playlist(&conn, "Test PL").unwrap();
    playlist_repo::add_to_playlist(&conn, pl_id, id1).unwrap();

    // id1 is already in playlist, should be skipped
    playlist_repo::batch_add_to_playlist(&conn, pl_id, &[id1, id2]).unwrap();

    let tracks = playlist_repo::get_playlist_tracks(&conn, pl_id).unwrap();
    assert_eq!(tracks.len(), 2);
    assert_eq!(tracks[0].id, id1);
    assert_eq!(tracks[1].id, id2);
}

// ============================================================
// batch_remove_from_playlist tests
// ============================================================

#[test]
fn test_batch_remove_from_playlist_basic() {
    let conn = common::create_test_db();
    let id1 = library_repo::insert_track(&conn, &common::create_test_track(1)).unwrap();
    let id2 = library_repo::insert_track(&conn, &common::create_test_track(2)).unwrap();
    let id3 = library_repo::insert_track(&conn, &common::create_test_track(3)).unwrap();

    let pl_id = playlist_repo::create_playlist(&conn, "Test PL").unwrap();
    playlist_repo::add_to_playlist(&conn, pl_id, id1).unwrap();
    playlist_repo::add_to_playlist(&conn, pl_id, id2).unwrap();
    playlist_repo::add_to_playlist(&conn, pl_id, id3).unwrap();

    playlist_repo::batch_remove_from_playlist(&conn, pl_id, &[id1, id3]).unwrap();

    let tracks = playlist_repo::get_playlist_tracks(&conn, pl_id).unwrap();
    assert_eq!(tracks.len(), 1);
    assert_eq!(tracks[0].id, id2);
}

#[test]
fn test_batch_remove_from_playlist_empty_is_noop() {
    let conn = common::create_test_db();
    let id1 = library_repo::insert_track(&conn, &common::create_test_track(1)).unwrap();

    let pl_id = playlist_repo::create_playlist(&conn, "Test PL").unwrap();
    playlist_repo::add_to_playlist(&conn, pl_id, id1).unwrap();

    playlist_repo::batch_remove_from_playlist(&conn, pl_id, &[]).unwrap();

    let tracks = playlist_repo::get_playlist_tracks(&conn, pl_id).unwrap();
    assert_eq!(tracks.len(), 1);
}

#[test]
fn test_batch_remove_from_playlist_nonexistent_ids_no_error() {
    let conn = common::create_test_db();
    let id1 = library_repo::insert_track(&conn, &common::create_test_track(1)).unwrap();

    let pl_id = playlist_repo::create_playlist(&conn, "Test PL").unwrap();
    playlist_repo::add_to_playlist(&conn, pl_id, id1).unwrap();

    playlist_repo::batch_remove_from_playlist(&conn, pl_id, &[9999, 8888]).unwrap();

    let tracks = playlist_repo::get_playlist_tracks(&conn, pl_id).unwrap();
    assert_eq!(tracks.len(), 1);
    assert_eq!(tracks[0].id, id1);
}

#[test]
fn test_batch_remove_from_playlist_track_still_in_library() {
    let conn = common::create_test_db();
    let id1 = library_repo::insert_track(&conn, &common::create_test_track(1)).unwrap();
    let id2 = library_repo::insert_track(&conn, &common::create_test_track(2)).unwrap();

    let pl_id = playlist_repo::create_playlist(&conn, "Test PL").unwrap();
    playlist_repo::add_to_playlist(&conn, pl_id, id1).unwrap();
    playlist_repo::add_to_playlist(&conn, pl_id, id2).unwrap();

    playlist_repo::batch_remove_from_playlist(&conn, pl_id, &[id1]).unwrap();

    // Track still exists in library
    let all_tracks = library_repo::get_all_tracks(&conn).unwrap();
    assert_eq!(all_tracks.len(), 2);
}

#[test]
fn test_batch_remove_all_from_playlist_still_exists() {
    let conn = common::create_test_db();
    let id1 = library_repo::insert_track(&conn, &common::create_test_track(1)).unwrap();
    let id2 = library_repo::insert_track(&conn, &common::create_test_track(2)).unwrap();

    let pl_id = playlist_repo::create_playlist(&conn, "Test PL").unwrap();
    playlist_repo::add_to_playlist(&conn, pl_id, id1).unwrap();
    playlist_repo::add_to_playlist(&conn, pl_id, id2).unwrap();

    playlist_repo::batch_remove_from_playlist(&conn, pl_id, &[id1, id2]).unwrap();

    // Playlist still exists
    let playlists = playlist_repo::get_all_playlists(&conn).unwrap();
    assert_eq!(playlists.len(), 1);
    assert_eq!(playlists[0].name, "Test PL");

    // But has no tracks
    let tracks = playlist_repo::get_playlist_tracks(&conn, pl_id).unwrap();
    assert!(tracks.is_empty());
}
