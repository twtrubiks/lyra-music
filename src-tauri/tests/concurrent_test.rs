mod common;

use std::sync::{Arc, Mutex};
use std::thread;

use lyra_music_lib::storage::library_repo;
use lyra_music_lib::storage::playlist_repo;

// ============================================================
// Concurrent access: multiple threads inserting tracks
// ============================================================

#[test]
fn test_concurrent_insert_tracks_no_data_corruption() {
    let conn = Arc::new(Mutex::new(common::create_test_db()));
    let num_threads = 8;
    let tracks_per_thread = 20;

    let mut handles = Vec::new();

    for t in 0..num_threads {
        let conn = Arc::clone(&conn);
        handles.push(thread::spawn(move || {
            for i in 0..tracks_per_thread {
                let idx = (t * tracks_per_thread + i) as u32;
                let track = common::create_test_track(idx);
                let conn = conn.lock().unwrap();
                library_repo::insert_track(&conn, &track).unwrap();
            }
        }));
    }

    for h in handles {
        h.join().expect("thread panicked");
    }

    let conn = conn.lock().unwrap();
    let tracks = library_repo::get_all_tracks(&conn).unwrap();
    assert_eq!(
        tracks.len(),
        (num_threads * tracks_per_thread) as usize,
        "expected {} tracks, got {}",
        num_threads * tracks_per_thread,
        tracks.len()
    );

    // Verify all file_paths are unique (no data corruption)
    let mut paths: Vec<String> = tracks.iter().map(|t| t.file_path.clone()).collect();
    paths.sort();
    paths.dedup();
    assert_eq!(
        paths.len(),
        (num_threads * tracks_per_thread) as usize,
        "duplicate file paths detected — data corruption"
    );
}

// ============================================================
// Concurrent access: interleaved inserts and reads
// ============================================================

#[test]
fn test_concurrent_insert_and_read() {
    let conn = Arc::new(Mutex::new(common::create_test_db()));
    let num_inserts = 50;

    // Pre-insert a track so readers always find at least one
    {
        let c = conn.lock().unwrap();
        let track = common::create_test_track(9999);
        library_repo::insert_track(&c, &track).unwrap();
    }

    let mut handles = Vec::new();

    // Writer threads
    for i in 0..num_inserts {
        let conn = Arc::clone(&conn);
        handles.push(thread::spawn(move || {
            let track = common::create_test_track(i as u32);
            let c = conn.lock().unwrap();
            library_repo::insert_track(&c, &track).unwrap();
        }));
    }

    // Reader threads
    for _ in 0..10 {
        let conn = Arc::clone(&conn);
        handles.push(thread::spawn(move || {
            let c = conn.lock().unwrap();
            let tracks = library_repo::get_all_tracks(&c).unwrap();
            // At least the pre-inserted track should be present
            assert!(!tracks.is_empty(), "reader got empty track list");
        }));
    }

    for h in handles {
        h.join().expect("thread panicked");
    }

    let c = conn.lock().unwrap();
    let all = library_repo::get_all_tracks(&c).unwrap();
    // 50 inserted + 1 pre-inserted
    assert_eq!(all.len(), num_inserts + 1);
}

// ============================================================
// Concurrent access: inserts and deletes
// ============================================================

#[test]
fn test_concurrent_insert_and_delete() {
    let conn = Arc::new(Mutex::new(common::create_test_db()));

    // Insert tracks first
    let mut ids = Vec::new();
    {
        let c = conn.lock().unwrap();
        for i in 0..20 {
            let track = common::create_test_track(i);
            let id = library_repo::insert_track(&c, &track).unwrap();
            ids.push(id);
        }
    }

    let mut handles = Vec::new();

    // Delete even-indexed tracks concurrently
    for &id in ids.iter().filter(|&&id| id % 2 == 0) {
        let conn = Arc::clone(&conn);
        handles.push(thread::spawn(move || {
            let c = conn.lock().unwrap();
            library_repo::delete_track(&c, id).unwrap();
        }));
    }

    // Insert more tracks concurrently
    for i in 100..110 {
        let conn = Arc::clone(&conn);
        handles.push(thread::spawn(move || {
            let track = common::create_test_track(i);
            let c = conn.lock().unwrap();
            library_repo::insert_track(&c, &track).unwrap();
        }));
    }

    for h in handles {
        h.join().expect("thread panicked");
    }

    let c = conn.lock().unwrap();
    let tracks = library_repo::get_all_tracks(&c).unwrap();
    // All remaining tracks should have valid, non-empty data
    for track in &tracks {
        assert!(!track.title.is_empty(), "track has empty title");
        assert!(!track.file_path.is_empty(), "track has empty file_path");
    }
}

// ============================================================
// Concurrent access: playlist operations from multiple threads
// ============================================================

#[test]
fn test_concurrent_playlist_operations() {
    let conn = Arc::new(Mutex::new(common::create_test_db()));

    // Set up tracks and playlists
    let mut track_ids = Vec::new();
    {
        let c = conn.lock().unwrap();
        for i in 0..10 {
            let track = common::create_test_track(i);
            let id = library_repo::insert_track(&c, &track).unwrap();
            track_ids.push(id);
        }
    }

    let pl_id;
    {
        let c = conn.lock().unwrap();
        pl_id = playlist_repo::create_playlist(&c, "Concurrent PL").unwrap();
    }

    let mut handles = Vec::new();

    // Add tracks to playlist from multiple threads
    for &tid in &track_ids {
        let conn = Arc::clone(&conn);
        handles.push(thread::spawn(move || {
            let c = conn.lock().unwrap();
            playlist_repo::add_to_playlist(&c, pl_id, tid).unwrap();
        }));
    }

    for h in handles {
        h.join().expect("thread panicked");
    }

    let c = conn.lock().unwrap();
    let pl_tracks = playlist_repo::get_playlist_tracks(&c, pl_id).unwrap();
    assert_eq!(
        pl_tracks.len(),
        track_ids.len(),
        "expected {} tracks in playlist, got {}",
        track_ids.len(),
        pl_tracks.len()
    );
}

// ============================================================
// Concurrent access: duplicate inserts from multiple threads
// ============================================================

#[test]
fn test_concurrent_duplicate_inserts() {
    let conn = Arc::new(Mutex::new(common::create_test_db()));
    let num_threads = 10;

    let mut handles = Vec::new();

    // All threads try to insert the SAME track
    for _ in 0..num_threads {
        let conn = Arc::clone(&conn);
        handles.push(thread::spawn(move || {
            let track = common::create_test_track(1); // same idx = same file_path
            let c = conn.lock().unwrap();
            // INSERT OR IGNORE should not error
            let result = library_repo::insert_track(&c, &track);
            assert!(
                result.is_ok(),
                "concurrent duplicate insert failed: {:?}",
                result.err()
            );
        }));
    }

    for h in handles {
        h.join().expect("thread panicked");
    }

    let c = conn.lock().unwrap();
    let tracks = library_repo::get_all_tracks(&c).unwrap();
    // Only one track should exist (INSERT OR IGNORE deduplicates)
    assert_eq!(tracks.len(), 1, "duplicate tracks were inserted");
}

// ============================================================
// Concurrent access: search while inserting
// ============================================================

#[test]
fn test_concurrent_search_during_inserts() {
    let conn = Arc::new(Mutex::new(common::create_test_db()));

    // Pre-insert a known track
    {
        let c = conn.lock().unwrap();
        let mut track = common::create_test_track(0);
        track.title = "Searchable Song".to_string();
        library_repo::insert_track(&c, &track).unwrap();
    }

    let mut handles = Vec::new();

    // Writer threads inserting more tracks
    for i in 1..30 {
        let conn = Arc::clone(&conn);
        handles.push(thread::spawn(move || {
            let track = common::create_test_track(i);
            let c = conn.lock().unwrap();
            library_repo::insert_track(&c, &track).unwrap();
        }));
    }

    // Reader threads searching
    for _ in 0..10 {
        let conn = Arc::clone(&conn);
        handles.push(thread::spawn(move || {
            let c = conn.lock().unwrap();
            let results = library_repo::search_tracks(&c, "Searchable").unwrap();
            // The pre-inserted track should always be findable
            assert!(
                !results.is_empty(),
                "search could not find pre-inserted track"
            );
        }));
    }

    for h in handles {
        h.join().expect("thread panicked");
    }
}

// ============================================================
// Concurrent access: playback position saves from multiple threads
// ============================================================

#[test]
fn test_concurrent_save_playback_position() {
    let conn = Arc::new(Mutex::new(common::create_test_db()));

    let (pl_id, track_ids);
    {
        let c = conn.lock().unwrap();
        pl_id = playlist_repo::create_playlist(&c, "Position PL").unwrap();
        let mut tids = Vec::new();
        for i in 0..5 {
            let track = common::create_test_track(i);
            let id = library_repo::insert_track(&c, &track).unwrap();
            tids.push(id);
        }
        track_ids = tids;
    }

    let mut handles = Vec::new();

    // Multiple threads saving playback positions
    for (i, &tid) in track_ids.iter().enumerate() {
        let conn = Arc::clone(&conn);
        handles.push(thread::spawn(move || {
            let c = conn.lock().unwrap();
            playlist_repo::save_playback_position(&c, pl_id, tid, i as f64 * 10.0).unwrap();
        }));
    }

    for h in handles {
        h.join().expect("thread panicked");
    }

    // Final position should be one of the saved values
    let c = conn.lock().unwrap();
    let (track_id, secs) = playlist_repo::get_last_playback_position(&c, pl_id).unwrap();
    assert!(track_id.is_some(), "no playback position saved");
    assert!(secs.is_some(), "no playback seconds saved");
    // The track_id should be one of the tracks we inserted
    assert!(
        track_ids.contains(&track_id.unwrap()),
        "saved track_id {} not in our track list",
        track_id.unwrap()
    );
}
