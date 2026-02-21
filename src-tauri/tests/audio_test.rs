mod common;

use lyra_music_lib::audio::AudioPlayer;

/// AudioPlayer::new() requires a working audio output device.
/// In CI environments without audio hardware this will panic.
/// All audio tests are marked #[ignore] so they only run when
/// explicitly requested with `cargo test -- --ignored`.

#[test]
#[ignore]
fn test_audio_player_new() {
    let player = AudioPlayer::new().expect("need audio device");
    assert!(!player.is_playing());
    assert_eq!(player.get_pos(), 0.0);
    assert_eq!(player.get_duration(), 0.0);
}

#[test]
#[ignore]
fn test_set_volume_clamp() {
    let mut player = AudioPlayer::new().expect("need audio device");

    player.set_volume(0.5);
    assert!((player.get_volume() - 0.5).abs() < f32::EPSILON);

    player.set_volume(-0.5);
    assert!((player.get_volume() - 0.0).abs() < f32::EPSILON);

    player.set_volume(1.5);
    assert!((player.get_volume() - 1.0).abs() < f32::EPSILON);

    player.set_volume(0.0);
    assert!((player.get_volume() - 0.0).abs() < f32::EPSILON);

    player.set_volume(1.0);
    assert!((player.get_volume() - 1.0).abs() < f32::EPSILON);
}

#[test]
#[ignore]
fn test_load_nonexistent_file() {
    let mut player = AudioPlayer::new().expect("need audio device");
    let result = player.load_and_play("/nonexistent/file.mp3", 0.0);
    assert!(result.is_err());
}

#[test]
#[ignore]
fn test_load_and_play_wav() {
    let dir = tempfile::tempdir().expect("failed to create temp dir");
    let wav_path = common::create_test_wav(dir.path(), "play_test.wav");

    let mut player = AudioPlayer::new().expect("need audio device");
    let result = player.load_and_play(wav_path.to_str().unwrap(), 0.0);
    assert!(result.is_ok(), "load_and_play failed: {:?}", result.err());
    assert!(player.get_duration() > 0.0);
}

#[test]
#[ignore]
fn test_pause_and_resume() {
    let dir = tempfile::tempdir().expect("failed to create temp dir");
    let wav_path = common::create_test_wav(dir.path(), "pause_test.wav");

    let mut player = AudioPlayer::new().expect("need audio device");
    player
        .load_and_play(wav_path.to_str().unwrap(), 0.0)
        .unwrap();

    player.pause();
    assert!(!player.is_playing());

    player.play();
}

#[test]
#[ignore]
fn test_stop() {
    let dir = tempfile::tempdir().expect("failed to create temp dir");
    let wav_path = common::create_test_wav(dir.path(), "stop_test.wav");

    let mut player = AudioPlayer::new().expect("need audio device");
    player
        .load_and_play(wav_path.to_str().unwrap(), 0.0)
        .unwrap();

    player.stop();
    assert!(!player.is_playing());
    assert_eq!(player.get_pos(), 0.0);
}

#[test]
#[ignore]
fn test_try_seek_no_active_playback() {
    let mut player = AudioPlayer::new().expect("need audio device");
    let result = player.try_seek(10.0);
    assert!(result.is_err());
}

#[test]
#[ignore]
fn test_set_current_track_id() {
    let mut player = AudioPlayer::new().expect("need audio device");
    assert!(player.get_current_track_id().is_none());

    player.set_current_track_id(Some(42));
    assert_eq!(player.get_current_track_id(), Some(42));

    player.set_current_track_id(None);
    assert!(player.get_current_track_id().is_none());
}

#[test]
#[ignore]
fn test_default_volume() {
    let player = AudioPlayer::new().expect("need audio device");
    assert!((player.get_volume() - 0.5).abs() < f32::EPSILON);
}

// ============================================================
// Audio error path tests (Task 15)
// ============================================================

#[test]
#[ignore]
fn test_audio_player_new_returns_result() {
    // AudioPlayer::new() now returns Result<Self, AppError>
    let result = AudioPlayer::new();
    // On a machine with audio hardware, this should succeed
    assert!(
        result.is_ok(),
        "AudioPlayer::new() failed: {:?}",
        result.err()
    );
}

#[test]
#[ignore]
fn test_load_and_play_corrupted_file() {
    let player_result = AudioPlayer::new();
    if player_result.is_err() {
        return; // Skip if no audio device
    }
    let mut player = player_result.unwrap();

    // Create a file with invalid audio data
    let dir = tempfile::tempdir().expect("failed to create temp dir");
    let corrupt_path = dir.path().join("corrupted.mp3");
    std::fs::write(&corrupt_path, b"this is not valid audio data").unwrap();

    let result = player.load_and_play(corrupt_path.to_str().unwrap(), 0.0);
    assert!(result.is_err(), "loading corrupted file should fail");
}

#[test]
#[ignore]
fn test_load_and_play_empty_file() {
    let player_result = AudioPlayer::new();
    if player_result.is_err() {
        return;
    }
    let mut player = player_result.unwrap();

    let dir = tempfile::tempdir().expect("failed to create temp dir");
    let empty_path = dir.path().join("empty.wav");
    std::fs::write(&empty_path, b"").unwrap();

    let result = player.load_and_play(empty_path.to_str().unwrap(), 0.0);
    assert!(result.is_err(), "loading empty file should fail");
}

#[test]
#[ignore]
fn test_load_and_play_directory_path() {
    let player_result = AudioPlayer::new();
    if player_result.is_err() {
        return;
    }
    let mut player = player_result.unwrap();

    let dir = tempfile::tempdir().expect("failed to create temp dir");
    // Trying to load a directory as an audio file should fail
    let result = player.load_and_play(dir.path().to_str().unwrap(), 0.0);
    assert!(result.is_err(), "loading a directory should fail");
}

#[test]
#[ignore]
fn test_queue_next_with_no_active_sink() {
    let player_result = AudioPlayer::new();
    if player_result.is_err() {
        return;
    }
    let mut player = player_result.unwrap();

    // No track loaded, so no sink exists
    let result = player.queue_next("/nonexistent/file.mp3", 1, 0.0);
    assert!(
        result.is_err(),
        "queue_next with no active sink should fail"
    );
}

#[test]
#[ignore]
fn test_queue_next_with_nonexistent_file() {
    let player_result = AudioPlayer::new();
    if player_result.is_err() {
        return;
    }
    let mut player = player_result.unwrap();

    // Load a valid track first
    let dir = tempfile::tempdir().expect("failed to create temp dir");
    let wav_path = common::create_test_wav(dir.path(), "queue_test.wav");
    player
        .load_and_play(wav_path.to_str().unwrap(), 0.0)
        .unwrap();

    // Queue a nonexistent file
    let result = player.queue_next("/nonexistent/next.mp3", 2, 0.0);
    assert!(
        result.is_err(),
        "queue_next with nonexistent file should fail"
    );
}

#[test]
#[ignore]
fn test_queue_next_with_corrupted_file() {
    let player_result = AudioPlayer::new();
    if player_result.is_err() {
        return;
    }
    let mut player = player_result.unwrap();

    let dir = tempfile::tempdir().expect("failed to create temp dir");
    let wav_path = common::create_test_wav(dir.path(), "queue_valid.wav");
    player
        .load_and_play(wav_path.to_str().unwrap(), 0.0)
        .unwrap();

    // Create a corrupted file for next track
    let corrupt_path = dir.path().join("corrupt_next.mp3");
    std::fs::write(&corrupt_path, b"not audio").unwrap();

    let result = player.queue_next(corrupt_path.to_str().unwrap(), 2, 0.0);
    assert!(
        result.is_err(),
        "queue_next with corrupted file should fail"
    );
}

#[test]
#[ignore]
fn test_has_track_ended_before_loading() {
    let player_result = AudioPlayer::new();
    if player_result.is_err() {
        return;
    }
    let player = player_result.unwrap();

    // Before any track is loaded, track_ended should be false
    assert!(!player.has_track_ended());
}

#[test]
#[ignore]
fn test_stop_resets_state() {
    let player_result = AudioPlayer::new();
    if player_result.is_err() {
        return;
    }
    let mut player = player_result.unwrap();

    let dir = tempfile::tempdir().expect("failed to create temp dir");
    let wav_path = common::create_test_wav(dir.path(), "stop_state.wav");
    player
        .load_and_play(wav_path.to_str().unwrap(), 0.0)
        .unwrap();
    player.set_current_track_id(Some(42));

    player.stop();

    assert!(!player.is_playing());
    assert_eq!(player.get_pos(), 0.0);
    assert!(player.get_current_track_id().is_none());
}

// ============================================================
// Gapless transition & seek fix tests
// ============================================================

/// Mod 7: queue_next is idempotent — calling it twice does not double-append.
#[test]
#[ignore]
fn test_queue_next_skips_when_already_queued() {
    let dir = tempfile::tempdir().unwrap();
    let wav1 = common::create_test_wav(dir.path(), "track1.wav");
    let wav2 = common::create_test_wav(dir.path(), "track2.wav");

    let mut player = AudioPlayer::new().expect("need audio device");
    player
        .load_and_play(wav1.to_str().unwrap(), 0.0)
        .unwrap();

    // First queue succeeds
    player
        .queue_next(wav2.to_str().unwrap(), 2, 0.0)
        .unwrap();
    assert!(player.is_gapless_queued());

    // Second queue is a no-op (returns Ok, does not append again)
    let result = player.queue_next(wav2.to_str().unwrap(), 2, 0.0);
    assert!(result.is_ok());
    assert!(player.is_gapless_queued());
}

/// Mod 5: acknowledge_track_ended sets track_loaded=false,
/// preventing has_track_ended from re-firing.
#[test]
#[ignore]
fn test_acknowledge_track_ended_prevents_refire() {
    let dir = tempfile::tempdir().unwrap();
    let wav = common::create_test_wav(dir.path(), "ack_test.wav");

    let mut player = AudioPlayer::new().expect("need audio device");
    player.load_and_play(wav.to_str().unwrap(), 0.1).unwrap();

    // Wait for the short track (0.1s) to finish
    std::thread::sleep(std::time::Duration::from_millis(300));

    // Track should have ended
    assert!(
        player.has_track_ended(),
        "track should have ended after 300ms"
    );

    // Acknowledge it
    player.acknowledge_track_ended();

    // Now has_track_ended must return false (track_loaded is false)
    assert!(
        !player.has_track_ended(),
        "has_track_ended should not re-fire after acknowledge"
    );
}

/// Mod 1 basic: check_gapless_transition returns false when nothing is queued.
#[test]
#[ignore]
fn test_check_gapless_transition_without_queue() {
    let dir = tempfile::tempdir().unwrap();
    let wav = common::create_test_wav(dir.path(), "no_queue.wav");

    let mut player = AudioPlayer::new().expect("need audio device");
    player.load_and_play(wav.to_str().unwrap(), 0.0).unwrap();

    assert!(!player.check_gapless_transition());
}

/// Mod 1+2: full gapless lifecycle — load short track, queue next,
/// wait for first to finish, verify transition fires and state is correct.
#[test]
#[ignore]
fn test_gapless_transition_full_lifecycle() {
    let dir = tempfile::tempdir().unwrap();
    let wav1 = common::create_test_wav(dir.path(), "short1.wav"); // 0.1s
    let wav2 = common::create_test_wav(dir.path(), "short2.wav");

    let mut player = AudioPlayer::new().expect("need audio device");
    player.load_and_play(wav1.to_str().unwrap(), 0.1).unwrap();
    player.set_current_track_id(Some(1));

    player
        .queue_next(wav2.to_str().unwrap(), 2, 0.1)
        .unwrap();
    assert!(player.is_gapless_queued());

    // Wait for first track to finish (0.1s + margin)
    std::thread::sleep(std::time::Duration::from_millis(300));

    // sink.len() should have dropped — transition should fire
    let transitioned = player.check_gapless_transition();
    assert!(
        transitioned,
        "gapless transition should fire after first source consumed"
    );
    assert!(!player.is_gapless_queued());
    assert_eq!(player.get_current_track_id(), Some(2));

    // Mod 2: cumulative_duration was reset to 0, so get_pos reflects
    // the new track's position (not offset by old track's duration)
    let pos = player.get_pos();
    assert!(
        pos < 1.0,
        "position should be near start of second track, got {}",
        pos
    );
}

/// Mod 3 (indirect): native seek preserves gapless state.
/// (The fallback path clears it, but WAV seek uses the native path.)
#[test]
#[ignore]
fn test_seek_preserves_gapless_on_native_seek() {
    let dir = tempfile::tempdir().unwrap();
    let wav1 = common::create_test_wav(dir.path(), "seek1.wav");
    let wav2 = common::create_test_wav(dir.path(), "seek2.wav");

    let mut player = AudioPlayer::new().expect("need audio device");
    player.load_and_play(wav1.to_str().unwrap(), 0.1).unwrap();
    player
        .queue_next(wav2.to_str().unwrap(), 2, 0.1)
        .unwrap();
    assert!(player.is_gapless_queued());

    // Native seek (WAV supports it) should not clear gapless
    player.try_seek(0.05).unwrap();
    assert!(
        player.is_gapless_queued(),
        "native seek should preserve gapless state"
    );
}

/// has_track_ended returns false while gapless is queued,
/// even if the sink becomes empty (the queued track is playing).
#[test]
#[ignore]
fn test_track_ended_false_when_gapless_queued() {
    let dir = tempfile::tempdir().unwrap();
    let wav1 = common::create_test_wav(dir.path(), "ended1.wav");
    let wav2 = common::create_test_wav(dir.path(), "ended2.wav");

    let mut player = AudioPlayer::new().expect("need audio device");
    player.load_and_play(wav1.to_str().unwrap(), 0.1).unwrap();
    player
        .queue_next(wav2.to_str().unwrap(), 2, 0.1)
        .unwrap();

    // Even after first track finishes, has_track_ended is false
    // because gapless_queued is true
    std::thread::sleep(std::time::Duration::from_millis(300));
    assert!(
        !player.has_track_ended(),
        "has_track_ended should be false while gapless is queued"
    );
}
