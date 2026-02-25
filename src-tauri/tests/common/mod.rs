#![allow(dead_code)]

use rusqlite::Connection;

use lyra_music_lib::models::track::Track;

/// Create an in-memory SQLite database with the full schema.
pub fn create_test_db() -> Connection {
    let conn = Connection::open_in_memory().expect("failed to open in-memory db");
    conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS tracks (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            file_path   TEXT NOT NULL UNIQUE,
            title       TEXT NOT NULL,
            artist      TEXT NOT NULL DEFAULT 'Unknown Artist',
            album       TEXT NOT NULL DEFAULT 'Unknown Album',
            duration_secs REAL NOT NULL DEFAULT 0.0,
            cover_art   TEXT,
            cover_art_path TEXT,
            file_size_bytes INTEGER NOT NULL DEFAULT 0,
            play_count INTEGER NOT NULL DEFAULT 0,
            last_played_at TEXT
        );

        CREATE TABLE IF NOT EXISTS playlists (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT NOT NULL,
            last_track_id   INTEGER,
            last_position_secs REAL DEFAULT 0.0
        );

        CREATE TABLE IF NOT EXISTS playlist_tracks (
            playlist_id INTEGER NOT NULL,
            track_id    INTEGER NOT NULL,
            sort_order  INTEGER NOT NULL,
            PRIMARY KEY (playlist_id, track_id),
            FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
            FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS scan_folders (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            folder_path TEXT NOT NULL UNIQUE
        );

        CREATE INDEX IF NOT EXISTS idx_tracks_album_artist ON tracks(album, artist);
        ",
    )
    .expect("failed to create schema");
    conn
}

/// Create a test Track with sensible defaults. The `idx` parameter makes each track unique.
pub fn create_test_track(idx: u32) -> Track {
    Track {
        id: 0,
        file_path: format!("/tmp/test_music/track_{}.mp3", idx),
        title: format!("Test Track {}", idx),
        artist: format!("Artist {}", idx),
        album: format!("Album {}", idx),
        duration_secs: 180.0 + idx as f64,
        cover_art: None,
        cover_art_path: None,
        file_size_bytes: 1024 * (idx as i64 + 1),
        play_count: 0,
        last_played_at: None,
    }
}

/// Create a minimal valid WAV file (PCM 16-bit mono, 44100 Hz) in the given directory.
/// Returns the full path to the created file.
pub fn create_test_wav(dir: &std::path::Path, name: &str) -> std::path::PathBuf {
    let path = dir.join(name);
    let sample_rate: u32 = 44100;
    let bits_per_sample: u16 = 16;
    let num_channels: u16 = 1;
    let num_samples: u32 = 4410; // 0.1 seconds
    let byte_rate = sample_rate * (bits_per_sample as u32 / 8) * num_channels as u32;
    let block_align = num_channels * (bits_per_sample / 8);
    let data_size = num_samples * (bits_per_sample as u32 / 8) * num_channels as u32;
    let file_size = 36 + data_size;

    let mut buf: Vec<u8> = Vec::new();

    // RIFF header
    buf.extend_from_slice(b"RIFF");
    buf.extend_from_slice(&file_size.to_le_bytes());
    buf.extend_from_slice(b"WAVE");

    // fmt sub-chunk
    buf.extend_from_slice(b"fmt ");
    buf.extend_from_slice(&16u32.to_le_bytes()); // sub-chunk size
    buf.extend_from_slice(&1u16.to_le_bytes()); // audio format (PCM)
    buf.extend_from_slice(&num_channels.to_le_bytes());
    buf.extend_from_slice(&sample_rate.to_le_bytes());
    buf.extend_from_slice(&byte_rate.to_le_bytes());
    buf.extend_from_slice(&block_align.to_le_bytes());
    buf.extend_from_slice(&bits_per_sample.to_le_bytes());

    // data sub-chunk
    buf.extend_from_slice(b"data");
    buf.extend_from_slice(&data_size.to_le_bytes());

    // Generate a simple sine wave (440 Hz)
    for i in 0..num_samples {
        let t = i as f64 / sample_rate as f64;
        let sample = (t * 440.0 * 2.0 * std::f64::consts::PI).sin();
        let value = (sample * 16000.0) as i16;
        buf.extend_from_slice(&value.to_le_bytes());
    }

    std::fs::write(&path, &buf).expect("failed to write test wav");
    path
}
