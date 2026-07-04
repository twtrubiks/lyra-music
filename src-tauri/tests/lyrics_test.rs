mod common;

use lyra_music_lib::metadata::reader;

#[test]
fn test_sidecar_lrc_is_returned() {
    let dir = tempfile::tempdir().expect("failed to create temp dir");
    let wav_path = common::create_test_wav(dir.path(), "song.wav");
    std::fs::write(dir.path().join("song.lrc"), "[00:01.00]Hello").unwrap();

    let lyrics = reader::read_lyrics(wav_path.to_str().unwrap());
    assert_eq!(lyrics.as_deref(), Some("[00:01.00]Hello"));
}

#[test]
fn test_sidecar_takes_priority_over_embedded() {
    let dir = tempfile::tempdir().expect("failed to create temp dir");
    let wav_path = common::create_test_wav_with_uslt(dir.path(), "song.wav", "embedded lyrics");
    std::fs::write(dir.path().join("song.lrc"), "[00:01.00]From sidecar").unwrap();

    let lyrics = reader::read_lyrics(wav_path.to_str().unwrap());
    assert_eq!(lyrics.as_deref(), Some("[00:01.00]From sidecar"));
}

#[test]
fn test_embedded_uslt_lyrics_fallback() {
    let dir = tempfile::tempdir().expect("failed to create temp dir");
    let wav_path = common::create_test_wav_with_uslt(dir.path(), "song.wav", "[00:01.00]內嵌歌詞");

    let lyrics = reader::read_lyrics(wav_path.to_str().unwrap());
    assert_eq!(lyrics.as_deref(), Some("[00:01.00]內嵌歌詞"));
}

#[test]
fn test_no_lyrics_returns_none() {
    let dir = tempfile::tempdir().expect("failed to create temp dir");
    let wav_path = common::create_test_wav(dir.path(), "song.wav");

    assert_eq!(reader::read_lyrics(wav_path.to_str().unwrap()), None);
}

#[test]
fn test_non_utf8_sidecar_falls_back_to_embedded() {
    let dir = tempfile::tempdir().expect("failed to create temp dir");
    let wav_path = common::create_test_wav_with_uslt(dir.path(), "song.wav", "embedded");
    // GBK-style bytes: invalid UTF-8 must not surface as mojibake.
    std::fs::write(dir.path().join("song.lrc"), [0xD6u8, 0xD0, 0xCE, 0xC4]).unwrap();

    let lyrics = reader::read_lyrics(wav_path.to_str().unwrap());
    assert_eq!(lyrics.as_deref(), Some("embedded"));
}

#[test]
fn test_empty_sidecar_is_ignored() {
    let dir = tempfile::tempdir().expect("failed to create temp dir");
    let wav_path = common::create_test_wav(dir.path(), "song.wav");
    std::fs::write(dir.path().join("song.lrc"), "  \n").unwrap();

    assert_eq!(reader::read_lyrics(wav_path.to_str().unwrap()), None);
}

#[test]
fn test_sidecar_works_without_readable_audio_file() {
    // Sidecar lookup is purely path-based: a broken/missing audio file must
    // not block sidecar lyrics.
    let dir = tempfile::tempdir().expect("failed to create temp dir");
    let fake_audio = dir.path().join("gone.mp3");
    std::fs::write(dir.path().join("gone.lrc"), "[00:01.00]Still here").unwrap();

    let lyrics = reader::read_lyrics(fake_audio.to_str().unwrap());
    assert_eq!(lyrics.as_deref(), Some("[00:01.00]Still here"));
}
