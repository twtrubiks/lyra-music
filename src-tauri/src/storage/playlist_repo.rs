use rusqlite::{Connection, params};

use super::library_repo::row_to_track;
use crate::error::AppError;
use crate::models::playlist::Playlist;
use crate::models::track::Track;

pub fn create_playlist(conn: &Connection, name: &str) -> Result<i64, AppError> {
    let max_order: i64 = conn.query_row(
        "SELECT COALESCE(MAX(sort_order), -1) FROM playlists",
        [],
        |row| row.get(0),
    )?;

    conn.execute(
        "INSERT INTO playlists (name, sort_order) VALUES (?1, ?2)",
        params![name, max_order + 1],
    )?;

    Ok(conn.last_insert_rowid())
}

pub fn get_all_playlists(conn: &Connection) -> Result<Vec<Playlist>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, name, last_track_id, last_position_secs, sort_order FROM playlists ORDER BY sort_order",
    )?;

    let playlists = stmt
        .query_map([], |row| {
            let playlist_id: i64 = row.get(0)?;
            Ok((
                playlist_id,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
            ))
        })?
        .collect::<Result<Vec<(i64, String, Option<i64>, Option<f64>, i64)>, _>>()?;

    // Batch-load all playlist track IDs in a single query to avoid N+1
    let mut all_tracks_stmt = conn.prepare(
        "SELECT playlist_id, track_id FROM playlist_tracks ORDER BY playlist_id, sort_order",
    )?;
    let mut track_ids_map: std::collections::HashMap<i64, Vec<i64>> =
        std::collections::HashMap::new();
    let rows =
        all_tracks_stmt.query_map([], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?)))?;
    for row in rows {
        let (playlist_id, track_id) = row?;
        track_ids_map.entry(playlist_id).or_default().push(track_id);
    }

    let result = playlists
        .into_iter()
        .map(|(id, name, last_track_id, last_pos, sort_order)| Playlist {
            id,
            name,
            track_ids: track_ids_map.remove(&id).unwrap_or_default(),
            last_position_track_id: last_track_id,
            last_position_secs: last_pos,
            sort_order,
        })
        .collect();

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
        "SELECT t.id, t.file_path, t.title, t.artist, t.album, t.duration_secs, t.cover_art_path, t.file_size_bytes, t.play_count, t.last_played_at, t.album_artist
             FROM tracks t
             INNER JOIN playlist_tracks pt ON t.id = pt.track_id
             WHERE pt.playlist_id = ?1
             ORDER BY pt.sort_order",
    )?;

    let tracks = stmt
        .query_map(params![playlist_id], row_to_track)?
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

pub fn batch_add_to_playlist(
    conn: &Connection,
    playlist_id: i64,
    track_ids: &[i64],
) -> Result<(), AppError> {
    if track_ids.is_empty() {
        return Ok(());
    }

    let max_order: i64 = conn.query_row(
        "SELECT COALESCE(MAX(sort_order), -1) FROM playlist_tracks WHERE playlist_id = ?1",
        params![playlist_id],
        |row| row.get(0),
    )?;

    let tx = conn.unchecked_transaction()?;

    for (i, track_id) in track_ids.iter().enumerate() {
        #[allow(clippy::cast_possible_wrap)]
        let sort_order = max_order + 1 + (i as i64);
        tx.execute(
            "INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, sort_order)
             VALUES (?1, ?2, ?3)",
            params![playlist_id, track_id, sort_order],
        )?;
    }

    tx.commit()?;

    Ok(())
}

pub fn batch_remove_from_playlist(
    conn: &Connection,
    playlist_id: i64,
    track_ids: &[i64],
) -> Result<(), AppError> {
    const CHUNK_SIZE: usize = 500;

    if track_ids.is_empty() {
        return Ok(());
    }

    let tx = conn.unchecked_transaction()?;

    for chunk in track_ids.chunks(CHUNK_SIZE) {
        let placeholders: Vec<String> = chunk
            .iter()
            .enumerate()
            .map(|(i, _)| format!("?{}", i + 2))
            .collect();
        let sql = format!(
            "DELETE FROM playlist_tracks WHERE playlist_id = ?1 AND track_id IN ({})",
            placeholders.join(", ")
        );

        let mut stmt = tx.prepare(&sql)?;

        let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> =
            Vec::with_capacity(chunk.len() + 1);
        param_values.push(Box::new(playlist_id));
        for id in chunk {
            param_values.push(Box::new(*id));
        }

        let params_ref: Vec<&dyn rusqlite::types::ToSql> =
            param_values.iter().map(AsRef::as_ref).collect();
        stmt.execute(params_ref.as_slice())?;
    }

    tx.commit()?;

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

pub fn rename_playlist(conn: &Connection, id: i64, new_name: &str) -> Result<(), AppError> {
    conn.execute(
        "UPDATE playlists SET name = ?1 WHERE id = ?2",
        params![new_name, id],
    )?;
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

pub fn reorder_playlists(conn: &Connection, playlist_ids: &[i64]) -> Result<(), AppError> {
    let tx = conn.unchecked_transaction()?;
    for (i, playlist_id) in playlist_ids.iter().enumerate() {
        #[allow(clippy::cast_possible_wrap)]
        let sort_order = i as i64;
        tx.execute(
            "UPDATE playlists SET sort_order = ?1 WHERE id = ?2",
            params![sort_order, playlist_id],
        )?;
    }
    tx.commit()?;
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
