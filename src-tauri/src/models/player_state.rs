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
    /// Monotonically increasing count of completed tracks. Level-triggered:
    /// unlike the one-shot `track_ended`/`gapless_transitioned` flags, it
    /// persists in every later snapshot, so a consumer that misses a poll
    /// cycle can still detect the completion by comparing sequences.
    pub completion_seq: u64,
    /// Track credited by the most recent completion (`completion_seq` bump).
    pub last_completed_track_id: Option<i64>,
}
