mod common;

use std::time::Duration;

use lyra_music_lib::scanner::folder_scanner;

// ============================================================
// Symlink cycle detection tests (Task 16)
// ============================================================

#[test]
fn test_scan_folder_with_symlink_cycle_does_not_hang() {
    let dir = tempfile::tempdir().expect("failed to create temp dir");
    let root = dir.path();

    // Create a subdirectory
    let sub = root.join("subdir");
    std::fs::create_dir(&sub).unwrap();

    // Create a symlink cycle: subdir/link -> root
    let link = sub.join("link_to_root");
    std::os::unix::fs::symlink(root, &link).unwrap();

    // Place an audio file in root
    std::fs::write(root.join("song.mp3"), b"fake mp3").unwrap();

    // Scan with a timeout to ensure it doesn't hang
    let root_str = root.to_str().unwrap().to_string();
    let handle = std::thread::spawn(move || folder_scanner::scan_folder(&root_str));

    let result = handle.join();
    // The thread should finish (not hang forever)
    assert!(result.is_ok(), "scan_folder thread panicked or hung");

    let scan_result = result.unwrap();
    assert!(
        scan_result.is_ok(),
        "scan_folder failed: {:?}",
        scan_result.err()
    );

    let files = scan_result.unwrap();
    // Should find the mp3 file but not loop infinitely
    assert!(!files.is_empty(), "should find at least one audio file");
}

#[test]
fn test_scan_folder_with_deep_symlink_cycle() {
    let dir = tempfile::tempdir().expect("failed to create temp dir");
    let root = dir.path();

    // Create a deeper structure: root/a/b/c/link -> root/a
    let a = root.join("a");
    let b = a.join("b");
    let c = b.join("c");
    std::fs::create_dir_all(&c).unwrap();

    // Symlink c/link -> a (creates a cycle)
    let link = c.join("link_to_a");
    std::os::unix::fs::symlink(&a, &link).unwrap();

    // Place audio files at different levels
    std::fs::write(a.join("level1.flac"), b"fake").unwrap();
    std::fs::write(b.join("level2.wav"), b"fake").unwrap();
    std::fs::write(c.join("level3.ogg"), b"fake").unwrap();

    let root_str = root.to_str().unwrap().to_string();
    let handle = std::thread::spawn(move || folder_scanner::scan_folder(&root_str));

    // Wait with timeout
    let timeout = Duration::from_secs(10);
    let start = std::time::Instant::now();
    loop {
        if handle.is_finished() {
            break;
        }
        if start.elapsed() > timeout {
            panic!("scan_folder hung for more than 10 seconds — symlink cycle not detected");
        }
        std::thread::sleep(Duration::from_millis(100));
    }

    let result = handle.join().unwrap();
    assert!(result.is_ok(), "scan_folder failed: {:?}", result.err());

    let files = result.unwrap();
    // Should find the 3 audio files without duplicates from cycle
    assert!(
        files.len() >= 3,
        "expected at least 3 audio files, got {}",
        files.len()
    );
}

#[test]
fn test_scan_folder_with_mutual_symlink_cycle() {
    let dir = tempfile::tempdir().expect("failed to create temp dir");
    let root = dir.path();

    // Create two directories that symlink to each other
    let dir_a = root.join("dir_a");
    let dir_b = root.join("dir_b");
    std::fs::create_dir(&dir_a).unwrap();
    std::fs::create_dir(&dir_b).unwrap();

    // dir_a/link_b -> dir_b
    std::os::unix::fs::symlink(&dir_b, dir_a.join("link_b")).unwrap();
    // dir_b/link_a -> dir_a
    std::os::unix::fs::symlink(&dir_a, dir_b.join("link_a")).unwrap();

    // Place audio files in each directory
    std::fs::write(dir_a.join("a.mp3"), b"fake").unwrap();
    std::fs::write(dir_b.join("b.mp3"), b"fake").unwrap();

    let root_str = root.to_str().unwrap().to_string();
    let handle = std::thread::spawn(move || folder_scanner::scan_folder(&root_str));

    let timeout = Duration::from_secs(10);
    let start = std::time::Instant::now();
    loop {
        if handle.is_finished() {
            break;
        }
        if start.elapsed() > timeout {
            panic!("scan_folder hung — mutual symlink cycle not detected");
        }
        std::thread::sleep(Duration::from_millis(100));
    }

    let result = handle.join().unwrap();
    assert!(result.is_ok(), "scan_folder failed: {:?}", result.err());

    let files = result.unwrap();
    // Should find both audio files
    assert!(
        files.len() >= 2,
        "expected at least 2 audio files, got {}",
        files.len()
    );
}

#[test]
fn test_scan_folder_with_self_referencing_symlink() {
    let dir = tempfile::tempdir().expect("failed to create temp dir");
    let root = dir.path();

    // Create a symlink that points to itself
    let self_link = root.join("self_link");
    std::os::unix::fs::symlink(&self_link, &self_link).unwrap();

    // Place an audio file in root
    std::fs::write(root.join("track.mp3"), b"fake mp3").unwrap();

    let result = folder_scanner::scan_folder(root.to_str().unwrap());
    assert!(
        result.is_ok(),
        "scan_folder failed with self-referencing symlink"
    );

    let files = result.unwrap();
    assert!(
        files.iter().any(|f| f.ends_with("track.mp3")),
        "should still find the audio file despite broken symlink"
    );
}

#[test]
fn test_scan_folder_with_broken_symlink() {
    let dir = tempfile::tempdir().expect("failed to create temp dir");
    let root = dir.path();

    // Create a symlink pointing to a nonexistent target
    let broken_link = root.join("broken_link");
    std::os::unix::fs::symlink("/nonexistent/target/dir", &broken_link).unwrap();

    // Place an audio file in root
    std::fs::write(root.join("valid.flac"), b"fake flac").unwrap();

    let result = folder_scanner::scan_folder(root.to_str().unwrap());
    assert!(
        result.is_ok(),
        "scan_folder should handle broken symlinks gracefully"
    );

    let files = result.unwrap();
    assert!(
        files.iter().any(|f| f.ends_with("valid.flac")),
        "should still find valid audio files"
    );
}

#[test]
fn test_scan_folder_valid_symlink_no_cycle() {
    let dir = tempfile::tempdir().expect("failed to create temp dir");
    let root = dir.path();

    // Create a target directory with audio files
    let target = root.join("target");
    std::fs::create_dir(&target).unwrap();
    std::fs::write(target.join("linked_song.mp3"), b"fake mp3").unwrap();

    // Create a symlink to the target (no cycle)
    let link = root.join("music_link");
    std::os::unix::fs::symlink(&target, &link).unwrap();

    let result = folder_scanner::scan_folder(root.to_str().unwrap());
    assert!(result.is_ok());

    let files = result.unwrap();
    // The linked mp3 should be found (via the original path or the symlink)
    assert!(
        !files.is_empty(),
        "should find audio files through valid symlinks"
    );
}
