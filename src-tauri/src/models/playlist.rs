use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Playlist {
    pub id: i64,
    pub name: String,
    pub track_ids: Vec<i64>,
    pub last_position_track_id: Option<i64>,
    pub last_position_secs: Option<f64>,
    pub sort_order: i64,
}
