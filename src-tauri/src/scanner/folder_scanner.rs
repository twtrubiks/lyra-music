use std::collections::HashSet;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

use crate::error::AppError;

const SUPPORTED_EXTENSIONS: &[&str] = &["mp3", "flac", "wav", "ogg", "m4a", "aac"];

/// Check whether a file path has a supported audio extension.
pub fn is_supported_audio_file(file_path: &str) -> bool {
    let path = Path::new(file_path);
    path.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|ext| SUPPORTED_EXTENSIONS.contains(&ext.to_lowercase().as_str()))
}

/// Recursively collect supported audio files under `folder_path`, following
/// symlinks. A directory reachable through more than one path is scanned
/// only the first time it is met — but the visited set lives in this call
/// alone, so two separate scans (e.g. a folder and a symlink to it added as
/// two library sources) still yield the same files under different paths.
pub fn scan_folder(folder_path: &str) -> Result<Vec<String>, AppError> {
    let root = Path::new(folder_path);
    if !root.is_dir() {
        return Err(AppError::Generic(format!(
            "Path is not a directory: {folder_path}"
        )));
    }

    let mut audio_files = Vec::new();
    let mut visited_dirs: HashSet<PathBuf> = HashSet::new();

    let mut walker = WalkDir::new(root).follow_links(true).into_iter();
    while let Some(entry_result) = walker.next() {
        let entry = match entry_result {
            Ok(e) => e,
            Err(e) => {
                eprintln!("Warning: skipping entry during scan: {e}");
                continue;
            }
        };

        let path = entry.path();

        if path.is_dir() {
            match path.canonicalize() {
                Ok(canonical) => {
                    if !visited_dirs.insert(canonical) {
                        eprintln!(
                            "Warning: skipping already-visited directory (possible symlink cycle): {}",
                            path.display()
                        );
                        // `continue` alone would still descend into it — the
                        // same files would be imported again under this path.
                        walker.skip_current_dir();
                        continue;
                    }
                }
                Err(e) => {
                    eprintln!("Warning: failed to canonicalize {}: {e}", path.display());
                    continue;
                }
            }
        }

        if path.is_file()
            && let Some(ext) = path.extension().and_then(|e| e.to_str())
            && SUPPORTED_EXTENSIONS.contains(&ext.to_lowercase().as_str())
            && let Some(abs) = path.to_str()
        {
            audio_files.push(abs.to_string());
        }
    }

    Ok(audio_files)
}
