use rusqlite::{Connection, params};

use crate::error::AppError;
use crate::models::browse::{AlbumSummary, ArtistSummary};
use crate::models::track::Track;

/// 標準 Track 查詢欄位
const TRACK_COLUMNS: &str = "id, file_path, title, artist, album, duration_secs, cover_art_path, file_size_bytes, play_count, last_played_at";

/// 從 SQL Row 映射為 Track（欄位順序需對應 `TRACK_COLUMNS`）
pub fn row_to_track(row: &rusqlite::Row) -> rusqlite::Result<Track> {
    Ok(Track {
        id: row.get(0)?,
        file_path: row.get(1)?,
        title: row.get(2)?,
        artist: row.get(3)?,
        album: row.get(4)?,
        duration_secs: row.get(5)?,
        cover_art: None,
        cover_art_path: row.get(6)?,
        file_size_bytes: row.get(7)?,
        play_count: row.get(8)?,
        last_played_at: row.get(9)?,
    })
}

pub fn insert_track(conn: &Connection, track: &Track) -> Result<i64, AppError> {
    conn.execute(
        "INSERT INTO tracks (file_path, title, artist, album, duration_secs, cover_art_path, file_size_bytes)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(file_path) DO UPDATE SET
             title = excluded.title,
             artist = excluded.artist,
             album = excluded.album,
             duration_secs = excluded.duration_secs,
             file_size_bytes = excluded.file_size_bytes",
        params![
            track.file_path,
            track.title,
            track.artist,
            track.album,
            track.duration_secs,
            track.cover_art_path,
            track.file_size_bytes,
        ],
    )?;

    let id = conn.query_row(
        "SELECT id FROM tracks WHERE file_path = ?1",
        params![track.file_path],
        |row| row.get(0),
    )?;

    Ok(id)
}

pub fn update_cover_art_path(
    conn: &Connection,
    track_id: i64,
    cover_art_path: &str,
) -> Result<(), AppError> {
    conn.execute(
        "UPDATE tracks SET cover_art_path = ?1 WHERE id = ?2",
        params![cover_art_path, track_id],
    )?;
    Ok(())
}

pub fn get_all_tracks(conn: &Connection) -> Result<Vec<Track>, AppError> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {TRACK_COLUMNS} FROM tracks ORDER BY title"
    ))?;

    let tracks = stmt
        .query_map([], row_to_track)?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(tracks)
}

pub fn get_track_by_id(conn: &Connection, id: i64) -> Result<Option<Track>, AppError> {
    let mut stmt = conn.prepare(&format!("SELECT {TRACK_COLUMNS} FROM tracks WHERE id = ?1"))?;

    let mut rows = stmt.query_map(params![id], row_to_track)?;

    match rows.next() {
        Some(Ok(track)) => Ok(Some(track)),
        Some(Err(e)) => Err(e.into()),
        None => Ok(None),
    }
}

pub fn get_track_cover_path(conn: &Connection, id: i64) -> Result<Option<String>, AppError> {
    let result = conn.query_row(
        "SELECT cover_art_path FROM tracks WHERE id = ?1",
        params![id],
        |row| row.get::<_, Option<String>>(0),
    );

    match result {
        Ok(cover) => Ok(cover),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

pub fn delete_track(conn: &Connection, id: i64) -> Result<(), AppError> {
    conn.execute("DELETE FROM tracks WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn delete_tracks(conn: &Connection, ids: &[i64]) -> Result<(), AppError> {
    const CHUNK_SIZE: usize = 500;
    if ids.is_empty() {
        return Ok(());
    }
    let tx = conn.unchecked_transaction()?;
    for chunk in ids.chunks(CHUNK_SIZE) {
        let placeholders: Vec<String> = (1..=chunk.len()).map(|i| format!("?{i}")).collect();
        let sql = format!(
            "DELETE FROM tracks WHERE id IN ({})",
            placeholders.join(", ")
        );
        let params: Vec<&dyn rusqlite::ToSql> =
            chunk.iter().map(|id| id as &dyn rusqlite::ToSql).collect();
        tx.execute(&sql, params.as_slice())?;
    }
    tx.commit()?;
    Ok(())
}

pub fn get_tracks_by_ids(conn: &Connection, ids: &[i64]) -> Result<Vec<Track>, AppError> {
    const CHUNK_SIZE: usize = 500;
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    let mut all_tracks: Vec<Track> = Vec::with_capacity(ids.len());
    for chunk in ids.chunks(CHUNK_SIZE) {
        let placeholders: Vec<String> = (1..=chunk.len()).map(|i| format!("?{i}")).collect();
        let sql = format!(
            "SELECT {TRACK_COLUMNS} FROM tracks WHERE id IN ({})",
            placeholders.join(", ")
        );
        let params: Vec<&dyn rusqlite::ToSql> =
            chunk.iter().map(|id| id as &dyn rusqlite::ToSql).collect();
        let mut stmt = conn.prepare(&sql)?;
        let chunk_tracks = stmt
            .query_map(params.as_slice(), row_to_track)?
            .collect::<Result<Vec<_>, _>>()?;
        all_tracks.extend(chunk_tracks);
    }
    Ok(all_tracks)
}

pub fn search_tracks(conn: &Connection, query: &str) -> Result<Vec<Track>, AppError> {
    let pattern = format!("%{query}%");

    let mut stmt = conn.prepare(&format!(
        "SELECT {TRACK_COLUMNS} FROM tracks
         WHERE title LIKE ?1 OR artist LIKE ?1 OR album LIKE ?1
         ORDER BY title"
    ))?;

    let tracks = stmt
        .query_map(params![pattern], row_to_track)?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(tracks)
}

pub fn update_track_metadata(
    conn: &Connection,
    id: i64,
    title: &str,
    artist: &str,
    album: &str,
) -> Result<(), AppError> {
    conn.execute(
        "UPDATE tracks SET title = ?1, artist = ?2, album = ?3 WHERE id = ?4",
        params![title, artist, album, id],
    )?;
    Ok(())
}

pub fn get_all_artists(conn: &Connection) -> Result<Vec<ArtistSummary>, AppError> {
    let mut stmt =
        conn.prepare("SELECT artist, COUNT(*) FROM tracks GROUP BY artist ORDER BY artist")?;

    let artists = stmt
        .query_map([], |row| {
            Ok(ArtistSummary {
                name: row.get(0)?,
                track_count: row.get(1)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(artists)
}

pub fn get_all_albums(conn: &Connection) -> Result<Vec<AlbumSummary>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT album, artist, COUNT(*), cover_art_path
         FROM tracks
         GROUP BY album, artist
         ORDER BY album, artist",
    )?;

    let albums = stmt
        .query_map([], |row| {
            Ok(AlbumSummary {
                name: row.get(0)?,
                artist: row.get(1)?,
                track_count: row.get(2)?,
                cover_art_path: row.get(3)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(albums)
}

pub fn get_tracks_by_artist(conn: &Connection, artist: &str) -> Result<Vec<Track>, AppError> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {TRACK_COLUMNS} FROM tracks WHERE artist = ?1 ORDER BY album, title"
    ))?;

    let tracks = stmt
        .query_map(params![artist], row_to_track)?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(tracks)
}

pub fn get_tracks_by_album(
    conn: &Connection,
    album: &str,
    artist: &str,
) -> Result<Vec<Track>, AppError> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {TRACK_COLUMNS} FROM tracks WHERE album = ?1 AND artist = ?2 ORDER BY title"
    ))?;

    let tracks = stmt
        .query_map(params![album, artist], row_to_track)?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(tracks)
}

pub fn increment_play_count(conn: &Connection, track_id: i64) -> Result<(), AppError> {
    conn.execute(
        "UPDATE tracks SET play_count = play_count + 1, last_played_at = datetime('now') WHERE id = ?1",
        params![track_id],
    )?;
    Ok(())
}

pub fn get_most_played_tracks(conn: &Connection, limit: i64) -> Result<Vec<Track>, AppError> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {TRACK_COLUMNS} FROM tracks
         WHERE play_count > 0
         ORDER BY play_count DESC, last_played_at DESC
         LIMIT ?1"
    ))?;

    let tracks = stmt
        .query_map(params![limit], row_to_track)?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(tracks)
}

pub fn get_all_scan_folders(conn: &Connection) -> Result<Vec<String>, AppError> {
    let mut stmt = conn.prepare("SELECT folder_path FROM scan_folders")?;

    let folders = stmt
        .query_map([], |row| row.get(0))?
        .collect::<Result<Vec<String>, _>>()?;

    Ok(folders)
}

pub fn add_scan_folder(conn: &Connection, folder_path: &str) -> Result<(), AppError> {
    conn.execute(
        "INSERT OR IGNORE INTO scan_folders (folder_path) VALUES (?1)",
        params![folder_path],
    )?;
    Ok(())
}

pub fn remove_scan_folder(conn: &Connection, folder_path: &str) -> Result<(), AppError> {
    conn.execute(
        "DELETE FROM scan_folders WHERE folder_path = ?1",
        params![folder_path],
    )?;
    Ok(())
}

pub fn get_track_id_by_path(conn: &Connection, file_path: &str) -> Result<Option<i64>, AppError> {
    let result = conn.query_row(
        "SELECT id FROM tracks WHERE file_path = ?1",
        params![file_path],
        |row| row.get(0),
    );
    match result {
        Ok(id) => Ok(Some(id)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

pub fn delete_track_by_path(
    conn: &Connection,
    file_path: &str,
) -> Result<Option<String>, AppError> {
    let cover_art_path: Option<String> = conn
        .query_row(
            "SELECT cover_art_path FROM tracks WHERE file_path = ?1",
            params![file_path],
            |row| row.get(0),
        )
        .unwrap_or(None);

    conn.execute(
        "DELETE FROM tracks WHERE file_path = ?1",
        params![file_path],
    )?;

    Ok(cover_art_path)
}
