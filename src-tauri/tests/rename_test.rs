//! Tests for repointing tracked files after a filesystem rename/move.
//!
//! A rename must keep the existing `tracks` row (same id) so `play_count`,
//! `last_played_at` and playlist membership survive — the old delete +
//! re-import path wiped all of them via ON DELETE CASCADE.

mod common;

use lyra_music_lib::storage::{library_repo, playlist_repo};

#[test]
fn test_update_track_path_preserves_identity() {
    let conn = common::create_test_db();
    let track = common::create_test_track(1);
    let id = library_repo::insert_track(&conn, &track).unwrap();
    library_repo::increment_play_count(&conn, id).unwrap();
    library_repo::increment_play_count(&conn, id).unwrap();
    let playlist_id = playlist_repo::create_playlist(&conn, "Favorites").unwrap();
    playlist_repo::add_to_playlist(&conn, playlist_id, id).unwrap();

    let updated =
        library_repo::update_track_path(&conn, &track.file_path, "/tmp/test_music/moved.mp3")
            .unwrap();
    assert_eq!(updated, 1);

    // Same row, new path — id, play_count and playlist membership intact.
    assert_eq!(
        library_repo::get_track_id_by_path(&conn, "/tmp/test_music/moved.mp3").unwrap(),
        Some(id)
    );
    assert_eq!(
        library_repo::get_track_id_by_path(&conn, &track.file_path).unwrap(),
        None
    );
    let found = library_repo::get_track_by_id(&conn, id).unwrap().unwrap();
    assert_eq!(found.play_count, 2);
    let playlist_tracks = playlist_repo::get_playlist_tracks(&conn, playlist_id).unwrap();
    assert_eq!(playlist_tracks.len(), 1);
    assert_eq!(playlist_tracks[0].id, id);
}

#[test]
fn test_update_track_path_untracked_source_updates_nothing() {
    let conn = common::create_test_db();
    let track = common::create_test_track(1);
    library_repo::insert_track(&conn, &track).unwrap();

    let updated =
        library_repo::update_track_path(&conn, "/tmp/not_tracked.mp3", "/tmp/new.mp3").unwrap();

    assert_eq!(updated, 0);
    assert_eq!(library_repo::get_all_tracks(&conn).unwrap().len(), 1);
}

#[test]
fn test_update_track_paths_by_prefix_updates_children_only() {
    let conn = common::create_test_db();
    let mut inside = common::create_test_track(1);
    inside.file_path = "/music/AlbumA/01.mp3".to_string();
    let inside_id = library_repo::insert_track(&conn, &inside).unwrap();
    let mut nested = common::create_test_track(2);
    nested.file_path = "/music/AlbumA/disc2/02.mp3".to_string();
    let nested_id = library_repo::insert_track(&conn, &nested).unwrap();
    // Sibling directory sharing the prefix string must not be touched.
    let mut sibling = common::create_test_track(3);
    sibling.file_path = "/music/AlbumA2/03.mp3".to_string();
    let sibling_id = library_repo::insert_track(&conn, &sibling).unwrap();
    library_repo::increment_play_count(&conn, inside_id).unwrap();

    let updated =
        library_repo::update_track_paths_by_prefix(&conn, "/music/AlbumA", "/music/AlbumB")
            .unwrap();
    assert_eq!(updated, 2);

    assert_eq!(
        library_repo::get_track_id_by_path(&conn, "/music/AlbumB/01.mp3").unwrap(),
        Some(inside_id)
    );
    assert_eq!(
        library_repo::get_track_id_by_path(&conn, "/music/AlbumB/disc2/02.mp3").unwrap(),
        Some(nested_id)
    );
    assert_eq!(
        library_repo::get_track_id_by_path(&conn, "/music/AlbumA2/03.mp3").unwrap(),
        Some(sibling_id)
    );
    let found = library_repo::get_track_by_id(&conn, inside_id)
        .unwrap()
        .unwrap();
    assert_eq!(found.play_count, 1);
}

#[test]
fn test_update_track_paths_by_prefix_treats_wildcards_literally() {
    let conn = common::create_test_db();
    // `_` is a single-char wildcard under LIKE — the match must be literal.
    let mut literal = common::create_test_track(1);
    literal.file_path = "/music/a_b/01.mp3".to_string();
    let literal_id = library_repo::insert_track(&conn, &literal).unwrap();
    let mut lookalike = common::create_test_track(2);
    lookalike.file_path = "/music/axb/02.mp3".to_string();
    let lookalike_id = library_repo::insert_track(&conn, &lookalike).unwrap();

    let updated =
        library_repo::update_track_paths_by_prefix(&conn, "/music/a_b", "/music/renamed").unwrap();
    assert_eq!(updated, 1);

    assert_eq!(
        library_repo::get_track_id_by_path(&conn, "/music/renamed/01.mp3").unwrap(),
        Some(literal_id)
    );
    assert_eq!(
        library_repo::get_track_id_by_path(&conn, "/music/axb/02.mp3").unwrap(),
        Some(lookalike_id)
    );
}
