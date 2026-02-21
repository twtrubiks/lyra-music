use rusqlite::{params, Connection};

use crate::error::AppError;
use crate::models::playlist::Playlist;
use crate::models::track::Track;

pub fn create_playlist(conn: &Connection, name: &str) -> Result<i64, AppError> {
    conn.execute("INSERT INTO playlists (name) VALUES (?1)", params![name])?;

    Ok(conn.last_insert_rowid())
}

pub fn get_all_playlists(conn: &Connection) -> Result<Vec<Playlist>, AppError> {
    let mut stmt = conn
        .prepare("SELECT id, name, last_track_id, last_position_secs FROM playlists ORDER BY id")?;

    let playlists = stmt
        .query_map([], |row| {
            let playlist_id: i64 = row.get(0)?;
            Ok((playlist_id, row.get(1)?, row.get(2)?, row.get(3)?))
        })?
        .collect::<Result<Vec<(i64, String, Option<i64>, Option<f64>)>, _>>()?;

    let mut result = Vec::new();
    for (id, name, last_track_id, last_pos) in playlists {
        let track_ids = get_playlist_track_ids(conn, id)?;
        result.push(Playlist {
            id,
            name,
            track_ids,
            last_position_track_id: last_track_id,
            last_position_secs: last_pos,
        });
    }

    Ok(result)
}

fn get_playlist_track_ids(conn: &Connection, playlist_id: i64) -> Result<Vec<i64>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT track_id FROM playlist_tracks
             WHERE playlist_id = ?1 ORDER BY sort_order",
    )?;

    let ids = stmt
        .query_map(params![playlist_id], |row| row.get(0))?
        .collect::<Result<Vec<i64>, _>>()?;

    Ok(ids)
}

pub fn get_playlist_tracks(conn: &Connection, playlist_id: i64) -> Result<Vec<Track>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT t.id, t.file_path, t.title, t.artist, t.album, t.duration_secs, t.file_size_bytes, t.play_count, t.last_played_at
             FROM tracks t
             INNER JOIN playlist_tracks pt ON t.id = pt.track_id
             WHERE pt.playlist_id = ?1
             ORDER BY pt.sort_order",
    )?;

    let tracks = stmt
        .query_map(params![playlist_id], |row| {
            Ok(Track {
                id: row.get(0)?,
                file_path: row.get(1)?,
                title: row.get(2)?,
                artist: row.get(3)?,
                album: row.get(4)?,
                duration_secs: row.get(5)?,
                cover_art: None,
                cover_art_path: None,
                file_size_bytes: row.get(6)?,
                play_count: row.get(7)?,
                last_played_at: row.get(8)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(tracks)
}

pub fn add_to_playlist(conn: &Connection, playlist_id: i64, track_id: i64) -> Result<(), AppError> {
    let max_order: i64 = conn.query_row(
        "SELECT COALESCE(MAX(sort_order), -1) FROM playlist_tracks WHERE playlist_id = ?1",
        params![playlist_id],
        |row| row.get(0),
    )?;

    conn.execute(
        "INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, sort_order)
         VALUES (?1, ?2, ?3)",
        params![playlist_id, track_id, max_order + 1],
    )?;

    Ok(())
}

pub fn remove_from_playlist(
    conn: &Connection,
    playlist_id: i64,
    track_id: i64,
) -> Result<(), AppError> {
    conn.execute(
        "DELETE FROM playlist_tracks WHERE playlist_id = ?1 AND track_id = ?2",
        params![playlist_id, track_id],
    )?;

    Ok(())
}

pub fn reorder_playlist(
    conn: &Connection,
    playlist_id: i64,
    track_ids: &[i64],
) -> Result<(), AppError> {
    let existing_ids = get_playlist_track_ids(conn, playlist_id)?;
    let mut existing_set: std::collections::HashSet<i64> = existing_ids.into_iter().collect();

    for tid in track_ids {
        if !existing_set.remove(tid) {
            return Err(AppError::Generic(format!(
                "Track {tid} does not belong to playlist {playlist_id}"
            )));
        }
    }

    let tx = conn.unchecked_transaction()?;

    tx.execute(
        "DELETE FROM playlist_tracks WHERE playlist_id = ?1",
        params![playlist_id],
    )?;

    for (i, track_id) in track_ids.iter().enumerate() {
        #[allow(clippy::cast_possible_wrap)]
        let sort_order = i as i64;
        tx.execute(
            "INSERT INTO playlist_tracks (playlist_id, track_id, sort_order)
             VALUES (?1, ?2, ?3)",
            params![playlist_id, track_id, sort_order],
        )?;
    }

    tx.commit()?;

    Ok(())
}

pub fn delete_playlist(conn: &Connection, id: i64) -> Result<(), AppError> {
    conn.execute("DELETE FROM playlists WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn save_playback_position(
    conn: &Connection,
    playlist_id: i64,
    track_id: i64,
    secs: f64,
) -> Result<(), AppError> {
    conn.execute(
        "UPDATE playlists SET last_track_id = ?1, last_position_secs = ?2 WHERE id = ?3",
        params![track_id, secs, playlist_id],
    )?;

    Ok(())
}

pub fn get_last_playback_position(
    conn: &Connection,
    playlist_id: i64,
) -> Result<(Option<i64>, Option<f64>), AppError> {
    let result = conn.query_row(
        "SELECT last_track_id, last_position_secs FROM playlists WHERE id = ?1",
        params![playlist_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    );

    match result {
        Ok(pos) => Ok(pos),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok((None, None)),
        Err(e) => Err(e.into()),
    }
}
