use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use crate::error::AppError;
use crate::metadata::{reader, writer};
use crate::models::browse::{AlbumSummary, ArtistSummary};
use crate::models::track::{FailedFile, ImportResult, Track, TrackDetails};
use crate::scanner::folder_scanner;
use crate::storage::library_repo;
use crate::DbState;
use crate::WatcherState;

#[derive(Serialize)]
pub struct BatchTrashResult {
    pub succeeded_ids: Vec<i64>,
    pub failed: Vec<BatchTrashFailure>,
}

#[derive(Serialize)]
pub struct BatchTrashFailure {
    pub id: i64,
    pub error: String,
}

fn process_audio_file(
    conn: &rusqlite::Connection,
    app_data_dir: &std::path::Path,
    file_path: &str,
) -> Result<Result<Track, FailedFile>, AppError> {
    match reader::read_metadata(file_path) {
        Ok(mut track) => {
            let id = library_repo::insert_track(conn, &track)?;
            track.id = id;

            if let Some((data, mime)) = reader::extract_cover_art_bytes(file_path) {
                if let Ok(cover_path) = reader::save_cover_art(app_data_dir, id, &data, &mime) {
                    library_repo::update_cover_art_path(conn, id, &cover_path)?;
                    track.cover_art_path = Some(cover_path);
                }
            }

            track.cover_art = None;
            Ok(Ok(track))
        }
        Err(e) => {
            eprintln!("[lyra] Failed to read metadata for {file_path}: {e}");
            Ok(Err(FailedFile {
                file_path: file_path.to_string(),
                error: e.to_string(),
            }))
        }
    }
}

#[tauri::command]
pub fn scan_folder(
    folder_path: String,
    db: State<DbState>,
    watcher_state: State<WatcherState>,
    app_handle: AppHandle,
) -> Result<ImportResult, AppError> {
    let file_paths = folder_scanner::scan_folder(&folder_path)?;
    let conn = db.0.lock().map_err(|_| AppError::LockPoisoned)?;

    library_repo::add_scan_folder(&conn, &folder_path)?;

    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Generic(format!("failed to get app data dir: {e}")))?;

    let tx = conn.unchecked_transaction()?;

    let mut tracks = Vec::new();
    let mut failed_files = Vec::new();
    for path in file_paths {
        match process_audio_file(&tx, &app_data_dir, &path)? {
            Ok(track) => tracks.push(track),
            Err(failed) => failed_files.push(failed),
        }
    }

    tx.commit()?;

    if let Ok(w) = watcher_state.0.lock() {
        if let Some(ref watcher) = *w {
            let _ = watcher.watch(&folder_path);
        }
    }

    Ok(ImportResult {
        tracks,
        failed_files,
    })
}

#[tauri::command]
pub fn import_paths(
    paths: Vec<String>,
    db: State<DbState>,
    app_handle: AppHandle,
) -> Result<ImportResult, AppError> {
    let conn = db.0.lock().map_err(|_| AppError::LockPoisoned)?;
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Generic(format!("failed to get app data dir: {e}")))?;

    let mut audio_files: Vec<String> = Vec::new();
    for p in &paths {
        let path = std::path::Path::new(p);
        if path.is_dir() {
            if let Ok(files) = folder_scanner::scan_folder(p) {
                audio_files.extend(files);
            }
        } else if folder_scanner::is_supported_audio_file(p) {
            audio_files.push(p.clone());
        }
    }

    let tx = conn.unchecked_transaction()?;
    let mut tracks = Vec::new();
    let mut failed_files = Vec::new();
    for file_path in audio_files {
        match process_audio_file(&tx, &app_data_dir, &file_path)? {
            Ok(track) => tracks.push(track),
            Err(failed) => failed_files.push(failed),
        }
    }
    tx.commit()?;

    Ok(ImportResult {
        tracks,
        failed_files,
    })
}

#[tauri::command]
pub fn get_all_tracks(db: State<DbState>) -> Result<Vec<Track>, AppError> {
    let conn = db.0.lock().map_err(|_| AppError::LockPoisoned)?;
    library_repo::get_all_tracks(&conn)
}

#[tauri::command]
pub fn get_track_cover(id: i64, db: State<DbState>) -> Result<Option<String>, AppError> {
    let conn = db.0.lock().map_err(|_| AppError::LockPoisoned)?;
    let cover_path = library_repo::get_track_cover_path(&conn, id)?;

    match cover_path {
        Some(path) => Ok(reader::read_cover_art_from_file(&path)),
        None => Ok(None),
    }
}

#[tauri::command]
pub fn search_tracks(query: String, db: State<DbState>) -> Result<Vec<Track>, AppError> {
    let conn = db.0.lock().map_err(|_| AppError::LockPoisoned)?;
    library_repo::search_tracks(&conn, &query)
}

#[tauri::command]
pub fn remove_track(id: i64, db: State<DbState>) -> Result<(), AppError> {
    let conn = db.0.lock().map_err(|_| AppError::LockPoisoned)?;
    if let Ok(Some(cover_path)) = library_repo::get_track_cover_path(&conn, id) {
        let _ = std::fs::remove_file(&cover_path);
    }
    library_repo::delete_track(&conn, id)
}

#[tauri::command]
pub fn trash_track(id: i64, db: State<DbState>) -> Result<(), AppError> {
    let conn = db.0.lock().map_err(|_| AppError::LockPoisoned)?;
    let track = library_repo::get_track_by_id(&conn, id)?
        .ok_or_else(|| AppError::Generic(format!("Track {id} not found")))?;
    if let Ok(Some(cover_path)) = library_repo::get_track_cover_path(&conn, id) {
        let _ = std::fs::remove_file(&cover_path);
    }
    trash::delete(&track.file_path)
        .map_err(|e| AppError::Generic(format!("Failed to trash file: {e}")))?;
    library_repo::delete_track(&conn, id)
}

#[tauri::command]
pub fn trash_tracks(ids: Vec<i64>, db: State<DbState>) -> Result<BatchTrashResult, AppError> {
    let conn = db.0.lock().map_err(|_| AppError::LockPoisoned)?;
    let tracks = library_repo::get_tracks_by_ids(&conn, &ids)?;

    let mut succeeded_ids = Vec::new();
    let mut failed = Vec::new();

    for track in &tracks {
        match trash::delete(&track.file_path) {
            Ok(()) => {
                if let Some(ref cover_path) = track.cover_art_path {
                    let _ = std::fs::remove_file(cover_path);
                }
                succeeded_ids.push(track.id);
            }
            Err(e) => {
                failed.push(BatchTrashFailure {
                    id: track.id,
                    error: format!("Failed to trash file: {e}"),
                });
            }
        }
    }

    // Mark any IDs not found in DB as failed
    let found_ids: std::collections::HashSet<i64> = tracks.iter().map(|t| t.id).collect();
    for &id in &ids {
        if !found_ids.contains(&id) {
            failed.push(BatchTrashFailure {
                id,
                error: format!("Track {id} not found"),
            });
        }
    }

    if !succeeded_ids.is_empty() {
        library_repo::delete_tracks(&conn, &succeeded_ids)?;
    }

    Ok(BatchTrashResult {
        succeeded_ids,
        failed,
    })
}

#[tauri::command]
pub fn remove_tracks(ids: Vec<i64>, db: State<DbState>) -> Result<BatchTrashResult, AppError> {
    let conn = db.0.lock().map_err(|_| AppError::LockPoisoned)?;
    let tracks = library_repo::get_tracks_by_ids(&conn, &ids)?;

    let found_ids: std::collections::HashSet<i64> = tracks.iter().map(|t| t.id).collect();

    let mut succeeded_ids = Vec::new();
    let mut failed = Vec::new();

    for &id in &ids {
        if found_ids.contains(&id) {
            succeeded_ids.push(id);
        } else {
            failed.push(BatchTrashFailure {
                id,
                error: format!("Track {id} not found"),
            });
        }
    }

    // Batch clean up cover art files
    for track in &tracks {
        if let Some(ref cover_path) = track.cover_art_path {
            let _ = std::fs::remove_file(cover_path);
        }
    }

    if !succeeded_ids.is_empty() {
        library_repo::delete_tracks(&conn, &succeeded_ids)?;
    }

    Ok(BatchTrashResult {
        succeeded_ids,
        failed,
    })
}

#[tauri::command]
pub fn get_track_details(id: i64, db: State<DbState>) -> Result<TrackDetails, AppError> {
    let conn = db.0.lock().map_err(|_| AppError::LockPoisoned)?;
    let track = library_repo::get_track_by_id(&conn, id)?
        .ok_or_else(|| AppError::Generic(format!("Track {id} not found")))?;
    reader::read_track_details(&track.file_path, &track)
}

#[tauri::command]
pub fn update_track_metadata(
    id: i64,
    title: Option<String>,
    artist: Option<String>,
    album: Option<String>,
    db: State<DbState>,
) -> Result<Track, AppError> {
    let conn = db.0.lock().map_err(|_| AppError::LockPoisoned)?;
    let track = library_repo::get_track_by_id(&conn, id)?
        .ok_or_else(|| AppError::Generic(format!("Track {id} not found")))?;

    let new_title = title.unwrap_or(track.title.clone());
    let new_artist = artist.unwrap_or(track.artist.clone());
    let new_album = album.unwrap_or(track.album.clone());

    writer::write_metadata(
        &track.file_path,
        Some(&new_title),
        Some(&new_artist),
        Some(&new_album),
    )?;

    library_repo::update_track_metadata(&conn, id, &new_title, &new_artist, &new_album)?;

    let updated = library_repo::get_track_by_id(&conn, id)?
        .ok_or_else(|| AppError::Generic(format!("Track {id} not found after update")))?;

    Ok(updated)
}

#[tauri::command]
pub fn get_all_artists(db: State<DbState>) -> Result<Vec<ArtistSummary>, AppError> {
    let conn = db.0.lock().map_err(|_| AppError::LockPoisoned)?;
    library_repo::get_all_artists(&conn)
}

#[tauri::command]
pub fn get_all_albums(db: State<DbState>) -> Result<Vec<AlbumSummary>, AppError> {
    let conn = db.0.lock().map_err(|_| AppError::LockPoisoned)?;
    library_repo::get_all_albums(&conn)
}

#[tauri::command]
pub fn get_tracks_by_artist(artist: String, db: State<DbState>) -> Result<Vec<Track>, AppError> {
    let conn = db.0.lock().map_err(|_| AppError::LockPoisoned)?;
    library_repo::get_tracks_by_artist(&conn, &artist)
}

#[tauri::command]
pub fn get_tracks_by_album(
    album: String,
    artist: String,
    db: State<DbState>,
) -> Result<Vec<Track>, AppError> {
    let conn = db.0.lock().map_err(|_| AppError::LockPoisoned)?;
    library_repo::get_tracks_by_album(&conn, &album, &artist)
}

#[tauri::command]
pub fn increment_play_count(track_id: i64, db: State<DbState>) -> Result<(), AppError> {
    let conn = db.0.lock().map_err(|_| AppError::LockPoisoned)?;
    library_repo::increment_play_count(&conn, track_id)
}

#[tauri::command]
pub fn get_most_played_tracks(
    limit: Option<i64>,
    db: State<DbState>,
) -> Result<Vec<Track>, AppError> {
    let conn = db.0.lock().map_err(|_| AppError::LockPoisoned)?;
    library_repo::get_most_played_tracks(&conn, limit.unwrap_or(50))
}

#[tauri::command]
pub fn start_watching(
    folder: String,
    db: State<DbState>,
    watcher_state: State<WatcherState>,
) -> Result<(), AppError> {
    let conn = db.0.lock().map_err(|_| AppError::LockPoisoned)?;
    library_repo::add_scan_folder(&conn, &folder)?;
    drop(conn);

    let w = watcher_state.0.lock().map_err(|_| AppError::LockPoisoned)?;
    if let Some(ref watcher) = *w {
        watcher.watch(&folder)?;
    }
    Ok(())
}

#[tauri::command]
pub fn stop_watching(
    folder: String,
    db: State<DbState>,
    watcher_state: State<WatcherState>,
) -> Result<(), AppError> {
    let conn = db.0.lock().map_err(|_| AppError::LockPoisoned)?;
    library_repo::remove_scan_folder(&conn, &folder)?;
    drop(conn);

    let w = watcher_state.0.lock().map_err(|_| AppError::LockPoisoned)?;
    if let Some(ref watcher) = *w {
        watcher.unwatch(&folder)?;
    }
    Ok(())
}

#[tauri::command]
pub fn get_watched_folders(db: State<DbState>) -> Result<Vec<String>, AppError> {
    let conn = db.0.lock().map_err(|_| AppError::LockPoisoned)?;
    library_repo::get_all_scan_folders(&conn)
}
