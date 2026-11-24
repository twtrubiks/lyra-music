mod common;

use lyra_music_lib::audio::AudioPlayer;

/// AudioPlayer::new() requires a working audio output device.
/// In CI environments without audio hardware this will panic.
/// All audio tests are gated behind the `audio-tests` feature flag.
/// Run with: `cargo test --features audio-tests`

#[test]
#[cfg_attr(not(feature = "audio-tests"), ignore)]
fn test_audio_player_new() {
    let player = AudioPlayer::new().expect("need audio device");
    assert!(!player.is_playing());
    assert_eq!(player.get_pos(), 0.0);
    assert_eq!(player.get_duration(), 0.0);
}

#[test]
#[cfg_attr(not(feature = "audio-tests"), ignore)]
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
#[cfg_attr(not(feature = "audio-tests"), ignore)]
fn test_load_nonexistent_file() {
    let mut player = AudioPlayer::new().expect("need audio device");
    let result = player.load_and_play("/nonexistent/file.mp3", 0.0);
    assert!(result.is_err());
}

#[test]
#[cfg_attr(not(feature = "audio-tests"), ignore)]
fn test_load_and_play_wav() {
    let dir = tempfile::tempdir().expect("failed to create temp dir");
    let wav_path = common::create_test_wav(dir.path(), "play_test.wav");

    let mut player = AudioPlayer::new().expect("need audio device");
    let result = player.load_and_play(wav_path.to_str().unwrap(), 0.0);
    assert!(result.is_ok(), "load_and_play failed: {:?}", result.err());
    assert!(player.get_duration() > 0.0);
}

#[test]
#[cfg_attr(not(feature = "audio-tests"), ignore)]
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
#[cfg_attr(not(feature = "audio-tests"), ignore)]
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
#[cfg_attr(not(feature = "audio-tests"), ignore)]
fn test_try_seek_no_active_playback() {
    let mut player = AudioPlayer::new().expect("need audio device");
    let result = player.try_seek(10.0);
    assert!(result.is_err());
}

#[test]
#[cfg_attr(not(feature = "audio-tests"), ignore)]
fn test_set_current_track_id() {
    let mut player = AudioPlayer::new().expect("need audio device");
    assert!(player.get_current_track_id().is_none());

    player.set_current_track_id(Some(42));
    assert_eq!(player.get_current_track_id(), Some(42));

    player.set_current_track_id(None);
    assert!(player.get_current_track_id().is_none());
}

#[test]
#[cfg_attr(not(feature = "audio-tests"), ignore)]
fn test_default_volume() {
    let player = AudioPlayer::new().expect("need audio device");
    assert!((player.get_volume() - 0.5).abs() < f32::EPSILON);
}

// ============================================================
// Audio error path tests (Task 15)
// ============================================================

#[test]
#[cfg_attr(not(feature = "audio-tests"), ignore)]
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
#[cfg_attr(not(feature = "audio-tests"), ignore)]
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
#[cfg_attr(not(feature = "audio-tests"), ignore)]
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
#[cfg_attr(not(feature = "audio-tests"), ignore)]
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
#[cfg_attr(not(feature = "audio-tests"), ignore)]
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
#[cfg_attr(not(feature = "audio-tests"), ignore)]
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
#[cfg_attr(not(feature = "audio-tests"), ignore)]
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
#[cfg_attr(not(feature = "audio-tests"), ignore)]
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
#[cfg_attr(not(feature = "audio-tests"), ignore)]
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

/// stop() must clear pending gapless state: otherwise the polling thread
/// sees the sink gone (len 0) while gapless_queued is still true and fires
/// a phantom gapless transition to the stale next track.
#[test]
#[cfg_attr(not(feature = "audio-tests"), ignore)]
fn test_stop_clears_pending_gapless_queue() {
    let dir = tempfile::tempdir().unwrap();
    let wav1 = common::create_test_wav(dir.path(), "stop_gapless1.wav");
    let wav2 = common::create_test_wav(dir.path(), "stop_gapless2.wav");

    let mut player = AudioPlayer::new().expect("need audio device");
    player.load_and_play(wav1.to_str().unwrap(), 0.0).unwrap();
    player.queue_next(wav2.to_str().unwrap(), 2, 0.0).unwrap();
    assert!(player.is_gapless_queued());

    player.stop();

    assert!(!player.is_gapless_queued());
    assert!(
        !player.check_gapless_transition(),
        "stopped player must not report a gapless transition"
    );
    assert!(player.get_current_track_id().is_none());
}

// ============================================================
// Gapless transition & seek fix tests
// ============================================================

/// Mod 7: queue_next is idempotent — calling it twice does not double-append.
#[test]
#[cfg_attr(not(feature = "audio-tests"), ignore)]
fn test_queue_next_skips_when_already_queued() {
    let dir = tempfile::tempdir().unwrap();
    let wav1 = common::create_test_wav(dir.path(), "track1.wav");
    let wav2 = common::create_test_wav(dir.path(), "track2.wav");

    let mut player = AudioPlayer::new().expect("need audio device");
    player.load_and_play(wav1.to_str().unwrap(), 0.0).unwrap();

    // First queue succeeds
    player.queue_next(wav2.to_str().unwrap(), 2, 0.0).unwrap();
    assert!(player.is_gapless_queued());

    // Second queue is a no-op (returns Ok, does not append again)
    let result = player.queue_next(wav2.to_str().unwrap(), 2, 0.0);
    assert!(result.is_ok());
    assert!(player.is_gapless_queued());
}

/// Mod 5: acknowledge_track_ended sets track_loaded=false,
/// preventing has_track_ended from re-firing.
#[test]
#[cfg_attr(not(feature = "audio-tests"), ignore)]
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
#[cfg_attr(not(feature = "audio-tests"), ignore)]
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
#[cfg_attr(not(feature = "audio-tests"), ignore)]
fn test_gapless_transition_full_lifecycle() {
    let dir = tempfile::tempdir().unwrap();
    let wav1 = common::create_test_wav(dir.path(), "short1.wav"); // 0.1s
    let wav2 = common::create_test_wav(dir.path(), "short2.wav");

    let mut player = AudioPlayer::new().expect("need audio device");
    player.load_and_play(wav1.to_str().unwrap(), 0.1).unwrap();
    player.set_current_track_id(Some(1));

    player.queue_next(wav2.to_str().unwrap(), 2, 0.1).unwrap();
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
#[cfg_attr(not(feature = "audio-tests"), ignore)]
fn test_seek_preserves_gapless_on_native_seek() {
    let dir = tempfile::tempdir().unwrap();
    let wav1 = common::create_test_wav(dir.path(), "seek1.wav");
    let wav2 = common::create_test_wav(dir.path(), "seek2.wav");

    let mut player = AudioPlayer::new().expect("need audio device");
    player.load_and_play(wav1.to_str().unwrap(), 0.1).unwrap();
    player.queue_next(wav2.to_str().unwrap(), 2, 0.1).unwrap();
    assert!(player.is_gapless_queued());

    // Native seek (WAV supports it) should not clear gapless
    player.try_seek(0.05).unwrap();
    assert!(
        player.is_gapless_queued(),
        "native seek should preserve gapless state"
    );
}

/// Regression: the decoder was opened without the file's byte length, so
/// symphonia could not seek backward and every backward seek fell into the
/// reload fallback — which drops the queued gapless track. Opening the
/// decoder from the `File` makes backward seeks native.
#[test]
#[cfg_attr(not(feature = "audio-tests"), ignore)]
fn test_backward_seek_preserves_gapless() {
    let dir = tempfile::tempdir().unwrap();
    let wav1 = common::create_test_wav_with_samples(dir.path(), "back1.wav", 44100 * 3);
    let wav2 = common::create_test_wav(dir.path(), "back2.wav");

    let mut player = AudioPlayer::new().expect("need audio device");
    player.load_and_play(wav1.to_str().unwrap(), 3.0).unwrap();
    player.queue_next(wav2.to_str().unwrap(), 2, 0.1).unwrap();

    player.try_seek(2.0).unwrap();
    player.try_seek(0.5).unwrap();

    assert!(
        player.is_gapless_queued(),
        "backward seek should be native and keep the queued gapless track"
    );
    let pos = player.get_pos();
    assert!(
        (0.4..1.5).contains(&pos),
        "position should be near 0.5s, got {pos}"
    );
}

/// Regression: an m4a whose `moov` atom sits after `mdat` (ffmpeg's default,
/// i.e. not faststart) failed to open with "format not recognized" because
/// the demuxer could not seek to the end of a stream of unknown length.
#[test]
#[cfg_attr(not(feature = "audio-tests"), ignore)]
fn test_load_m4a_with_moov_at_end() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("moov_at_end.m4a");
    std::fs::write(&path, include_bytes!("fixtures/moov_at_end.m4a")).unwrap();

    let mut player = AudioPlayer::new().expect("need audio device");
    player
        .load_and_play(path.to_str().unwrap(), 0.0)
        .expect("m4a with moov after mdat must load");
    assert!(
        player.get_duration() > 0.0,
        "duration should come from the decoder, got {}",
        player.get_duration()
    );
}

/// has_track_ended returns false while gapless is queued,
/// even if the sink becomes empty (the queued track is playing).
#[test]
#[cfg_attr(not(feature = "audio-tests"), ignore)]
fn test_track_ended_false_when_gapless_queued() {
    let dir = tempfile::tempdir().unwrap();
    let wav1 = common::create_test_wav(dir.path(), "ended1.wav");
    let wav2 = common::create_test_wav(dir.path(), "ended2.wav");

    let mut player = AudioPlayer::new().expect("need audio device");
    player.load_and_play(wav1.to_str().unwrap(), 0.1).unwrap();
    player.queue_next(wav2.to_str().unwrap(), 2, 0.1).unwrap();

    // Even after first track finishes, has_track_ended is false
    // because gapless_queued is true
    std::thread::sleep(std::time::Duration::from_millis(300));
    assert!(
        !player.has_track_ended(),
        "has_track_ended should be false while gapless is queued"
    );
}

/// Regression: after a track ends naturally, a failed load (missing file)
/// must not leave stale state that re-arms has_track_ended() — that stale
/// signal made the frontend auto-advance loop pollute play counts.
#[test]
#[cfg_attr(not(feature = "audio-tests"), ignore)]
fn test_failed_load_does_not_rearm_track_ended() {
    let dir = tempfile::tempdir().unwrap();
    let wav = common::create_test_wav(dir.path(), "ended_then_fail.wav");

    let mut player = AudioPlayer::new().expect("need audio device");
    player.load_and_play(wav.to_str().unwrap(), 0.1).unwrap();

    // Wait for the 0.1s track to finish naturally
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
    while !player.has_track_ended() {
        assert!(
            std::time::Instant::now() < deadline,
            "test track never ended"
        );
        std::thread::sleep(std::time::Duration::from_millis(50));
    }
    player.acknowledge_track_ended();

    // Auto-advance hits a missing file
    let result = player.load_and_play("/nonexistent/missing.mp3", 30.0);
    assert!(result.is_err());

    // The failed load must not report track_ended again
    assert!(
        !player.has_track_ended(),
        "failed load re-armed track_ended"
    );
    // And must leave coherent (cleared) state instead of the old track's
    assert!(!player.is_playing());
    assert_eq!(player.get_pos(), 0.0);
    assert_eq!(player.get_duration(), 0.0);
}

/// A failed load should report which file could not be opened.
#[test]
#[cfg_attr(not(feature = "audio-tests"), ignore)]
fn test_failed_load_error_includes_path() {
    let mut player = AudioPlayer::new().expect("need audio device");
    let err = player
        .load_and_play("/nonexistent/missing.mp3", 30.0)
        .unwrap_err();
    assert!(
        err.to_string().contains("/nonexistent/missing.mp3"),
        "error should name the file, got: {err}"
    );
}

#[test]
#[cfg_attr(not(feature = "audio-tests"), ignore)]
fn test_queue_next_missing_file_error_includes_path() {
    let mut player = AudioPlayer::new().expect("need audio device");
    let dir = tempfile::tempdir().expect("failed to create temp dir");
    let wav = common::create_test_wav(dir.path(), "current.wav");
    player
        .load_and_play(wav.to_str().unwrap(), 1.0)
        .expect("load_and_play failed");

    let err = player
        .queue_next("/nonexistent/missing.mp3", 2, 1.0)
        .expect_err("queueing a missing file must fail");
    assert!(
        err.to_string().contains("/nonexistent/missing.mp3"),
        "error should name the missing file: {err}"
    );
    // A failed preload must not leave the player half-queued
    assert!(!player.is_gapless_queued());
}

// ============================================================
// Completion sequence tests — play counts are credited in the
// backend from these signals, so their integrity is what keeps
// play_count pollution structurally impossible.
// ============================================================

/// A natural end acknowledged by the polling thread records exactly one
/// completion for the current track.
#[test]
#[cfg_attr(not(feature = "audio-tests"), ignore)]
fn test_acknowledge_track_ended_records_completion() {
    let dir = tempfile::tempdir().unwrap();
    let wav = common::create_test_wav(dir.path(), "completion_ack.wav");

    let mut player = AudioPlayer::new().expect("need audio device");
    player.load_and_play(wav.to_str().unwrap(), 0.1).unwrap();
    player.set_current_track_id(Some(42));
    assert_eq!(player.completion_seq(), 0);

    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
    while !player.has_track_ended() {
        assert!(
            std::time::Instant::now() < deadline,
            "test track never ended"
        );
        std::thread::sleep(std::time::Duration::from_millis(50));
    }
    player.acknowledge_track_ended();

    assert_eq!(player.completion_seq(), 1);
    assert_eq!(player.last_completed_track_id(), Some(42));

    // The one-shot flag is consumed, but the completion info persists:
    // a consumer that missed this cycle can still see it next poll.
    assert!(!player.has_track_ended());
    assert_eq!(player.completion_seq(), 1);
    assert_eq!(player.last_completed_track_id(), Some(42));
}

/// A gapless transition records the completion of the *previous* track
/// (captured before current_track_id is swapped to the queued next).
#[test]
#[cfg_attr(not(feature = "audio-tests"), ignore)]
fn test_gapless_transition_records_completion_of_previous_track() {
    let dir = tempfile::tempdir().unwrap();
    let wav1 = common::create_test_wav(dir.path(), "completion_gap1.wav");
    let wav2 = common::create_test_wav(dir.path(), "completion_gap2.wav");

    let mut player = AudioPlayer::new().expect("need audio device");
    player.load_and_play(wav1.to_str().unwrap(), 0.1).unwrap();
    player.set_current_track_id(Some(1));
    player.queue_next(wav2.to_str().unwrap(), 2, 0.1).unwrap();

    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
    loop {
        if player.check_gapless_transition() {
            break;
        }
        assert!(
            std::time::Instant::now() < deadline,
            "gapless transition never fired"
        );
        std::thread::sleep(std::time::Duration::from_millis(50));
    }

    assert_eq!(player.completion_seq(), 1);
    assert_eq!(player.last_completed_track_id(), Some(1));
    assert_eq!(player.get_current_track_id(), Some(2));
}

/// A failed load never produces a completion: no ended signal re-arms, so
/// the sequence stays put and nothing can be credited.
#[test]
#[cfg_attr(not(feature = "audio-tests"), ignore)]
fn test_failed_load_records_no_completion() {
    let mut player = AudioPlayer::new().expect("need audio device");
    let result = player.load_and_play("/nonexistent/missing.mp3", 30.0);
    assert!(result.is_err());

    assert_eq!(player.completion_seq(), 0);
    assert!(player.last_completed_track_id().is_none());
    assert!(!player.has_track_ended());
}

/// stop() interrupts playback — an interrupted track is not a completion,
/// and history from earlier completions survives the stop.
#[test]
#[cfg_attr(not(feature = "audio-tests"), ignore)]
fn test_stop_is_not_a_completion() {
    let dir = tempfile::tempdir().unwrap();
    let wav = common::create_test_wav(dir.path(), "completion_stop.wav");

    let mut player = AudioPlayer::new().expect("need audio device");
    player.load_and_play(wav.to_str().unwrap(), 30.0).unwrap();
    player.set_current_track_id(Some(7));

    player.stop();

    assert_eq!(player.completion_seq(), 0);
    assert!(player.last_completed_track_id().is_none());
}

// ---------------------------------------------------------------------------
// Replacing / clearing the queued gapless track
// ---------------------------------------------------------------------------

/// Regression: once a next track was queued, queue_next was a silent no-op,
/// so a track removed from the queue (or a shuffle toggle) could not change
/// what played next — the stale track played anyway.
#[test]
#[cfg_attr(not(feature = "audio-tests"), ignore)]
fn test_queue_next_replaces_previously_queued_track() {
    let dir = tempfile::tempdir().unwrap();
    let a = common::create_test_wav_with_samples(dir.path(), "a.wav", 44100 / 2);
    // b is long: if it were still played, the sink would not be on c below.
    let b = common::create_test_wav_with_samples(dir.path(), "b.wav", 44100 * 5);
    let c = common::create_test_wav_with_samples(dir.path(), "c.wav", 44100 * 5);

    let mut player = AudioPlayer::new().expect("need audio device");
    player.load_and_play(a.to_str().unwrap(), 0.5).unwrap();
    player.set_current_track_id(Some(1));
    player.queue_next(b.to_str().unwrap(), 2, 5.0).unwrap();
    player.queue_next(c.to_str().unwrap(), 3, 5.0).unwrap();
    assert!(player.is_gapless_queued());

    std::thread::sleep(std::time::Duration::from_millis(1200));
    assert!(
        player.check_gapless_transition(),
        "should transition once the first track ends"
    );
    assert_eq!(
        player.get_current_track_id(),
        Some(3),
        "the replacement track must play, not the stale one"
    );
    // Position is within the replacement track, i.e. b was skipped instantly.
    let pos = player.get_pos();
    assert!(pos < 1.5, "replacement should have just started, got {pos}");
    assert!(!player.has_track_ended());
}

/// Queueing the track that is already queued must not restart or drop it.
#[test]
#[cfg_attr(not(feature = "audio-tests"), ignore)]
fn test_queue_next_same_track_is_noop() {
    let dir = tempfile::tempdir().unwrap();
    let a = common::create_test_wav_with_samples(dir.path(), "a.wav", 44100 / 2);
    let b = common::create_test_wav(dir.path(), "b.wav");

    let mut player = AudioPlayer::new().expect("need audio device");
    player.load_and_play(a.to_str().unwrap(), 0.5).unwrap();
    player.set_current_track_id(Some(1));
    player.queue_next(b.to_str().unwrap(), 2, 0.1).unwrap();
    player.queue_next(b.to_str().unwrap(), 2, 0.1).unwrap();
    assert!(player.is_gapless_queued());

    std::thread::sleep(std::time::Duration::from_millis(1000));
    assert!(player.check_gapless_transition());
    assert_eq!(player.get_current_track_id(), Some(2));
}

/// Regression: there was no way to un-queue the next track, so removing it
/// from the queue while the current track played did not stop it playing.
#[test]
#[cfg_attr(not(feature = "audio-tests"), ignore)]
fn test_clear_queued_next_stops_after_current_track() {
    let dir = tempfile::tempdir().unwrap();
    let a = common::create_test_wav_with_samples(dir.path(), "a.wav", 44100 / 2);
    let b = common::create_test_wav_with_samples(dir.path(), "b.wav", 44100 * 5);

    let mut player = AudioPlayer::new().expect("need audio device");
    player.load_and_play(a.to_str().unwrap(), 0.5).unwrap();
    player.set_current_track_id(Some(1));
    player.queue_next(b.to_str().unwrap(), 2, 5.0).unwrap();

    player.clear_queued_next();
    assert!(!player.is_gapless_queued());

    std::thread::sleep(std::time::Duration::from_millis(1200));
    assert!(
        !player.check_gapless_transition(),
        "no transition after the queued track was cleared"
    );
    assert_eq!(player.get_current_track_id(), Some(1));
    assert!(
        player.has_track_ended(),
        "playback should end with the current track; the cleared track must not play"
    );
}

/// The cancelled source resets the sink position to 0 when the queue reaches
/// it, so the end of a track longer than the 1 s position guard must still be
/// detected — otherwise auto-advance and the play count never happen.
#[test]
#[cfg_attr(not(feature = "audio-tests"), ignore)]
fn test_clear_queued_next_still_reports_end_of_longer_track() {
    let dir = tempfile::tempdir().unwrap();
    let a = common::create_test_wav_with_samples(dir.path(), "a.wav", 44100 * 5 / 2);
    let b = common::create_test_wav_with_samples(dir.path(), "b.wav", 44100 * 5);

    let mut player = AudioPlayer::new().expect("need audio device");
    player.load_and_play(a.to_str().unwrap(), 2.5).unwrap();
    player.set_current_track_id(Some(1));
    player.queue_next(b.to_str().unwrap(), 2, 5.0).unwrap();
    player.clear_queued_next();

    std::thread::sleep(std::time::Duration::from_millis(1000));
    assert!(
        !player.has_track_ended(),
        "must not report the end while the current track is still playing"
    );

    std::thread::sleep(std::time::Duration::from_millis(2300));
    assert!(!player.check_gapless_transition());
    assert!(
        player.has_track_ended(),
        "the end of the current track must be detected after a cleared queue"
    );
}

/// A replacement that fails to open has already cancelled the old queued
/// track; the current track's end must still be reported so the frontend can
/// advance on its own.
#[test]
#[cfg_attr(not(feature = "audio-tests"), ignore)]
fn test_queue_next_failed_replacement_still_reports_end() {
    let dir = tempfile::tempdir().unwrap();
    let a = common::create_test_wav_with_samples(dir.path(), "a.wav", 44100 * 5 / 2);
    let b = common::create_test_wav_with_samples(dir.path(), "b.wav", 44100 * 5);
    let missing = dir.path().join("missing.wav");

    let mut player = AudioPlayer::new().expect("need audio device");
    player.load_and_play(a.to_str().unwrap(), 2.5).unwrap();
    player.set_current_track_id(Some(1));
    player.queue_next(b.to_str().unwrap(), 2, 5.0).unwrap();
    assert!(
        player
            .queue_next(missing.to_str().unwrap(), 3, 5.0)
            .is_err()
    );
    assert!(!player.is_gapless_queued());

    std::thread::sleep(std::time::Duration::from_millis(3300));
    assert!(!player.check_gapless_transition());
    assert_eq!(player.get_current_track_id(), Some(1));
    assert!(player.has_track_ended());
}

/// Clearing with nothing queued is a harmless no-op.
#[test]
#[cfg_attr(not(feature = "audio-tests"), ignore)]
fn test_clear_queued_next_without_queue_is_noop() {
    let mut player = AudioPlayer::new().expect("need audio device");
    player.clear_queued_next();
    assert!(!player.is_gapless_queued());
}

/// Queueing after the current track has ended must not start playback: an
/// append to the drained sink would play at once with no track loaded.
#[test]
#[cfg_attr(not(feature = "audio-tests"), ignore)]
fn test_queue_next_after_track_ended_is_noop() {
    let dir = tempfile::tempdir().unwrap();
    let a = common::create_test_wav(dir.path(), "a.wav");
    let b = common::create_test_wav_with_samples(dir.path(), "b.wav", 44100 * 5);

    let mut player = AudioPlayer::new().expect("need audio device");
    player.load_and_play(a.to_str().unwrap(), 0.1).unwrap();
    player.set_current_track_id(Some(1));
    std::thread::sleep(std::time::Duration::from_millis(500));
    assert!(player.has_track_ended());
    player.acknowledge_track_ended();

    player.queue_next(b.to_str().unwrap(), 2, 5.0).unwrap();

    assert!(!player.is_gapless_queued());
    assert!(!player.is_playing(), "nothing may start playing");
}

/// Without an output device the app must still start: the player is created
/// without a stream and every idle operation stays harmless. Not gated —
/// this path never touches the audio backend.
#[test]
fn test_player_without_device_is_idle_and_harmless() {
    let mut player = AudioPlayer::without_device();
    assert!(!player.is_playing());
    assert_eq!(player.get_pos(), 0.0);
    assert_eq!(player.get_duration(), 0.0);
    assert!(!player.has_track_ended());
    assert!(!player.check_gapless_transition());

    player.set_volume(0.8);
    assert!((player.get_volume() - 0.8).abs() < f32::EPSILON);
    player.play();
    player.pause();
    player.stop();
    player.clear_queued_next();
    assert!(player.queue_next("/nonexistent.wav", 1, 1.0).is_err());
    assert!(player.try_seek(1.0).is_err());
}

/// The device is opened on the first load, so playback works once a device
/// is available even though none was opened at startup.
#[test]
#[cfg_attr(not(feature = "audio-tests"), ignore)]
fn test_player_without_device_opens_stream_on_first_load() {
    let dir = tempfile::tempdir().unwrap();
    let a = common::create_test_wav_with_samples(dir.path(), "a.wav", 44100);

    let mut player = AudioPlayer::without_device();
    player.load_and_play(a.to_str().unwrap(), 1.0).unwrap();
    assert!(player.is_playing());
}
