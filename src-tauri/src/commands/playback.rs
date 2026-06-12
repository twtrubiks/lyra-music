use tauri::State;

use crate::audio::SharedPlayer;
use crate::error::AppError;
use crate::models::player_state::PlayerState;

#[tauri::command]
pub fn play_track(
    path: String,
    duration_secs: f64,
    track_id: i64,
    player: State<SharedPlayer>,
) -> Result<(), AppError> {
    let mut p = player.lock().map_err(|_| AppError::LockPoisoned)?;
    p.load_and_play(&path, duration_secs)?;
    // Keep current_track_id in sync on every play path (gapless transitions
    // set it in transition_to_queued_next; failure paths clear it via stop).
    // The frontend relies on it to validate track_ended events.
    p.set_current_track_id(Some(track_id));
    Ok(())
}

#[tauri::command]
pub fn pause(player: State<SharedPlayer>) -> Result<(), AppError> {
    let p = player.lock().map_err(|_| AppError::LockPoisoned)?;
    p.pause();
    Ok(())
}

#[tauri::command]
pub fn resume(player: State<SharedPlayer>) -> Result<(), AppError> {
    let p = player.lock().map_err(|_| AppError::LockPoisoned)?;
    p.play();
    Ok(())
}

#[tauri::command]
pub fn stop(player: State<SharedPlayer>) -> Result<(), AppError> {
    let mut p = player.lock().map_err(|_| AppError::LockPoisoned)?;
    p.stop();
    Ok(())
}

#[tauri::command]
pub fn seek(position_secs: f64, player: State<SharedPlayer>) -> Result<(), AppError> {
    if !position_secs.is_finite() || position_secs < 0.0 {
        return Err(AppError::Audio("invalid seek position".to_string()));
    }
    let mut p = player.lock().map_err(|_| AppError::LockPoisoned)?;
    p.try_seek(position_secs)
}

#[tauri::command]
pub fn set_volume(volume: f32, player: State<SharedPlayer>) -> Result<(), AppError> {
    if !volume.is_finite() {
        return Err(AppError::Audio("invalid volume value".to_string()));
    }
    let mut p = player.lock().map_err(|_| AppError::LockPoisoned)?;
    p.set_volume(volume);
    Ok(())
}

#[tauri::command]
pub fn queue_next_track(
    path: String,
    next_id: i64,
    duration_secs: f64,
    player: State<SharedPlayer>,
) -> Result<(), AppError> {
    let mut p = player.lock().map_err(|_| AppError::LockPoisoned)?;
    p.queue_next(&path, next_id, duration_secs)
}

#[tauri::command]
pub fn get_player_state(player: State<SharedPlayer>) -> Result<PlayerState, AppError> {
    let p = player.lock().map_err(|_| AppError::LockPoisoned)?;
    Ok(PlayerState {
        is_playing: p.is_playing(),
        current_track_id: p.get_current_track_id(),
        position_secs: p.get_pos(),
        duration_secs: p.get_duration(),
        volume: p.get_volume(),
        track_ended: p.has_track_ended(),
        gapless_queued: p.is_gapless_queued(),
        gapless_transitioned: false,
    })
}
