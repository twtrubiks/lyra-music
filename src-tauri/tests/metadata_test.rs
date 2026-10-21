mod common;

use lofty::config::WriteOptions;
use lofty::tag::{Accessor, Tag, TagExt, TagType};
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

/// Faststart M4A (`moov` before `mdat`, AAC, 0.3 s) with no `udta`/`meta` atoms at all.
/// Generated with ffmpeg `-movflags +faststart -f mp4 -fflags +bitexact`; ffmpeg
/// always writes a `udta`, so it was stripped afterwards and the `stco` offsets
/// shifted back by its size.
const FASTSTART_M4A_NO_UDTA: &[u8] = include_bytes!("fixtures/faststart_no_udta.m4a");

/// Find a direct child box of `data[start..end]`; returns (box offset, box size).
fn find_box(data: &[u8], start: usize, end: usize, kind: &[u8; 4]) -> (usize, usize) {
    let mut pos = start;
    while pos + 8 <= end {
        let size = u32::from_be_bytes(data[pos..pos + 4].try_into().unwrap()) as usize;
        // 0 (to end of file) and 1 (64-bit size) never occur in these small files
        assert!(size >= 8, "unsupported box size {size} at {pos}");
        if &data[pos + 4..pos + 8] == kind {
            return (pos, size);
        }
        pos += size;
    }
    panic!("box {} not found", String::from_utf8_lossy(kind));
}

/// Bytes of the first audio sample, located the way a decoder does: `stco` gives
/// the chunk offset and `stsz` the sample size.
fn first_sample_bytes(data: &[u8]) -> Vec<u8> {
    let (mut pos, mut size) = find_box(data, 0, data.len(), b"moov");
    for kind in [b"trak", b"mdia", b"minf", b"stbl"] {
        (pos, size) = find_box(data, pos + 8, pos + size, kind);
    }
    let read_u32 = |at: usize| u32::from_be_bytes(data[at..at + 4].try_into().unwrap()) as usize;
    let (stsz, _) = find_box(data, pos + 8, pos + size, b"stsz");
    let (stco, _) = find_box(data, pos + 8, pos + size, b"stco");
    // stsz: header(8) + version/flags(4) + sample_size(4) + count(4) + entries
    let sample_size = match read_u32(stsz + 12) {
        0 => read_u32(stsz + 20),
        fixed => fixed,
    };
    // stco: header(8) + version/flags(4) + count(4) + offsets
    let chunk_offset = read_u32(stco + 16);
    data[chunk_offset..chunk_offset + sample_size].to_vec()
}

#[test]
fn test_write_metadata_m4a_without_tags_keeps_audio_offsets() {
    // Regression for lofty#686 (fixed in lofty 0.25.2): writing tags to a
    // faststart M4A that has no `udta`/`meta` creates them inside `moov`, which
    // pushes `mdat` back — but the `stco` chunk offsets were not updated, so
    // they pointed at the wrong bytes and the audio was corrupted.
    let dir = tempfile::tempdir().expect("failed to create temp dir");
    let path = dir.path().join("no_tags.m4a");
    std::fs::write(&path, FASTSTART_M4A_NO_UDTA).unwrap();
    let original_sample = first_sample_bytes(FASTSTART_M4A_NO_UDTA);

    writer::write_metadata(
        path.to_str().unwrap(),
        Some("New Title"),
        Some("New Artist"),
        Some("New Album"),
    )
    .expect("write_metadata must succeed on an untagged m4a");

    let written = std::fs::read(&path).unwrap();
    assert_eq!(
        first_sample_bytes(&written),
        original_sample,
        "stco must still point at the original audio data after tags are added"
    );
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

/// The OS error message for opening `path`, e.g. "No such file or directory (os error 2)".
fn os_error_for(path: &str) -> String {
    std::fs::metadata(path).unwrap_err().to_string()
}

// Regression: since lofty 0.25 its error `Display` is only "failed to parse
// file" / "failed to write to file" — the actual cause lives in `source()`.
// Import failures and tag-edit errors are shown to the user, so the cause
// must be carried into the message.

#[test]
fn test_read_metadata_error_includes_cause() {
    let path = "/nonexistent/file.mp3";
    let err = reader::read_metadata(path).unwrap_err().to_string();
    assert!(err.contains(&os_error_for(path)), "missing cause in: {err}");
}

#[test]
fn test_write_metadata_read_error_includes_cause() {
    let path = "/nonexistent/file.mp3";
    let err = writer::write_metadata(path, Some("Title"), None, None)
        .unwrap_err()
        .to_string();
    assert!(err.contains(&os_error_for(path)), "missing cause in: {err}");
}

#[test]
fn test_write_metadata_save_error_includes_cause() {
    let dir = tempfile::tempdir().expect("failed to create temp dir");
    let path = common::create_test_wav_with_id3(dir.path(), "ro.wav", "Title", "Artist", "2020");
    let mut perms = std::fs::metadata(&path).unwrap().permissions();
    perms.set_readonly(true);
    std::fs::set_permissions(&path, perms).unwrap();

    let expected = match std::fs::OpenOptions::new().write(true).open(&path) {
        Err(e) => e.to_string(),
        Ok(_) => return, // running as root: read-only bits are not enforced
    };
    let err = writer::write_metadata(path.to_str().unwrap(), Some("New"), None, None)
        .unwrap_err()
        .to_string();
    assert!(err.contains(&expected), "missing cause in: {err}");
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
fn test_write_metadata_updates_existing_non_primary_tag() {
    // A WAV tagged only with RIFF INFO (its primary type is ID3v2): the edit
    // must land in that tag and keep the fields it does not touch, instead of
    // creating a fresh ID3v2 tag that shadows them.
    let dir = tempfile::tempdir().expect("failed to create temp dir");
    let wav_path = common::create_test_wav(dir.path(), "info_only.wav");
    let mut info = Tag::new(TagType::RiffInfo);
    info.set_title("Old Title".to_string());
    info.set_artist("Info Artist".to_string());
    info.save_to_path(&wav_path, WriteOptions::default())
        .unwrap();

    writer::write_metadata(wav_path.to_str().unwrap(), Some("New Title"), None, None).unwrap();

    let track = reader::read_metadata(wav_path.to_str().unwrap()).unwrap();
    assert_eq!(track.title, "New Title");
    assert_eq!(track.artist, "Info Artist");
}

#[test]
fn test_extract_cover_art_prefers_front_cover() {
    let dir = tempfile::tempdir().expect("failed to create temp dir");
    // The back cover comes first in tag order
    let wav_path = common::create_test_wav_with_pictures(
        dir.path(),
        "two_pictures.wav",
        &[(4, "image/png", b"back"), (3, "image/jpeg", b"front")],
    );

    let (data, mime) = reader::extract_cover_art_bytes(wav_path.to_str().unwrap()).unwrap();
    assert_eq!(data, b"front");
    assert_eq!(mime, "image/jpeg");
}

#[test]
fn test_extract_cover_art_falls_back_to_first_picture() {
    let dir = tempfile::tempdir().expect("failed to create temp dir");
    let wav_path = common::create_test_wav_with_pictures(
        dir.path(),
        "back_only.wav",
        &[(4, "image/png", b"back")],
    );

    let (data, mime) = reader::extract_cover_art_bytes(wav_path.to_str().unwrap()).unwrap();
    assert_eq!(data, b"back");
    assert_eq!(mime, "image/png");
}

#[test]
fn test_save_cover_art_picks_extension_from_mime() {
    let dir = tempfile::tempdir().expect("failed to create temp dir");
    for (id, mime, ext) in [
        (1, "image/png", "png"),
        (2, "image/gif", "gif"),
        (3, "image/bmp", "bmp"),
        (4, "image/webp", "webp"),
        (5, "image/jpeg", "jpg"),
        (6, "application/octet-stream", "jpg"),
    ] {
        let saved = reader::save_cover_art(dir.path(), id, b"img", mime).unwrap();
        assert_eq!(
            std::path::Path::new(&saved),
            dir.path().join("covers").join(format!("{id}.{ext}")),
            "{mime}"
        );
        assert_eq!(std::fs::read(&saved).unwrap(), b"img");
    }
}

#[test]
fn test_read_cover_art_from_file_builds_data_uri() {
    let dir = tempfile::tempdir().expect("failed to create temp dir");
    for (ext, mime) in [
        ("png", "image/png"),
        ("gif", "image/gif"),
        ("bmp", "image/bmp"),
        ("webp", "image/webp"),
        ("jpg", "image/jpeg"),
    ] {
        let path = dir.path().join(format!("cover.{ext}"));
        std::fs::write(&path, b"img").unwrap();
        assert_eq!(
            reader::read_cover_art_from_file(path.to_str().unwrap()),
            Some(format!("data:{mime};base64,aW1n")), // base64("img")
            "{ext}"
        );
    }
}

#[test]
fn test_read_cover_art_from_missing_file_is_none() {
    assert!(reader::read_cover_art_from_file("/nonexistent/covers/1.jpg").is_none());
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
