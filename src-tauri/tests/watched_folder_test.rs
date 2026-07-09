use lyra_music_lib::models::watched_folder::WatchedFolder;

#[test]
fn from_path_flags_existing_dir() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().to_str().unwrap().to_string();

    let folder = WatchedFolder::from_path(path.clone());

    assert_eq!(folder.path, path);
    assert!(folder.exists);
}

#[test]
fn from_path_flags_missing_dir() {
    let folder = WatchedFolder::from_path("/nonexistent/lyra-watched-folder-test".to_string());

    assert!(!folder.exists);
}

/// A path that exists but is a file (not a directory) cannot be watched —
/// it must be flagged the same way as a missing folder.
#[test]
fn from_path_flags_file_as_not_a_folder() {
    let dir = tempfile::tempdir().unwrap();
    let file_path = dir.path().join("song.mp3");
    std::fs::write(&file_path, b"x").unwrap();

    let folder = WatchedFolder::from_path(file_path.to_str().unwrap().to_string());

    assert!(!folder.exists);
}
