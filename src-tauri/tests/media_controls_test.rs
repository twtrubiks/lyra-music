#![cfg(target_os = "linux")]

use lyra_music_lib::media_controls::{ChangeTracker, Changes, Status, file_url, status_of};

#[test]
fn status_is_stopped_without_a_track() {
    assert_eq!(status_of(None, false), Status::Stopped);
    // No track means nothing to resume, whatever the sink reports.
    assert_eq!(status_of(None, true), Status::Stopped);
}

#[test]
fn status_follows_is_playing_when_a_track_is_loaded() {
    assert_eq!(status_of(Some(1), true), Status::Playing);
    assert_eq!(status_of(Some(1), false), Status::Paused);
}

#[test]
fn first_observation_reports_everything_as_changed() {
    let mut tracker = ChangeTracker::default();
    assert_eq!(
        tracker.observe(None, Status::Stopped),
        Changes {
            track: true,
            status: true
        }
    );
}

#[test]
fn unchanged_state_reports_no_changes() {
    let mut tracker = ChangeTracker::default();
    tracker.observe(Some(1), Status::Playing);
    assert_eq!(
        tracker.observe(Some(1), Status::Playing),
        Changes {
            track: false,
            status: false
        }
    );
}

#[test]
fn pause_changes_only_the_status() {
    let mut tracker = ChangeTracker::default();
    tracker.observe(Some(1), Status::Playing);
    assert_eq!(
        tracker.observe(Some(1), Status::Paused),
        Changes {
            track: false,
            status: true
        }
    );
}

#[test]
fn next_track_changes_only_the_track() {
    let mut tracker = ChangeTracker::default();
    tracker.observe(Some(1), Status::Playing);
    assert_eq!(
        tracker.observe(Some(2), Status::Playing),
        Changes {
            track: true,
            status: false
        }
    );
}

#[test]
fn file_url_keeps_plain_paths_readable() {
    assert_eq!(
        file_url("/home/user/.local/share/app/covers/12.jpg"),
        "file:///home/user/.local/share/app/covers/12.jpg"
    );
}

#[test]
fn file_url_percent_encodes_spaces_and_non_ascii() {
    assert_eq!(file_url("/a b/音.png"), "file:///a%20b/%E9%9F%B3.png");
    assert_eq!(file_url("/a#b?c%d"), "file:///a%23b%3Fc%25d");
}
