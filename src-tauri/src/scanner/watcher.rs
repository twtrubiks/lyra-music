use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

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
    let mut changed = false;
    let mut removed_track_ids: Vec<i64> = Vec::new();

    let conn = match db.lock() {
        Ok(c) => c,
        Err(e) => {
            eprintln!("Failed to acquire database lock: {e}");
            return (false, Vec::new());
        }
    };

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
