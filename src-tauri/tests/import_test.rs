mod common;

use std::sync::{Arc, Mutex};

use lyra_music_lib::commands::library::import_audio_files;

fn track_count(db: &Arc<Mutex<rusqlite::Connection>>) -> i64 {
    let conn = db.lock().unwrap();
    conn.query_row("SELECT COUNT(*) FROM tracks", [], |row| row.get(0))
        .unwrap()
}

#[test]
fn import_audio_files_imports_valid_and_reports_failed() {
    let music_dir = tempfile::tempdir().unwrap();
    let data_dir = tempfile::tempdir().unwrap();
    let db = Arc::new(Mutex::new(common::create_test_db()));

    let good = common::create_test_wav(music_dir.path(), "good.wav");
    let corrupt = music_dir.path().join("corrupt.mp3");
    std::fs::write(&corrupt, b"not really an mp3").unwrap();

    let paths = vec![
        good.to_string_lossy().into_owned(),
        corrupt.to_string_lossy().into_owned(),
    ];
    let result = import_audio_files(&db, data_dir.path(), &paths);

    assert_eq!(result.tracks.len(), 1);
    assert!(
        result.tracks[0].id > 0,
        "inserted track must carry its db id"
    );
    assert_eq!(result.failed_files.len(), 1);
    assert!(result.failed_files[0].file_path.ends_with("corrupt.mp3"));
    assert_eq!(track_count(&db), 1);
}

#[test]
fn import_audio_files_is_idempotent_on_rescan() {
    let music_dir = tempfile::tempdir().unwrap();
    let data_dir = tempfile::tempdir().unwrap();
    let db = Arc::new(Mutex::new(common::create_test_db()));

    common::create_test_wav(music_dir.path(), "a.wav");
    common::create_test_wav(music_dir.path(), "b.wav");
    let paths: Vec<String> = ["a.wav", "b.wav"]
        .iter()
        .map(|n| music_dir.path().join(n).to_string_lossy().into_owned())
        .collect();

    let first = import_audio_files(&db, data_dir.path(), &paths);
    let second = import_audio_files(&db, data_dir.path(), &paths);

    assert_eq!(first.tracks.len(), 2);
    assert_eq!(second.tracks.len(), 2);
    // Chunks commit independently, so a re-run must upsert, not duplicate
    assert_eq!(track_count(&db), 2);
}

#[test]
fn import_audio_files_handles_more_files_than_one_chunk() {
    let music_dir = tempfile::tempdir().unwrap();
    let data_dir = tempfile::tempdir().unwrap();
    let db = Arc::new(Mutex::new(common::create_test_db()));

    let paths: Vec<String> = (0..40)
        .map(|i| {
            common::create_test_wav(music_dir.path(), &format!("track_{i}.wav"))
                .to_string_lossy()
                .into_owned()
        })
        .collect();

    let result = import_audio_files(&db, data_dir.path(), &paths);

    assert_eq!(result.tracks.len(), 40);
    assert!(result.failed_files.is_empty());
    assert_eq!(track_count(&db), 40);
}

#[test]
fn import_reports_db_failure_as_failed_files_instead_of_aborting() {
    let music_dir = tempfile::tempdir().unwrap();
    let data_dir = tempfile::tempdir().unwrap();
    let db = Arc::new(Mutex::new(common::create_test_db()));

    let paths: Vec<String> = ["a.wav", "b.wav"]
        .iter()
        .map(|n| {
            common::create_test_wav(music_dir.path(), n)
                .to_string_lossy()
                .into_owned()
        })
        .collect();

    // Every chunk's transaction now fails at insert time
    {
        let conn = db.lock().unwrap();
        conn.execute("DROP TABLE tracks", []).unwrap();
    }

    let result = import_audio_files(&db, data_dir.path(), &paths);

    // A DB failure must surface per file in the result the frontend sees,
    // not abort the command and discard already-committed chunks
    assert!(result.tracks.is_empty());
    assert_eq!(result.failed_files.len(), 2);
    assert!(result.failed_files[0].error.contains("database error"));
}
