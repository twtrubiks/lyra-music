mod common;

use lyra_music_lib::scanner::folder_scanner;

#[test]
fn test_scan_empty_folder() {
    let dir = tempfile::tempdir().expect("failed to create temp dir");
    let result = folder_scanner::scan_folder(dir.path().to_str().unwrap()).unwrap();
    assert!(result.is_empty());
}

#[test]
fn test_scan_folder_with_audio_files() {
    let dir = tempfile::tempdir().expect("failed to create temp dir");

    // Create a real WAV file
    common::create_test_wav(dir.path(), "song.wav");

    // Create dummy files with supported extensions
    std::fs::write(dir.path().join("track.mp3"), b"fake mp3").unwrap();
    std::fs::write(dir.path().join("track.flac"), b"fake flac").unwrap();
    std::fs::write(dir.path().join("track.ogg"), b"fake ogg").unwrap();

    let result = folder_scanner::scan_folder(dir.path().to_str().unwrap()).unwrap();
    assert_eq!(result.len(), 4);
}

#[test]
fn test_scan_folder_filters_non_audio() {
    let dir = tempfile::tempdir().expect("failed to create temp dir");

    // Audio files
    std::fs::write(dir.path().join("song.mp3"), b"fake mp3").unwrap();

    // Non-audio files
    std::fs::write(dir.path().join("readme.txt"), b"text").unwrap();
    std::fs::write(dir.path().join("image.png"), b"image").unwrap();
    std::fs::write(dir.path().join("doc.pdf"), b"pdf").unwrap();

    let result = folder_scanner::scan_folder(dir.path().to_str().unwrap()).unwrap();
    assert_eq!(result.len(), 1);
    assert!(result[0].ends_with("song.mp3"));
}

#[test]
fn test_scan_nonexistent_path() {
    let result = folder_scanner::scan_folder("/nonexistent/path/that/does/not/exist");
    assert!(result.is_err());
}

#[test]
fn test_scan_folder_recursive() {
    let dir = tempfile::tempdir().expect("failed to create temp dir");

    // Create nested directories
    let sub = dir.path().join("subdir");
    std::fs::create_dir(&sub).unwrap();
    let deep = sub.join("deep");
    std::fs::create_dir(&deep).unwrap();

    std::fs::write(dir.path().join("root.mp3"), b"fake").unwrap();
    std::fs::write(sub.join("sub.flac"), b"fake").unwrap();
    std::fs::write(deep.join("deep.wav"), b"fake").unwrap();

    let result = folder_scanner::scan_folder(dir.path().to_str().unwrap()).unwrap();
    assert_eq!(result.len(), 3);
}

#[test]
fn test_scan_case_insensitive_extensions() {
    let dir = tempfile::tempdir().expect("failed to create temp dir");

    std::fs::write(dir.path().join("upper.MP3"), b"fake").unwrap();
    std::fs::write(dir.path().join("mixed.FlaC"), b"fake").unwrap();

    let result = folder_scanner::scan_folder(dir.path().to_str().unwrap()).unwrap();
    assert_eq!(result.len(), 2);
}
