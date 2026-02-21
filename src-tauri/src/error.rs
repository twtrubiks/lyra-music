use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Audio error: {0}")]
    Audio(String),
    #[error("Metadata error: {0}")]
    Metadata(String),
    #[error("Metadata write error: {0}")]
    MetadataWrite(String),
    #[error("Watcher error: {0}")]
    Watcher(String),
    #[error("Lock poisoned")]
    LockPoisoned,
    #[error("{0}")]
    Generic(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
