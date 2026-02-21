use serde::{Deserialize, Serialize};

#[allow(clippy::struct_excessive_bools)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlayerState {
    pub is_playing: bool,
    pub current_track_id: Option<i64>,
    pub position_secs: f64,
    pub duration_secs: f64,
    pub volume: f32,
    pub track_ended: bool,
    pub gapless_queued: bool,
    pub gapless_transitioned: bool,
}
