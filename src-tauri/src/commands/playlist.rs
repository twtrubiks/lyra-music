use tauri::State;

use crate::DbState;
use crate::error::AppError;
use crate::models::playlist::Playlist;
use crate::models::track::Track;
use crate::storage::playlist_repo;

#[tauri::command]
pub fn create_playlist(name: String, db: State<DbState>) -> Result<i64, AppError> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(AppError::Generic(
            "Playlist name cannot be empty".to_string(),
        ));
    }
    let conn = db.0.lock().map_err(|_| AppError::LockPoisoned)?;
    playlist_repo::create_playlist(&conn, trimmed)
}

#[tauri::command]
pub fn get_all_playlists(db: State<DbState>) -> Result<Vec<Playlist>, AppError> {
    let conn = db.0.lock().map_err(|_| AppError::LockPoisoned)?;
    playlist_repo::get_all_playlists(&conn)
}

#[tauri::command]
pub fn get_playlist_tracks(playlist_id: i64, db: State<DbState>) -> Result<Vec<Track>, AppError> {
    let conn = db.0.lock().map_err(|_| AppError::LockPoisoned)?;
    playlist_repo::get_playlist_tracks(&conn, playlist_id)
}

#[tauri::command]
pub fn add_to_playlist(
    playlist_id: i64,
    track_id: i64,
    db: State<DbState>,
) -> Result<(), AppError> {
    let conn = db.0.lock().map_err(|_| AppError::LockPoisoned)?;
    playlist_repo::add_to_playlist(&conn, playlist_id, track_id)
}

#[tauri::command]
pub fn remove_from_playlist(
    playlist_id: i64,
    track_id: i64,
    db: State<DbState>,
) -> Result<(), AppError> {
    let conn = db.0.lock().map_err(|_| AppError::LockPoisoned)?;
    playlist_repo::remove_from_playlist(&conn, playlist_id, track_id)
}

#[tauri::command]
pub fn batch_add_to_playlist(
    playlist_id: i64,
    track_ids: Vec<i64>,
    db: State<DbState>,
) -> Result<(), AppError> {
    let conn = db.0.lock().map_err(|_| AppError::LockPoisoned)?;
    playlist_repo::batch_add_to_playlist(&conn, playlist_id, &track_ids)
}

#[tauri::command]
pub fn batch_remove_from_playlist(
    playlist_id: i64,
    track_ids: Vec<i64>,
    db: State<DbState>,
) -> Result<(), AppError> {
    let conn = db.0.lock().map_err(|_| AppError::LockPoisoned)?;
    playlist_repo::batch_remove_from_playlist(&conn, playlist_id, &track_ids)
}

#[tauri::command]
pub fn reorder_playlist(
    playlist_id: i64,
    track_ids: Vec<i64>,
    db: State<DbState>,
) -> Result<(), AppError> {
    let conn = db.0.lock().map_err(|_| AppError::LockPoisoned)?;
    playlist_repo::reorder_playlist(&conn, playlist_id, &track_ids)
}

#[tauri::command]
pub fn reorder_playlists(playlist_ids: Vec<i64>, db: State<DbState>) -> Result<(), AppError> {
    let conn = db.0.lock().map_err(|_| AppError::LockPoisoned)?;
    playlist_repo::reorder_playlists(&conn, &playlist_ids)
}

#[tauri::command]
pub fn rename_playlist(id: i64, new_name: String, db: State<DbState>) -> Result<(), AppError> {
    let trimmed = new_name.trim();
    if trimmed.is_empty() {
        return Err(AppError::Generic(
            "Playlist name cannot be empty".to_string(),
        ));
    }
    let conn = db.0.lock().map_err(|_| AppError::LockPoisoned)?;
    playlist_repo::rename_playlist(&conn, id, trimmed)
}

#[tauri::command]
pub fn delete_playlist(id: i64, db: State<DbState>) -> Result<(), AppError> {
    let conn = db.0.lock().map_err(|_| AppError::LockPoisoned)?;
    playlist_repo::delete_playlist(&conn, id)
}

#[tauri::command]
pub fn save_playback_position(
    playlist_id: i64,
    track_id: i64,
    secs: f64,
    db: State<DbState>,
) -> Result<(), AppError> {
    let conn = db.0.lock().map_err(|_| AppError::LockPoisoned)?;
    playlist_repo::save_playback_position(&conn, playlist_id, track_id, secs)
}

#[tauri::command]
pub fn get_last_playback_position(
    playlist_id: i64,
    db: State<DbState>,
) -> Result<(Option<i64>, Option<f64>), AppError> {
    let conn = db.0.lock().map_err(|_| AppError::LockPoisoned)?;
    playlist_repo::get_last_playback_position(&conn, playlist_id)
}
