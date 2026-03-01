mod common;

use lyra_music_lib::storage::library_repo;
use lyra_music_lib::storage::playlist_repo;

// ============================================================
// Batch delete_tracks tests
// ============================================================

#[test]
fn test_delete_tracks_batch() {
    let conn = common::create_test_db();
    let id1 = library_repo::insert_track(&conn, &common::create_test_track(1)).unwrap();
    let id2 = library_repo::insert_track(&conn, &common::create_test_track(2)).unwrap();
    let id3 = library_repo::insert_track(&conn, &common::create_test_track(3)).unwrap();

    library_repo::delete_tracks(&conn, &[id1, id3]).unwrap();

    let tracks = library_repo::get_all_tracks(&conn).unwrap();
    assert_eq!(tracks.len(), 1);
    assert_eq!(tracks[0].id, id2);
}

#[test]
fn test_delete_tracks_empty_array_is_noop() {
    let conn = common::create_test_db();
    library_repo::insert_track(&conn, &common::create_test_track(1)).unwrap();
    library_repo::insert_track(&conn, &common::create_test_track(2)).unwrap();

    library_repo::delete_tracks(&conn, &[]).unwrap();

    let tracks = library_repo::get_all_tracks(&conn).unwrap();
    assert_eq!(tracks.len(), 2);
}

#[test]
fn test_delete_tracks_nonexistent_ids_no_error() {
    let conn = common::create_test_db();
    let id1 = library_repo::insert_track(&conn, &common::create_test_track(1)).unwrap();

    library_repo::delete_tracks(&conn, &[id1, 9999, 8888]).unwrap();

    let tracks = library_repo::get_all_tracks(&conn).unwrap();
    assert!(tracks.is_empty());
}

#[test]
fn test_delete_tracks_all() {
    let conn = common::create_test_db();
    let id1 = library_repo::insert_track(&conn, &common::create_test_track(1)).unwrap();
    let id2 = library_repo::insert_track(&conn, &common::create_test_track(2)).unwrap();
    let id3 = library_repo::insert_track(&conn, &common::create_test_track(3)).unwrap();

    library_repo::delete_tracks(&conn, &[id1, id2, id3]).unwrap();

    let tracks = library_repo::get_all_tracks(&conn).unwrap();
    assert!(tracks.is_empty());
}

// ============================================================
// Batch get_tracks_by_ids tests
// ============================================================

#[test]
fn test_get_tracks_by_ids_batch() {
    let conn = common::create_test_db();
    let id1 = library_repo::insert_track(&conn, &common::create_test_track(1)).unwrap();
    let id2 = library_repo::insert_track(&conn, &common::create_test_track(2)).unwrap();
    let id3 = library_repo::insert_track(&conn, &common::create_test_track(3)).unwrap();

    let tracks = library_repo::get_tracks_by_ids(&conn, &[id1, id3]).unwrap();
    assert_eq!(tracks.len(), 2);
    let ids: Vec<i64> = tracks.iter().map(|t| t.id).collect();
    assert!(ids.contains(&id1));
    assert!(ids.contains(&id3));
    assert!(!ids.contains(&id2));
}

#[test]
fn test_get_tracks_by_ids_empty_array() {
    let conn = common::create_test_db();
    library_repo::insert_track(&conn, &common::create_test_track(1)).unwrap();

    let tracks = library_repo::get_tracks_by_ids(&conn, &[]).unwrap();
    assert!(tracks.is_empty());
}

#[test]
fn test_get_tracks_by_ids_nonexistent() {
    let conn = common::create_test_db();
    library_repo::insert_track(&conn, &common::create_test_track(1)).unwrap();

    let tracks = library_repo::get_tracks_by_ids(&conn, &[9999, 8888]).unwrap();
    assert!(tracks.is_empty());
}

#[test]
fn test_get_tracks_by_ids_mixed_existing_and_nonexistent() {
    let conn = common::create_test_db();
    let id1 = library_repo::insert_track(&conn, &common::create_test_track(1)).unwrap();
    library_repo::insert_track(&conn, &common::create_test_track(2)).unwrap();

    let tracks = library_repo::get_tracks_by_ids(&conn, &[id1, 9999]).unwrap();
    assert_eq!(tracks.len(), 1);
    assert_eq!(tracks[0].id, id1);
}

// ============================================================
// Batch delete cascade tests
// ============================================================

#[test]
fn test_delete_tracks_cascade_removes_from_playlists() {
    let conn = common::create_test_db();
    let id1 = library_repo::insert_track(&conn, &common::create_test_track(1)).unwrap();
    let id2 = library_repo::insert_track(&conn, &common::create_test_track(2)).unwrap();
    let id3 = library_repo::insert_track(&conn, &common::create_test_track(3)).unwrap();

    let pl_id = playlist_repo::create_playlist(&conn, "Test PL").unwrap();
    playlist_repo::add_to_playlist(&conn, pl_id, id1).unwrap();
    playlist_repo::add_to_playlist(&conn, pl_id, id2).unwrap();
    playlist_repo::add_to_playlist(&conn, pl_id, id3).unwrap();

    // Batch delete tracks 1 and 3
    library_repo::delete_tracks(&conn, &[id1, id3]).unwrap();

    // Playlist should only have track 2
    let pl_tracks = playlist_repo::get_playlist_tracks(&conn, pl_id).unwrap();
    assert_eq!(pl_tracks.len(), 1);
    assert_eq!(pl_tracks[0].id, id2);

    // Playlist itself should still exist
    let playlists = playlist_repo::get_all_playlists(&conn).unwrap();
    assert_eq!(playlists.len(), 1);
}

#[test]
fn test_delete_tracks_cascade_multiple_playlists() {
    let conn = common::create_test_db();
    let id1 = library_repo::insert_track(&conn, &common::create_test_track(1)).unwrap();
    let id2 = library_repo::insert_track(&conn, &common::create_test_track(2)).unwrap();

    let pl1 = playlist_repo::create_playlist(&conn, "PL 1").unwrap();
    let pl2 = playlist_repo::create_playlist(&conn, "PL 2").unwrap();
    playlist_repo::add_to_playlist(&conn, pl1, id1).unwrap();
    playlist_repo::add_to_playlist(&conn, pl1, id2).unwrap();
    playlist_repo::add_to_playlist(&conn, pl2, id1).unwrap();
    playlist_repo::add_to_playlist(&conn, pl2, id2).unwrap();

    library_repo::delete_tracks(&conn, &[id1]).unwrap();

    let pl1_tracks = playlist_repo::get_playlist_tracks(&conn, pl1).unwrap();
    assert_eq!(pl1_tracks.len(), 1);
    assert_eq!(pl1_tracks[0].id, id2);

    let pl2_tracks = playlist_repo::get_playlist_tracks(&conn, pl2).unwrap();
    assert_eq!(pl2_tracks.len(), 1);
    assert_eq!(pl2_tracks[0].id, id2);
}

// ============================================================
// Chunk boundary tests (>500 items cross CHUNK_SIZE)
// ============================================================

#[test]
fn test_delete_tracks_exceeds_chunk_size() {
    let conn = common::create_test_db();
    let mut ids = Vec::with_capacity(502);
    for i in 1..=502u32 {
        let id = library_repo::insert_track(&conn, &common::create_test_track(i)).unwrap();
        ids.push(id);
    }
    assert_eq!(library_repo::get_all_tracks(&conn).unwrap().len(), 502);

    library_repo::delete_tracks(&conn, &ids).unwrap();

    let remaining = library_repo::get_all_tracks(&conn).unwrap();
    assert!(
        remaining.is_empty(),
        "expected 0 tracks, got {}",
        remaining.len()
    );
}

#[test]
fn test_get_tracks_by_ids_exceeds_chunk_size() {
    let conn = common::create_test_db();
    let mut ids = Vec::with_capacity(502);
    for i in 1..=502u32 {
        let id = library_repo::insert_track(&conn, &common::create_test_track(i)).unwrap();
        ids.push(id);
    }

    let tracks = library_repo::get_tracks_by_ids(&conn, &ids).unwrap();
    assert_eq!(
        tracks.len(),
        502,
        "expected 502 tracks, got {}",
        tracks.len()
    );
}

#[test]
fn test_delete_tracks_single_id() {
    let conn = common::create_test_db();
    let id1 = library_repo::insert_track(&conn, &common::create_test_track(1)).unwrap();
    let id2 = library_repo::insert_track(&conn, &common::create_test_track(2)).unwrap();

    library_repo::delete_tracks(&conn, &[id1]).unwrap();

    let tracks = library_repo::get_all_tracks(&conn).unwrap();
    assert_eq!(tracks.len(), 1);
    assert_eq!(tracks[0].id, id2);
}
