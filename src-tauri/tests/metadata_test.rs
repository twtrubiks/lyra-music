mod common;

use lyra_music_lib::metadata::reader;
use lyra_music_lib::metadata::writer;
use lyra_music_lib::models::track::Track;

#[test]
fn test_read_metadata_wav_file() {
    let dir = tempfile::tempdir().expect("failed to create temp dir");
    let wav_path = common::create_test_wav(dir.path(), "test.wav");

    let result = reader::read_metadata(wav_path.to_str().unwrap());
    assert!(result.is_ok(), "read_metadata failed: {:?}", result.err());

    let track = result.unwrap();
    assert_eq!(track.file_path, wav_path.to_str().unwrap());
    assert!(track.duration_secs > 0.0);
    // WAV files typically don't have tags, so should fallback to filename
    assert_eq!(track.title, "test");
    assert_eq!(track.artist, "Unknown Artist");
    assert_eq!(track.album, "Unknown Album");
    assert!(
        track.file_size_bytes > 0,
        "file_size_bytes should be > 0 for a real file"
    );
}

#[test]
fn test_read_metadata_invalid_timestamp_preserves_tags() {
    // Regression for the lofty timestamp bug: an ASCII TDRC frame with
    // non-digit characters (e.g. the Japanese era date "H17.10.26") errors in
    // BestAttempt mode and would fail the whole file read. It must not break
    // the import, and the remaining tags (title/artist) should still be read
    // instead of falling back to the filename. Fully non-ASCII timestamps are
    // already skipped gracefully by lofty itself.
    let dir = tempfile::tempdir().expect("failed to create temp dir");
    let path = common::create_test_wav_with_id3(
        dir.path(),
        "japanese_date.wav",
        "日本語タイトル",
        "テストアーティスト",
        "H17.10.26",
    );

    let track = reader::read_metadata(path.to_str().unwrap()).unwrap();
    assert_eq!(track.title, "日本語タイトル");
    assert_eq!(track.artist, "テストアーティスト");
}

#[test]
fn test_write_metadata_invalid_timestamp_still_writes() {
    // Regression: the writer read the file with lofty's default BestAttempt
    // mode, so a file with a non-digit TDRC frame (importable and playable
    // via the Relaxed reader) could never have its tags edited — the write
    // failed at the initial read. The writer must read in Relaxed mode too.
    let dir = tempfile::tempdir().expect("failed to create temp dir");
    let path = common::create_test_wav_with_id3(
        dir.path(),
        "japanese_date_edit.wav",
        "Old Title",
        "Old Artist",
        "H17.10.26",
    );

    writer::write_metadata(
        path.to_str().unwrap(),
        Some("New Title"),
        Some("New Artist"),
        Some("New Album"),
    )
    .expect("write_metadata must succeed on a file with an invalid timestamp frame");

    let track = reader::read_metadata(path.to_str().unwrap()).unwrap();
    assert_eq!(track.title, "New Title");
    assert_eq!(track.artist, "New Artist");
    assert_eq!(track.album, "New Album");
}

#[test]
fn test_read_metadata_album_artist_from_tpe2() {
    let dir = tempfile::tempdir().expect("failed to create temp dir");
    let path = common::create_test_wav_with_id3_frames(
        dir.path(),
        "album_artist.wav",
        &[
            (*b"TIT2", "Song"),
            (*b"TPE1", "Track Artist"),
            (*b"TPE2", "Album Artist"),
            (*b"TALB", "The Album"),
        ],
    );

    let track = reader::read_metadata(path.to_str().unwrap()).unwrap();
    assert_eq!(track.artist, "Track Artist");
    assert_eq!(track.album, "The Album");
    assert_eq!(track.album_artist.as_deref(), Some("Album Artist"));
}

#[test]
fn test_read_metadata_album_artist_absent_is_none() {
    let dir = tempfile::tempdir().expect("failed to create temp dir");
    let path = common::create_test_wav_with_id3(dir.path(), "no_aa.wav", "Song", "Artist", "2020");

    let track = reader::read_metadata(path.to_str().unwrap()).unwrap();
    assert!(track.album_artist.is_none());
}

#[test]
fn test_read_metadata_nonexistent_file() {
    let result = reader::read_metadata("/nonexistent/file.mp3");
    assert!(result.is_err());
}

#[test]
fn test_read_metadata_fallback_no_tags() {
    let dir = tempfile::tempdir().expect("failed to create temp dir");
    let wav_path = common::create_test_wav(dir.path(), "my_song.wav");

    let track = reader::read_metadata(wav_path.to_str().unwrap()).unwrap();
    // Should fallback to file stem as title
    assert_eq!(track.title, "my_song");
    assert_eq!(track.artist, "Unknown Artist");
    assert_eq!(track.album, "Unknown Album");
}

#[test]
fn test_read_metadata_cover_art_none_for_wav() {
    let dir = tempfile::tempdir().expect("failed to create temp dir");
    let wav_path = common::create_test_wav(dir.path(), "nocover.wav");

    let track = reader::read_metadata(wav_path.to_str().unwrap()).unwrap();
    assert!(track.cover_art.is_none());
}

#[test]
fn test_read_metadata_track_id_is_zero() {
    let dir = tempfile::tempdir().expect("failed to create temp dir");
    let wav_path = common::create_test_wav(dir.path(), "zero_id.wav");

    let track = reader::read_metadata(wav_path.to_str().unwrap()).unwrap();
    // read_metadata always returns id=0 (DB assigns the real id)
    assert_eq!(track.id, 0);
}

#[test]
fn test_read_cover_art_none_for_wav() {
    let dir = tempfile::tempdir().expect("failed to create temp dir");
    let wav_path = common::create_test_wav(dir.path(), "cover_test.wav");

    let cover = reader::extract_cover_art_bytes(wav_path.to_str().unwrap());
    assert!(cover.is_none());
}

#[test]
fn test_read_cover_art_nonexistent_file() {
    let cover = reader::extract_cover_art_bytes("/nonexistent/file.mp3");
    assert!(cover.is_none());
}

#[test]
fn test_read_track_details_wav_file() {
    let dir = tempfile::tempdir().expect("failed to create temp dir");
    let wav_path = common::create_test_wav(dir.path(), "details_test.wav");

    let track = reader::read_metadata(wav_path.to_str().unwrap()).unwrap();
    let details = reader::read_track_details(wav_path.to_str().unwrap(), &track).unwrap();

    assert_eq!(details.sample_rate_hz, Some(44100));
    assert_eq!(details.channels, Some(1)); // mono
    assert_eq!(details.bits_per_sample, Some(16));
    assert_eq!(details.format, "WAV");
    assert!(details.file_size_bytes > 0);
    assert!(details.duration_secs > 0.0);
}

#[test]
fn test_read_track_details_nonexistent_file() {
    let track = Track {
        id: 1,
        file_path: "/nonexistent/file.mp3".to_string(),
        title: "Fake".to_string(),
        artist: "Fake".to_string(),
        album: "Fake".to_string(),
        album_artist: None,
        duration_secs: 0.0,
        cover_art: None,
        cover_art_path: None,
        file_size_bytes: 0,
        play_count: 0,
        last_played_at: None,
    };

    let result = reader::read_track_details("/nonexistent/file.mp3", &track);
    assert!(result.is_err());
}
