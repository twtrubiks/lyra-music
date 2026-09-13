use rusqlite::Connection;

use lyra_music_lib::storage::db;

fn schema_version(conn: &Connection) -> i64 {
    conn.query_row(
        "SELECT COALESCE(MAX(version), 0) FROM schema_version",
        [],
        |row| row.get(0),
    )
    .unwrap()
}

fn index_names(conn: &Connection, table: &str) -> Vec<String> {
    let mut stmt = conn
        .prepare(&format!("PRAGMA index_list({table})"))
        .unwrap();
    stmt.query_map([], |row| row.get::<_, String>(1))
        .unwrap()
        .collect::<Result<Vec<_>, _>>()
        .unwrap()
}

fn column_names(conn: &Connection, table: &str) -> Vec<String> {
    let mut stmt = conn
        .prepare(&format!("PRAGMA table_info({table})"))
        .unwrap();
    stmt.query_map([], |row| row.get::<_, String>(1))
        .unwrap()
        .collect::<Result<Vec<_>, _>>()
        .unwrap()
}

/// Recreate the historical v1 schema exactly as it shipped, so upgrade
/// tests exercise the real migration path from the oldest release.
fn create_v1_db() -> Connection {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch(
        "
        CREATE TABLE schema_version (version INTEGER NOT NULL);

        CREATE TABLE tracks (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            file_path   TEXT NOT NULL UNIQUE,
            title       TEXT NOT NULL,
            artist      TEXT NOT NULL DEFAULT 'Unknown Artist',
            album       TEXT NOT NULL DEFAULT 'Unknown Album',
            duration_secs REAL NOT NULL DEFAULT 0.0,
            cover_art   TEXT
        );

        CREATE TABLE playlists (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT NOT NULL,
            last_track_id   INTEGER,
            last_position_secs REAL DEFAULT 0.0
        );

        CREATE TABLE playlist_tracks (
            playlist_id INTEGER NOT NULL,
            track_id    INTEGER NOT NULL,
            sort_order  INTEGER NOT NULL,
            PRIMARY KEY (playlist_id, track_id),
            FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
            FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
        );

        CREATE TABLE scan_folders (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            folder_path TEXT NOT NULL UNIQUE
        );

        INSERT INTO schema_version (version) VALUES (1);
        ",
    )
    .unwrap();
    conn
}

#[test]
fn fresh_db_migrates_to_latest_version() {
    let conn = Connection::open_in_memory().unwrap();
    db::run_migrations(&conn).unwrap();

    assert_eq!(schema_version(&conn), 9);

    let track_cols = column_names(&conn, "tracks");
    for col in [
        "cover_art_path",
        "file_size_bytes",
        "play_count",
        "last_played_at",
        "album_artist",
    ] {
        assert!(track_cols.iter().any(|c| c == col), "missing column {col}");
    }
    let playlist_cols = column_names(&conn, "playlists");
    assert!(playlist_cols.iter().any(|c| c == "sort_order"));
}

/// v9: `playlist_tracks` is keyed `(playlist_id, track_id)`, so the
/// `track_id` FK cascade on track deletion and the `ORDER BY sort_order`
/// playlist reads had no usable index. `idx_tracks_album_artist` became
/// redundant with `idx_tracks_album` once v8 keyed album cards by
/// `COALESCE(album_artist, artist)` — only the `album` prefix is usable.
#[test]
fn v9_adds_playlist_tracks_indexes_and_drops_redundant_album_artist_index() {
    let conn = Connection::open_in_memory().unwrap();
    db::run_migrations(&conn).unwrap();

    let pt_indexes = index_names(&conn, "playlist_tracks");
    for idx in [
        "idx_playlist_tracks_track_id",
        "idx_playlist_tracks_playlist_sort",
    ] {
        assert!(pt_indexes.iter().any(|i| i == idx), "missing index {idx}");
    }
    let track_indexes = index_names(&conn, "tracks");
    assert!(
        !track_indexes.iter().any(|i| i == "idx_tracks_album_artist"),
        "redundant index idx_tracks_album_artist should be dropped"
    );
    assert!(track_indexes.iter().any(|i| i == "idx_tracks_album"));
}

#[test]
fn migrations_are_idempotent() {
    let conn = Connection::open_in_memory().unwrap();
    db::run_migrations(&conn).unwrap();
    db::run_migrations(&conn).unwrap();

    assert_eq!(schema_version(&conn), 9);
}

#[test]
fn v1_db_with_data_upgrades_and_backfills() {
    let conn = create_v1_db();
    conn.execute_batch(
        "
        INSERT INTO tracks (file_path, title) VALUES ('/music/a.mp3', 'A');
        INSERT INTO playlists (name) VALUES ('First');
        INSERT INTO playlists (name) VALUES ('Second');
        ",
    )
    .unwrap();

    db::run_migrations(&conn).unwrap();

    assert_eq!(schema_version(&conn), 9);

    // New columns get sane defaults on existing rows
    let (play_count, file_size): (i64, i64) = conn
        .query_row(
            "SELECT play_count, file_size_bytes FROM tracks WHERE file_path = '/music/a.mp3'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap();
    assert_eq!(play_count, 0);
    assert_eq!(file_size, 0);

    // v7 backfill assigns sort_order by insertion order
    let orders: Vec<(String, i64)> = {
        let mut stmt = conn
            .prepare("SELECT name, sort_order FROM playlists ORDER BY sort_order")
            .unwrap();
        stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap()
    };
    assert_eq!(
        orders,
        vec![("First".to_string(), 0), ("Second".to_string(), 1)]
    );

    // v9 indexes land on the upgrade path too, not only on a fresh DB
    let pt_indexes = index_names(&conn, "playlist_tracks");
    assert!(
        pt_indexes
            .iter()
            .any(|i| i == "idx_playlist_tracks_track_id")
    );
    assert!(
        pt_indexes
            .iter()
            .any(|i| i == "idx_playlist_tracks_playlist_sort")
    );
    assert!(
        !index_names(&conn, "tracks")
            .iter()
            .any(|i| i == "idx_tracks_album_artist")
    );
}
