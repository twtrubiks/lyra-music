mod common;

use std::sync::{Arc, Mutex};

use lyra_music_lib::scanner::watcher::process_event_batch;
use lyra_music_lib::storage::library_repo;
use notify::EventKind;
use notify::event::{CreateKind, ModifyKind, RemoveKind};

fn create_event(path: &std::path::Path) -> notify::Event {
    notify::Event::new(EventKind::Create(CreateKind::File)).add_path(path.to_path_buf())
}

fn modify_event(path: &std::path::Path) -> notify::Event {
    notify::Event::new(EventKind::Modify(ModifyKind::Any)).add_path(path.to_path_buf())
}

fn remove_event(path: &std::path::Path) -> notify::Event {
    notify::Event::new(EventKind::Remove(RemoveKind::File)).add_path(path.to_path_buf())
}

fn track_id(db: &Arc<Mutex<rusqlite::Connection>>, path: &std::path::Path) -> Option<i64> {
    let conn = db.lock().unwrap();
    library_repo::get_track_id_by_path(&conn, path.to_str().unwrap()).unwrap()
}

#[test]
fn batch_imports_created_files() {
    let music_dir = tempfile::tempdir().unwrap();
    let data_dir = tempfile::tempdir().unwrap();
    let db = Arc::new(Mutex::new(common::create_test_db()));

    let a = common::create_test_wav(music_dir.path(), "a.wav");
    let b = common::create_test_wav(music_dir.path(), "b.wav");

    let (changed, removed) =
        process_event_batch(&[create_event(&a), create_event(&b)], &db, data_dir.path());

    assert!(changed);
    assert!(removed.is_empty());
    assert!(track_id(&db, &a).is_some());
    assert!(track_id(&db, &b).is_some());
}

/// A Modify event (retag) re-imports the file via upsert — the existing row
/// must keep its id and play_count instead of being replaced by a fresh
/// parse that knows nothing about them.
#[test]
fn batch_preserves_play_count_on_metadata_change() {
    let music_dir = tempfile::tempdir().unwrap();
    let data_dir = tempfile::tempdir().unwrap();
    let db = Arc::new(Mutex::new(common::create_test_db()));

    let a = common::create_test_wav(music_dir.path(), "a.wav");
    process_event_batch(&[create_event(&a)], &db, data_dir.path());
    let id = track_id(&db, &a).unwrap();
    {
        let conn = db.lock().unwrap();
        library_repo::increment_play_count(&conn, id).unwrap();
    }

    let (changed, removed) = process_event_batch(&[modify_event(&a)], &db, data_dir.path());

    assert!(changed);
    assert!(removed.is_empty());
    assert_eq!(track_id(&db, &a), Some(id));
    let conn = db.lock().unwrap();
    let track = library_repo::get_track_by_id(&conn, id).unwrap().unwrap();
    assert_eq!(track.play_count, 1);
}

#[test]
fn batch_removes_deleted_files() {
    let music_dir = tempfile::tempdir().unwrap();
    let data_dir = tempfile::tempdir().unwrap();
    let db = Arc::new(Mutex::new(common::create_test_db()));

    let a = common::create_test_wav(music_dir.path(), "a.wav");
    process_event_batch(&[create_event(&a)], &db, data_dir.path());
    let id = track_id(&db, &a).unwrap();

    std::fs::remove_file(&a).unwrap();
    let (changed, removed) = process_event_batch(&[remove_event(&a)], &db, data_dir.path());

    assert!(changed);
    assert_eq!(removed, vec![id]);
    assert!(track_id(&db, &a).is_none());
}
