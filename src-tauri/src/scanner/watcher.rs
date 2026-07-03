use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use notify::event::{ModifyKind, RenameMode};
use notify::{Config, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use rusqlite::Connection;
use tauri::{AppHandle, Emitter, Manager};

use crate::error::AppError;
use crate::metadata::reader;
use crate::scanner::folder_scanner;
use crate::storage::library_repo;

enum WatcherCommand {
    Watch(String),
    Unwatch(String),
    Shutdown,
}

pub struct FolderWatcher {
    cmd_tx: mpsc::Sender<WatcherCommand>,
}

impl FolderWatcher {
    pub fn new(db: Arc<Mutex<Connection>>, app_handle: AppHandle) -> Result<Self, AppError> {
        let (cmd_tx, cmd_rx) = mpsc::channel::<WatcherCommand>();
        let (event_tx, event_rx) = mpsc::channel();

        let mut watcher = RecommendedWatcher::new(
            move |res: Result<notify::Event, notify::Error>| {
                if let Ok(event) = res {
                    let _ = event_tx.send(event);
                }
            },
            Config::default(),
        )
        .map_err(|e| AppError::Watcher(format!("Failed to create watcher: {e}")))?;

        let db_clone = Arc::<Mutex<Connection>>::clone(&db);
        let app_handle_clone = app_handle.clone();

        std::thread::spawn(move || {
            let mut watched_paths: HashSet<PathBuf> = HashSet::new();
            let debounce_duration = Duration::from_secs(2);
            let mut pending_events: Vec<notify::Event> = Vec::new();
            let mut last_event_time: Option<Instant> = None;

            loop {
                // Check for commands (non-blocking)
                while let Ok(cmd) = cmd_rx.try_recv() {
                    match cmd {
                        WatcherCommand::Watch(path) => {
                            let p = PathBuf::from(&path);
                            if watched_paths.insert(p.clone()) {
                                if let Err(e) = watcher.watch(&p, RecursiveMode::Recursive) {
                                    eprintln!("Failed to watch {path}: {e}");
                                }
                            }
                        }
                        WatcherCommand::Unwatch(path) => {
                            let p = PathBuf::from(&path);
                            if watched_paths.remove(&p) {
                                let _ = watcher.unwatch(&p);
                            }
                        }
                        WatcherCommand::Shutdown => return,
                    }
                }

                // Collect file events (non-blocking)
                while let Ok(event) = event_rx.try_recv() {
                    pending_events.push(event);
                    last_event_time = Some(Instant::now());
                }

                // Process debounced events
                if let Some(last_time) = last_event_time {
                    if last_time.elapsed() >= debounce_duration && !pending_events.is_empty() {
                        let events = std::mem::take(&mut pending_events);
                        last_event_time = None;

                        let (changed, removed_track_ids) =
                            process_event_batch(&events, &db_clone, &app_handle_clone);

                        if changed {
                            let _ = app_handle_clone.emit("library-changed", ());
                        }
                        if !removed_track_ids.is_empty() {
                            let _ = app_handle_clone.emit("tracks-removed", removed_track_ids);
                        }
                    }
                }

                std::thread::sleep(Duration::from_millis(200));
            }
        });

        Ok(FolderWatcher { cmd_tx })
    }

    pub fn watch(&self, folder_path: &str) -> Result<(), AppError> {
        self.cmd_tx
            .send(WatcherCommand::Watch(folder_path.to_string()))
            .map_err(|e| AppError::Watcher(format!("Failed to send watch command: {e}")))
    }

    pub fn unwatch(&self, folder_path: &str) -> Result<(), AppError> {
        self.cmd_tx
            .send(WatcherCommand::Unwatch(folder_path.to_string()))
            .map_err(|e| AppError::Watcher(format!("Failed to send unwatch command: {e}")))
    }
}

impl Drop for FolderWatcher {
    fn drop(&mut self) {
        let _ = self.cmd_tx.send(WatcherCommand::Shutdown);
    }
}

/// DB action for a single path in a watcher event.
#[derive(Debug, PartialEq, Eq)]
enum PathAction {
    Import,
    Remove,
    Ignore,
}

/// Decide what to do with one event path. Events are debounced for two
/// seconds, so the filesystem may have changed since the event fired —
/// always re-check the path's current state instead of trusting the event
/// kind alone (e.g. atomic saves emit Remove for a path that still exists).
fn classify_path_event(kind: EventKind, path: &Path) -> PathAction {
    let Some(path_str) = path.to_str() else {
        return PathAction::Ignore;
    };
    if !folder_scanner::is_supported_audio_file(path_str) {
        return PathAction::Ignore;
    }
    match kind {
        EventKind::Create(_) | EventKind::Modify(_) => {
            if path.is_file() {
                PathAction::Import
            } else if path.exists() {
                PathAction::Ignore
            } else {
                // File moved/trashed: Modify(Name) fires but
                // file no longer exists — treat as removal.
                PathAction::Remove
            }
        }
        EventKind::Remove(_) => {
            if path.exists() {
                // Deleted and recreated (or atomically replaced) within the
                // debounce window — the matching Create/Modify event handles
                // the re-import; deleting here would drop play counts and
                // playlist membership.
                PathAction::Ignore
            } else {
                PathAction::Remove
            }
        }
        _ => PathAction::Ignore,
    }
}

fn process_event_batch(
    events: &[notify::Event],
    db: &Arc<Mutex<Connection>>,
    app_handle: &AppHandle,
) -> (bool, Vec<i64>) {
    let mut removed_track_ids: Vec<i64> = Vec::new();

    let conn = match db.lock() {
        Ok(c) => c,
        Err(e) => {
            eprintln!("Failed to acquire database lock: {e}");
            return (false, Vec::new());
        }
    };

    // Renames first: once the row is repointed, the stray From/To events
    // from the same rename are harmless in the loop below — Remove misses
    // the old path and Import upserts the new one via ON CONFLICT.
    let mut changed = apply_rename_events(&conn, events, &mut removed_track_ids);

    for event in events {
        for path in &event.paths {
            let Some(path_str) = path.to_str() else {
                continue;
            };
            match classify_path_event(event.kind, path) {
                PathAction::Import => match process_new_file(&conn, app_handle, path_str) {
                    Ok(()) => changed = true,
                    Err(e) => eprintln!("[lyra] watcher: failed to import {path_str}: {e}"),
                },
                PathAction::Remove => {
                    remove_track(&conn, path_str, &mut removed_track_ids);
                    changed = true;
                }
                PathAction::Ignore => {}
            }
        }
    }

    (changed, removed_track_ids)
}

fn remove_track(conn: &Connection, path_str: &str, removed_track_ids: &mut Vec<i64>) {
    if let Ok(Some(track_id)) = library_repo::get_track_id_by_path(conn, path_str) {
        if let Ok(Some(cover_path)) = library_repo::delete_track_by_path(conn, path_str) {
            reader::remove_cover_art_file(&cover_path);
        }
        removed_track_ids.push(track_id);
    }
}

/// Handle rename events before per-path processing. notify's inotify backend
/// pairs `MOVED_FROM`/`MOVED_TO` by cookie into a single Both event carrying
/// `[old, new]` — repoint the DB row(s) instead of delete + re-import so
/// `play_count` and playlist membership survive same-filesystem moves. A
/// directory rename arrives as one Both event for the dir path only (no
/// per-child events), so children are repointed by prefix.
fn apply_rename_events(
    conn: &Connection,
    events: &[notify::Event],
    removed_track_ids: &mut Vec<i64>,
) -> bool {
    let mut changed = false;

    for event in events {
        if !matches!(
            event.kind,
            EventKind::Modify(ModifyKind::Name(RenameMode::Both))
        ) {
            continue;
        }
        let [from, to] = event.paths.as_slice() else {
            continue;
        };
        let (Some(from_str), Some(to_str)) = (from.to_str(), to.to_str()) else {
            continue;
        };

        if to.is_dir() {
            match library_repo::update_track_paths_by_prefix(conn, from_str, to_str) {
                Ok(n) if n > 0 => changed = true,
                Ok(_) => {}
                Err(e) => {
                    eprintln!("[lyra] watcher: failed to rename folder {from_str}: {e}");
                }
            }
        } else if folder_scanner::is_supported_audio_file(to_str) {
            // Untracked source falls through: the To/Import path in the
            // main loop imports the destination as a new track.
            if let Ok(Some(_)) = library_repo::get_track_id_by_path(conn, from_str) {
                // The move may have overwritten a different tracked file
                // at the destination — drop that stale row first so the
                // path UPDATE below doesn't hit the UNIQUE constraint.
                remove_track(conn, to_str, removed_track_ids);
                match library_repo::update_track_path(conn, from_str, to_str) {
                    Ok(_) => changed = true,
                    Err(e) => {
                        eprintln!("[lyra] watcher: failed to rename {from_str}: {e}");
                    }
                }
            }
        }
    }

    changed
}

#[cfg(test)]
mod tests {
    #![allow(clippy::unwrap_used)]

    use super::*;
    use notify::event::{AccessKind, CreateKind, ModifyKind, RemoveKind, RenameMode};

    /// Regression: an atomic save (or delete-then-recreate within the
    /// debounce window) emits Remove for a path that exists again by the
    /// time the batch is processed. Deleting the DB row here would reset
    /// play_count and playlist membership.
    #[test]
    fn remove_event_for_existing_file_is_ignored() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("song.mp3");
        std::fs::write(&path, b"x").unwrap();
        assert_eq!(
            classify_path_event(EventKind::Remove(RemoveKind::File), &path),
            PathAction::Ignore
        );
    }

    #[test]
    fn remove_event_for_missing_file_removes() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("song.mp3");
        assert_eq!(
            classify_path_event(EventKind::Remove(RemoveKind::File), &path),
            PathAction::Remove
        );
    }

    #[test]
    fn create_event_for_existing_file_imports() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("song.flac");
        std::fs::write(&path, b"x").unwrap();
        assert_eq!(
            classify_path_event(EventKind::Create(CreateKind::File), &path),
            PathAction::Import
        );
    }

    #[test]
    fn modify_rename_event_for_missing_file_removes() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("song.ogg");
        assert_eq!(
            classify_path_event(EventKind::Modify(ModifyKind::Name(RenameMode::From)), &path),
            PathAction::Remove
        );
    }

    #[test]
    fn modify_event_for_existing_file_imports() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("song.wav");
        std::fs::write(&path, b"x").unwrap();
        assert_eq!(
            classify_path_event(EventKind::Modify(ModifyKind::Any), &path),
            PathAction::Import
        );
    }

    #[test]
    fn non_audio_file_is_ignored() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("notes.txt");
        assert_eq!(
            classify_path_event(EventKind::Remove(RemoveKind::File), &path),
            PathAction::Ignore
        );
    }

    #[test]
    fn access_event_is_ignored() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("song.mp3");
        std::fs::write(&path, b"x").unwrap();
        assert_eq!(
            classify_path_event(EventKind::Access(AccessKind::Read), &path),
            PathAction::Ignore
        );
    }

    // ---- rename (RenameMode::Both) handling ----

    use crate::models::track::Track;
    use crate::storage::{db, playlist_repo};

    fn test_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        db::run_migrations(&conn).unwrap();
        conn
    }

    fn insert_track_at(conn: &Connection, path: &Path) -> i64 {
        let track = Track {
            id: 0,
            file_path: path.to_str().unwrap().to_string(),
            title: "T".to_string(),
            artist: "A".to_string(),
            album: "B".to_string(),
            album_artist: None,
            duration_secs: 1.0,
            cover_art: None,
            cover_art_path: None,
            file_size_bytes: 1,
            play_count: 0,
            last_played_at: None,
        };
        library_repo::insert_track(conn, &track).unwrap()
    }

    fn rename_event(from: &Path, to: &Path) -> notify::Event {
        notify::Event::new(EventKind::Modify(ModifyKind::Name(RenameMode::Both)))
            .add_path(from.to_path_buf())
            .add_path(to.to_path_buf())
    }

    /// A same-filesystem move arrives as one Both event with `[old, new]` —
    /// the row must be repointed, keeping id, `play_count` and playlist
    /// membership, instead of delete + re-import.
    #[test]
    fn rename_both_event_repoints_track() {
        let dir = tempfile::tempdir().unwrap();
        let old = dir.path().join("old.mp3");
        let new = dir.path().join("new.mp3");
        std::fs::write(&new, b"x").unwrap(); // file already at destination when the batch runs

        let conn = test_conn();
        let id = insert_track_at(&conn, &old);
        library_repo::increment_play_count(&conn, id).unwrap();
        let pl = playlist_repo::create_playlist(&conn, "pl").unwrap();
        playlist_repo::add_to_playlist(&conn, pl, id).unwrap();

        let mut removed = Vec::new();
        let changed = apply_rename_events(&conn, &[rename_event(&old, &new)], &mut removed);

        assert!(changed);
        assert!(removed.is_empty());
        assert_eq!(
            library_repo::get_track_id_by_path(&conn, new.to_str().unwrap()).unwrap(),
            Some(id)
        );
        assert_eq!(
            library_repo::get_track_id_by_path(&conn, old.to_str().unwrap()).unwrap(),
            None
        );
        let track = library_repo::get_track_by_id(&conn, id).unwrap().unwrap();
        assert_eq!(track.play_count, 1);
        let pl_tracks = playlist_repo::get_playlist_tracks(&conn, pl).unwrap();
        assert_eq!(pl_tracks.len(), 1);
        assert_eq!(pl_tracks[0].id, id);
    }

    /// inotify reports a directory rename as a single Both event for the dir
    /// path — no per-child events fire, so children must be repointed by
    /// prefix or their rows go stale.
    #[test]
    fn rename_both_event_directory_repoints_children() {
        let dir = tempfile::tempdir().unwrap();
        let old_dir = dir.path().join("Album A");
        let new_dir = dir.path().join("Album B");
        std::fs::create_dir(&new_dir).unwrap(); // dir already renamed on disk

        let conn = test_conn();
        let child_id = insert_track_at(&conn, &old_dir.join("01.mp3"));
        let other_id = insert_track_at(&conn, &dir.path().join("Other").join("02.mp3"));

        let mut removed = Vec::new();
        let changed = apply_rename_events(&conn, &[rename_event(&old_dir, &new_dir)], &mut removed);

        assert!(changed);
        assert!(removed.is_empty());
        assert_eq!(
            library_repo::get_track_id_by_path(&conn, new_dir.join("01.mp3").to_str().unwrap())
                .unwrap(),
            Some(child_id)
        );
        assert_eq!(
            library_repo::get_track_id_by_path(
                &conn,
                dir.path().join("Other").join("02.mp3").to_str().unwrap()
            )
            .unwrap(),
            Some(other_id)
        );
    }

    /// A move that overwrites a different tracked file must drop the stale
    /// destination row (reported via removed ids) so the path UPDATE does
    /// not hit the UNIQUE constraint.
    #[test]
    fn rename_both_event_removes_displaced_destination_row() {
        let dir = tempfile::tempdir().unwrap();
        let old = dir.path().join("old.mp3");
        let new = dir.path().join("new.mp3");
        std::fs::write(&new, b"x").unwrap();

        let conn = test_conn();
        let moved_id = insert_track_at(&conn, &old);
        library_repo::increment_play_count(&conn, moved_id).unwrap();
        let displaced_id = insert_track_at(&conn, &new);

        let mut removed = Vec::new();
        let changed = apply_rename_events(&conn, &[rename_event(&old, &new)], &mut removed);

        assert!(changed);
        assert_eq!(removed, vec![displaced_id]);
        assert_eq!(
            library_repo::get_track_id_by_path(&conn, new.to_str().unwrap()).unwrap(),
            Some(moved_id)
        );
        let track = library_repo::get_track_by_id(&conn, moved_id)
            .unwrap()
            .unwrap();
        assert_eq!(track.play_count, 1);
    }

    /// Renaming an untracked file is not ours to handle — the To/Import path
    /// in the main loop imports the destination as a new track.
    #[test]
    fn rename_both_event_untracked_source_is_ignored() {
        let dir = tempfile::tempdir().unwrap();
        let old = dir.path().join("old.mp3");
        let new = dir.path().join("new.mp3");
        std::fs::write(&new, b"x").unwrap();

        let conn = test_conn();
        let mut removed = Vec::new();
        let changed = apply_rename_events(&conn, &[rename_event(&old, &new)], &mut removed);

        assert!(!changed);
        assert!(removed.is_empty());
        assert!(library_repo::get_all_tracks(&conn).unwrap().is_empty());
    }
}

fn process_new_file(
    conn: &Connection,
    app_handle: &AppHandle,
    file_path: &str,
) -> Result<(), AppError> {
    let mut track = reader::read_metadata(file_path)?;
    let id = library_repo::insert_track(conn, &track)?;
    track.id = id;

    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Generic(format!("failed to get app data dir: {e}")))?;

    if let Some((data, mime)) = reader::extract_cover_art_bytes(file_path) {
        if let Ok(cover_path) = reader::save_cover_art(&app_data_dir, id, &data, &mime) {
            let _ = library_repo::update_cover_art_path(conn, id, &cover_path);
        }
    }

    Ok(())
}
