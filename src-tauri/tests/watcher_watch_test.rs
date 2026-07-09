use std::collections::HashSet;
use std::path::PathBuf;

use lyra_music_lib::scanner::watcher::watch_path;

/// A failed watch attempt (e.g. folder on an unmounted USB drive) must not
/// mark the path as watched — a later attempt after the drive is mounted
/// would otherwise be deduplicated away until restart.
#[test]
fn failed_watch_keeps_path_retryable() {
    let mut watched: HashSet<PathBuf> = HashSet::new();

    watch_path(&mut watched, "/mnt/usb/music", |_| {
        Err(notify::Error::generic("No path was found."))
    });
    assert!(watched.is_empty());

    watch_path(&mut watched, "/mnt/usb/music", |_| Ok(()));
    assert!(watched.contains(&PathBuf::from("/mnt/usb/music")));
}

#[test]
fn successful_watch_is_deduplicated() {
    let mut watched: HashSet<PathBuf> = HashSet::new();

    watch_path(&mut watched, "/music", |_| Ok(()));
    assert_eq!(watched.len(), 1);

    let mut called = false;
    watch_path(&mut watched, "/music", |_| {
        called = true;
        Ok(())
    });
    assert!(!called);
    assert_eq!(watched.len(), 1);
}
