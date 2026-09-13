//! Tests for the trash/remove command bodies and cover-art side effects.
//!
//! These functions follow the short-lock convention: DB lock only to fetch
//! or delete rows, file I/O (trash, cover files) with the lock released.
//! The tests pin the observable contract — result aggregation, rows kept on
//! failure, cover files cleaned up — so the lock restructuring cannot
//! silently change behaviour.

mod common;

use std::path::Path;
use std::sync::{Arc, Mutex};

use rusqlite::Connection;

use lyra_music_lib::commands::library::{
    import_audio_files, remove_tracks_batch, trash_tracks_batch,
};
use lyra_music_lib::storage::library_repo;

fn shared_db() -> Arc<Mutex<Connection>> {
    Arc::new(Mutex::new(common::create_test_db()))
}

fn insert_track_at(db: &Arc<Mutex<Connection>>, idx: u32, file_path: &Path) -> i64 {
    let mut track = common::create_test_track(idx);
    track.file_path = file_path.to_string_lossy().into_owned();
    let conn = db.lock().unwrap();
    library_repo::insert_track(&conn, &track).unwrap()
}

fn track_exists(db: &Arc<Mutex<Connection>>, id: i64) -> bool {
    let conn = db.lock().unwrap();
    library_repo::get_track_by_id(&conn, id).unwrap().is_some()
}

/// A file that cannot be moved to the trash (here: it does not exist) must
/// be reported per id and its row kept — the frontend rolls back only the
/// failed tracks from its optimistic removal.
#[test]
fn trash_tracks_batch_reports_missing_files_and_keeps_rows() {
    let dir = tempfile::tempdir().unwrap();
    let db = shared_db();
    let id = insert_track_at(&db, 1, &dir.path().join("ghost.mp3"));

    let result = trash_tracks_batch(&db, &[id]).unwrap();

    assert!(result.succeeded_ids.is_empty());
    assert_eq!(result.failed.len(), 1);
    assert_eq!(result.failed[0].id, id);
    assert!(track_exists(&db, id), "row must survive a failed trash");
}

/// The cached cover goes only after the file is actually in the trash: a
/// failed trash keeps the row, so deleting the cover first would leave a
/// live track pointing at a missing image.
#[test]
fn trash_tracks_batch_keeps_cover_when_trash_fails() {
    let dir = tempfile::tempdir().unwrap();
    let db = shared_db();
    let id = insert_track_at(&db, 1, &dir.path().join("ghost.mp3"));
    let cover_path = dir.path().join(format!("{id}.jpg"));
    std::fs::write(&cover_path, b"jpeg").unwrap();
    {
        let conn = db.lock().unwrap();
        library_repo::update_cover_art_path(&conn, id, cover_path.to_str().unwrap()).unwrap();
    }

    let result = trash_tracks_batch(&db, &[id]).unwrap();

    assert_eq!(result.failed.len(), 1);
    assert!(cover_path.exists(), "cover must survive a failed trash");
    let stored = {
        let conn = db.lock().unwrap();
        library_repo::get_track_cover_path(&conn, id).unwrap()
    };
    assert_eq!(stored.as_deref(), cover_path.to_str());
}

#[test]
fn trash_tracks_batch_reports_unknown_ids_as_not_found() {
    let db = shared_db();

    let result = trash_tracks_batch(&db, &[9999]).unwrap();

    assert!(result.succeeded_ids.is_empty());
    assert_eq!(result.failed.len(), 1);
    assert_eq!(result.failed[0].id, 9999);
    assert!(result.failed[0].error.contains("not found"));
}

/// Removing from the library deletes the rows and the cached cover files;
/// ids that are not in the DB are reported, not treated as an error.
#[test]
fn remove_tracks_batch_deletes_rows_and_cover_files() {
    let data_dir = tempfile::tempdir().unwrap();
    let covers = data_dir.path().join("covers");
    std::fs::create_dir_all(&covers).unwrap();
    let db = shared_db();

    let with_cover = insert_track_at(&db, 1, Path::new("/tmp/test_music/with_cover.mp3"));
    let cover_path = covers.join(format!("{with_cover}.jpg"));
    std::fs::write(&cover_path, b"jpeg").unwrap();
    {
        let conn = db.lock().unwrap();
        library_repo::update_cover_art_path(&conn, with_cover, cover_path.to_str().unwrap())
            .unwrap();
    }
    let without_cover = insert_track_at(&db, 2, Path::new("/tmp/test_music/plain.mp3"));

    let result = remove_tracks_batch(&db, &[with_cover, without_cover, 777]).unwrap();

    assert_eq!(result.succeeded_ids, vec![with_cover, without_cover]);
    assert_eq!(result.failed.len(), 1);
    assert_eq!(result.failed[0].id, 777);
    assert!(!track_exists(&db, with_cover));
    assert!(!track_exists(&db, without_cover));
    assert!(!cover_path.exists(), "cached cover must be cleaned up");
}

/// Import writes the extracted cover to `<app_data>/covers/<id>.<ext>` and
/// records that path on the row and in the returned track. Cover files are
/// written after the insert (the name needs the id) and outside the DB
/// lock, so this pins that the path still lands in both places.
#[test]
fn import_saves_cover_art_and_records_its_path() {
    let music_dir = tempfile::tempdir().unwrap();
    let data_dir = tempfile::tempdir().unwrap();
    let db = shared_db();

    let image = b"\xFF\xD8\xFF\xE0 fake jpeg bytes \xFF\xD9";
    let audio = common::create_test_wav_with_cover(music_dir.path(), "art.wav", image);

    let result = import_audio_files(
        &db,
        data_dir.path(),
        &[audio.to_string_lossy().into_owned()],
    );

    assert_eq!(result.tracks.len(), 1, "{:?}", result.failed_files);
    let track = &result.tracks[0];
    let cover_path = track
        .cover_art_path
        .as_deref()
        .expect("returned track carries its cover path");
    let expected = data_dir
        .path()
        .join("covers")
        .join(format!("{}.jpg", track.id));
    assert_eq!(Path::new(cover_path), expected);
    assert_eq!(std::fs::read(cover_path).unwrap(), image);

    let stored = {
        let conn = db.lock().unwrap();
        library_repo::get_track_cover_path(&conn, track.id).unwrap()
    };
    assert_eq!(stored.as_deref(), Some(cover_path));
}

/// The rows are committed before the covers are written and recorded, so an
/// import cut short in between leaves a track with no cover. Re-importing
/// the same file must heal it: the upsert keeps the id (play count and
/// playlist membership with it) and the cover lands again.
#[test]
fn reimport_restores_cover_lost_by_an_interrupted_import() {
    let music_dir = tempfile::tempdir().unwrap();
    let data_dir = tempfile::tempdir().unwrap();
    let db = shared_db();

    let image = b"\xFF\xD8\xFF\xE0 fake jpeg bytes \xFF\xD9";
    let audio = common::create_test_wav_with_cover(music_dir.path(), "art.wav", image);
    let paths = [audio.to_string_lossy().into_owned()];

    let first = import_audio_files(&db, data_dir.path(), &paths);
    assert_eq!(first.tracks.len(), 1, "{:?}", first.failed_files);
    let id = first.tracks[0].id;
    let cover_path = first.tracks[0].cover_art_path.clone().unwrap();

    // Rewind to the state right after the insert transaction committed.
    std::fs::remove_file(&cover_path).unwrap();
    {
        let conn = db.lock().unwrap();
        conn.execute(
            "UPDATE tracks SET cover_art_path = NULL WHERE id = ?1",
            [id],
        )
        .unwrap();
        library_repo::increment_play_count(&conn, id).unwrap();
    }

    let second = import_audio_files(&db, data_dir.path(), &paths);

    assert_eq!(second.tracks.len(), 1, "{:?}", second.failed_files);
    assert_eq!(second.tracks[0].id, id, "re-import must keep the row id");
    assert_eq!(
        second.tracks[0].cover_art_path.as_deref(),
        Some(cover_path.as_str())
    );
    assert_eq!(std::fs::read(&cover_path).unwrap(), image);

    let conn = db.lock().unwrap();
    assert_eq!(
        library_repo::get_track_cover_path(&conn, id).unwrap(),
        Some(cover_path)
    );
    let track = library_repo::get_track_by_id(&conn, id).unwrap().unwrap();
    assert_eq!(track.play_count, 1);
}
