use std::path::Path;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WatchedFolder {
    pub path: String,
    /// Whether the path is currently a directory on disk — `false` usually
    /// means an unmounted drive or a deleted folder.
    pub exists: bool,
}

impl WatchedFolder {
    #[must_use]
    pub fn from_path(path: String) -> Self {
        let exists = Path::new(&path).is_dir();
        WatchedFolder { path, exists }
    }
}
