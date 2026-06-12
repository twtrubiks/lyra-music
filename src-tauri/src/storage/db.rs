use rusqlite::Connection;
use std::fs;
use tauri::{AppHandle, Manager};

use crate::error::AppError;

pub fn init_db(app_handle: &AppHandle) -> Result<Connection, AppError> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Generic(format!("failed to get app data dir: {e}")))?;

    fs::create_dir_all(&app_data_dir)?;

    let db_path = app_data_dir.join("lyra_music.db");
    let conn = Connection::open(db_path)?;

    conn.execute_batch("PRAGMA journal_mode=WAL;")?;
    conn.execute_batch("PRAGMA foreign_keys=ON;")?;
    // Single-connection today, but if a second connection is ever added
    // (e.g. moving scans off the shared one), SQLITE_BUSY must wait, not fail.
    conn.busy_timeout(std::time::Duration::from_secs(5))?;

    run_migrations(&conn)?;

    Ok(conn)
}

/// Run schema migrations. Each version step runs inside a transaction so a
/// crash mid-step cannot commit DDL without bumping `schema_version` — that
/// would make the next startup re-run the `ALTER TABLE` and fail with
/// "duplicate column", bricking the app.
#[allow(clippy::too_many_lines)]
pub fn run_migrations(conn: &Connection) -> Result<(), AppError> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_version (
            version INTEGER NOT NULL
        );",
    )?;

    let current_version: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_version",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    if current_version < 1 {
        let tx = conn.unchecked_transaction()?;
        tx.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS tracks (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                file_path   TEXT NOT NULL UNIQUE,
                title       TEXT NOT NULL,
                artist      TEXT NOT NULL DEFAULT 'Unknown Artist',
                album       TEXT NOT NULL DEFAULT 'Unknown Album',
                duration_secs REAL NOT NULL DEFAULT 0.0,
                cover_art   TEXT
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

            INSERT INTO schema_version (version) VALUES (1);
        ",
        )?;
        tx.commit()?;
    }

    if current_version < 2 {
        let tx = conn.unchecked_transaction()?;
        tx.execute_batch(
            "
            ALTER TABLE tracks ADD COLUMN cover_art_path TEXT;
            INSERT INTO schema_version (version) VALUES (2);
        ",
        )?;
        tx.commit()?;
    }

    if current_version < 3 {
        let tx = conn.unchecked_transaction()?;
        tx.execute_batch(
            "
            ALTER TABLE tracks ADD COLUMN file_size_bytes INTEGER NOT NULL DEFAULT 0;
            INSERT INTO schema_version (version) VALUES (3);
        ",
        )?;
        backfill_file_sizes(&tx)?;
        tx.commit()?;
    }

    if current_version < 4 {
        let tx = conn.unchecked_transaction()?;
        tx.execute_batch(
            "
            CREATE INDEX IF NOT EXISTS idx_tracks_title ON tracks(title);
            CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist);
            CREATE INDEX IF NOT EXISTS idx_tracks_album ON tracks(album);
            INSERT INTO schema_version (version) VALUES (4);
        ",
        )?;
        tx.commit()?;
    }

    if current_version < 5 {
        let tx = conn.unchecked_transaction()?;
        tx.execute_batch(
            "
            ALTER TABLE tracks ADD COLUMN play_count INTEGER NOT NULL DEFAULT 0;
            ALTER TABLE tracks ADD COLUMN last_played_at TEXT;
            CREATE INDEX IF NOT EXISTS idx_tracks_play_count ON tracks(play_count DESC);
            INSERT INTO schema_version (version) VALUES (5);
        ",
        )?;
        tx.commit()?;
    }

    if current_version < 6 {
        let tx = conn.unchecked_transaction()?;
        tx.execute_batch(
            "
            CREATE INDEX IF NOT EXISTS idx_tracks_album_artist ON tracks(album, artist);
            INSERT INTO schema_version (version) VALUES (6);
        ",
        )?;
        tx.commit()?;
    }

    if current_version < 7 {
        let tx = conn.unchecked_transaction()?;
        tx.execute_batch(
            "
            ALTER TABLE playlists ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
            INSERT INTO schema_version (version) VALUES (7);
        ",
        )?;
        backfill_playlist_sort_order(&tx)?;
        tx.commit()?;
    }

    if current_version < 8 {
        let tx = conn.unchecked_transaction()?;
        tx.execute_batch(
            "
            ALTER TABLE tracks ADD COLUMN album_artist TEXT;
            INSERT INTO schema_version (version) VALUES (8);
        ",
        )?;
        tx.commit()?;
    }

    Ok(())
}

fn backfill_playlist_sort_order(conn: &Connection) -> Result<(), AppError> {
    conn.execute_batch(
        "UPDATE playlists SET sort_order = (
            SELECT COUNT(*) FROM playlists p2 WHERE p2.id < playlists.id
        );",
    )?;
    Ok(())
}

/// Runs inside the caller's migration transaction — must not open its own.
fn backfill_file_sizes(conn: &Connection) -> Result<(), AppError> {
    let mut stmt = conn.prepare("SELECT id, file_path FROM tracks WHERE file_size_bytes = 0")?;
    let rows: Vec<(i64, String)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
        .collect::<Result<Vec<_>, _>>()?;

    for (id, file_path) in rows {
        if let Ok(meta) = fs::metadata(&file_path) {
            #[allow(clippy::cast_possible_wrap)]
            let size = meta.len() as i64;
            conn.execute(
                "UPDATE tracks SET file_size_bytes = ?1 WHERE id = ?2",
                rusqlite::params![size, id],
            )?;
        }
    }

    Ok(())
}
