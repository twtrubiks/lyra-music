use std::sync::{Arc, Mutex};

use rusqlite::Connection;
use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use crate::DbState;
use crate::WatcherState;
use crate::error::AppError;
use crate::metadata::{lyrics_online, reader, writer};
use crate::models::browse::{AlbumSummary, ArtistSummary};
use crate::models::track::{FailedFile, ImportResult, Track, TrackDetails};
use crate::models::watched_folder::WatchedFolder;
use crate::scanner::folder_scanner;
use crate::storage::library_repo;

#[derive(Serialize)]
pub struct BatchTrashResult {
    pub succeeded_ids: Vec<i64>,
    pub failed: Vec<BatchTrashFailure>,
}

#[derive(Serialize)]
pub struct BatchTrashFailure {
    pub id: i64,
    pub error: String,
}

/// Files per import chunk. Bounds both how long the DB lock is held per
/// chunk and how many extracted cover images sit in memory at once.
const IMPORT_CHUNK_SIZE: usize = 32;

struct PreparedFile {
    track: Track,
    cover: Option<(Vec<u8>, String)>,
}

/// Read metadata and cover art for one file. Pure file I/O — must be called
/// without the DB lock held.
fn read_audio_file(file_path: &str) -> Result<PreparedFile, FailedFile> {
    match reader::read_metadata(file_path) {
        Ok(track) => Ok(PreparedFile {
            cover: reader::extract_cover_art_bytes(file_path),
            track,
        }),
        Err(e) => {
            eprintln!("[lyra] Failed to read metadata for {file_path}: {e}");
            Err(FailedFile {
                file_path: file_path.to_string(),
                error: e.to_string(),
            })
        }
    }
}

/// Insert one prepared chunk: a short lock/transaction to insert the rows,
/// cover files written with the lock released (the file name needs the row
/// id, so they cannot be written beforehand), then a second short
/// lock/transaction to record the cover paths. A cover that fails to save
/// or record is logged and its track returned without one — the rows are
/// already committed, so failing the chunk would misreport the import.
fn insert_chunk(
    db: &Arc<Mutex<Connection>>,
    app_data_dir: &std::path::Path,
    prepared: &[PreparedFile],
) -> Result<Vec<Track>, AppError> {
    let mut inserted = {
        let conn = db.lock().map_err(|_| AppError::LockPoisoned)?;
        let tx = conn.unchecked_transaction()?;
        let mut inserted = Vec::with_capacity(prepared.len());
        for p in prepared {
            let mut track = p.track.clone();
            track.id = library_repo::insert_track(&tx, &track)?;
            track.cover_art = None;
            inserted.push(track);
        }
        tx.commit()?;
        inserted
    };

    // File I/O without the DB lock. `inserted` is index-aligned with `prepared`.
    let saved_covers: Vec<(usize, String)> = prepared
        .iter()
        .enumerate()
        .filter_map(|(i, p)| {
            let (data, mime) = p.cover.as_ref()?;
            let id = inserted[i].id;
            match reader::save_cover_art(app_data_dir, id, data, mime) {
                Ok(path) => Some((i, path)),
                Err(e) => {
                    eprintln!("[lyra] failed to save cover art for track {id}: {e}");
                    None
                }
            }
        })
        .collect();

    if !saved_covers.is_empty() {
        match record_cover_paths(db, &inserted, &saved_covers) {
            Ok(()) => {
                for (i, path) in saved_covers {
                    inserted[i].cover_art_path = Some(path);
                }
            }
            Err(e) => eprintln!(
                "[lyra] failed to record cover art paths for {} tracks: {e}",
                saved_covers.len()
            ),
        }
    }

    Ok(inserted)
}

fn record_cover_paths(
    db: &Arc<Mutex<Connection>>,
    inserted: &[Track],
    saved_covers: &[(usize, String)],
) -> Result<(), AppError> {
    let conn = db.lock().map_err(|_| AppError::LockPoisoned)?;
    let tx = conn.unchecked_transaction()?;
    for (i, path) in saved_covers {
        library_repo::update_cover_art_path(&tx, inserted[*i].id, path)?;
    }
    tx.commit()?;
    Ok(())
}

/// Import audio files into the library in chunks: the expensive file I/O
/// (metadata parsing, cover extraction) runs without the DB lock so the
/// watcher and other DB commands stay responsive during large scans; the
/// lock is taken only briefly per chunk to insert. Playback commands never
/// touch the DB lock, and every DB/file-I/O command is `(async)` so none of
/// this work occupies the main thread. Each chunk commits its own
/// transaction — `insert_track` upserts on `file_path`, so an aborted import
/// can simply be re-run. A chunk whose transaction fails is reported through
/// `failed_files` instead of aborting: earlier chunks are already committed,
/// and returning an error would tell the frontend the whole import failed
/// while the library has in fact grown.
pub fn import_audio_files(
    db: &Arc<Mutex<Connection>>,
    app_data_dir: &std::path::Path,
    file_paths: &[String],
) -> ImportResult {
    let mut tracks = Vec::new();
    let mut failed_files = Vec::new();

    for chunk in file_paths.chunks(IMPORT_CHUNK_SIZE) {
        let mut prepared = Vec::with_capacity(chunk.len());
        for path in chunk {
            match read_audio_file(path) {
                Ok(p) => prepared.push(p),
                Err(failed) => failed_files.push(failed),
            }
        }
        if prepared.is_empty() {
            continue;
        }

        match insert_chunk(db, app_data_dir, &prepared) {
            Ok(inserted) => tracks.extend(inserted),
            Err(e) => {
                eprintln!(
                    "[lyra] Import chunk failed, {} files skipped: {e}",
                    prepared.len()
                );
                failed_files.extend(prepared.into_iter().map(|p| FailedFile {
                    file_path: p.track.file_path,
                    error: format!("database error: {e}"),
                }));
            }
        }
    }

    ImportResult {
        tracks,
        failed_files,
    }
}

#[tauri::command(async)]
pub fn scan_folder(
    folder_path: String,
    db: State<DbState>,
    watcher_state: State<WatcherState>,
    app_handle: AppHandle,
) -> Result<ImportResult, AppError> {
    let file_paths = folder_scanner::scan_folder(&folder_path)?;

    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Generic(format!("failed to get app data dir: {e}")))?;

    {
        let conn = db.0.lock().map_err(|_| AppError::LockPoisoned)?;
        library_repo::add_scan_folder(&conn, &folder_path)?;
    }

    let result = import_audio_files(&db.0, &app_data_dir, &file_paths);

    if let Ok(w) = watcher_state.0.lock()
        && let Some(ref watcher) = *w
    {
        let _ = watcher.watch(&folder_path);
    }

    Ok(result)
}

#[tauri::command(async)]
pub fn import_paths(
    paths: Vec<String>,
    db: State<DbState>,
    app_handle: AppHandle,
) -> Result<ImportResult, AppError> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Generic(format!("failed to get app data dir: {e}")))?;

    let mut audio_files: Vec<String> = Vec::new();
    for p in &paths {
        let path = std::path::Path::new(p);
        if path.is_dir() {
            if let Ok(files) = folder_scanner::scan_folder(p) {
                audio_files.extend(files);
            }
        } else if folder_scanner::is_supported_audio_file(p) {
            audio_files.push(p.clone());
        }
    }

    Ok(import_audio_files(&db.0, &app_data_dir, &audio_files))
}

#[tauri::command(async)]
pub fn get_all_tracks(db: State<DbState>) -> Result<Vec<Track>, AppError> {
    let conn = db.0.lock().map_err(|_| AppError::LockPoisoned)?;
    library_repo::get_all_tracks(&conn)
}

#[tauri::command(async)]
pub fn get_track_cover(id: i64, db: State<DbState>) -> Result<Option<String>, AppError> {
    let cover_path = {
        let conn = db.0.lock().map_err(|_| AppError::LockPoisoned)?;
        library_repo::get_track_cover_path(&conn, id)?
    };
    // File read + base64 encoding run without the DB lock held.
    Ok(cover_path
        .as_deref()
        .and_then(reader::read_cover_art_from_file))
}

#[tauri::command(async)]
pub fn search_tracks(query: String, db: State<DbState>) -> Result<Vec<Track>, AppError> {
    let conn = db.0.lock().map_err(|_| AppError::LockPoisoned)?;
    library_repo::search_tracks(&conn, &query)
}

#[tauri::command(async)]
pub fn remove_track(id: i64, db: State<DbState>) -> Result<(), AppError> {
    single_result(remove_tracks_batch(&db.0, &[id])?)
}

#[tauri::command(async)]
pub fn trash_track(id: i64, db: State<DbState>) -> Result<(), AppError> {
    single_result(trash_tracks_batch(&db.0, &[id])?)
}

/// Collapse a one-id batch result into the single-track command contract.
fn single_result(result: BatchTrashResult) -> Result<(), AppError> {
    match result.failed.into_iter().next() {
        Some(failure) => Err(AppError::Generic(failure.error)),
        None => Ok(()),
    }
}

#[tauri::command(async)]
pub fn trash_tracks(ids: Vec<i64>, db: State<DbState>) -> Result<BatchTrashResult, AppError> {
    trash_tracks_batch(&db.0, &ids)
}

#[tauri::command(async)]
pub fn remove_tracks(ids: Vec<i64>, db: State<DbState>) -> Result<BatchTrashResult, AppError> {
    remove_tracks_batch(&db.0, &ids)
}

/// Move files to the OS trash and delete their rows. Short lock to fetch
/// the rows, trash + cover cleanup with the lock released — a
/// cross-filesystem trash is a copy + delete that can take seconds — then a
/// short lock to delete the rows that were actually trashed. Failures are
/// aggregated per id so the frontend rolls back only those tracks.
pub fn trash_tracks_batch(
    db: &Arc<Mutex<Connection>>,
    ids: &[i64],
) -> Result<BatchTrashResult, AppError> {
    let tracks = {
        let conn = db.lock().map_err(|_| AppError::LockPoisoned)?;
        library_repo::get_tracks_by_ids(&conn, ids)?
    };

    let mut succeeded_ids = Vec::new();
    let mut failed = Vec::new();

    for track in &tracks {
        match trash::delete(&track.file_path) {
            Ok(()) => {
                if let Some(ref cover_path) = track.cover_art_path {
                    reader::remove_cover_art_file(cover_path);
                }
                succeeded_ids.push(track.id);
            }
            Err(e) => {
                failed.push(BatchTrashFailure {
                    id: track.id,
                    error: format!("Failed to trash file: {e}"),
                });
            }
        }
    }

    let found_ids: std::collections::HashSet<i64> = tracks.iter().map(|t| t.id).collect();
    failed.extend(not_found_failures(ids, &found_ids));

    if !succeeded_ids.is_empty() {
        let conn = db.lock().map_err(|_| AppError::LockPoisoned)?;
        library_repo::delete_tracks(&conn, &succeeded_ids)?;
    }

    Ok(BatchTrashResult {
        succeeded_ids,
        failed,
    })
}

/// Delete rows and their cached covers, leaving the audio files alone.
/// Short lock to fetch + delete, cover file cleanup with the lock released.
pub fn remove_tracks_batch(
    db: &Arc<Mutex<Connection>>,
    ids: &[i64],
) -> Result<BatchTrashResult, AppError> {
    let tracks = {
        let conn = db.lock().map_err(|_| AppError::LockPoisoned)?;
        let tracks = library_repo::get_tracks_by_ids(&conn, ids)?;
        let found: Vec<i64> = tracks.iter().map(|t| t.id).collect();
        library_repo::delete_tracks(&conn, &found)?;
        tracks
    };

    let found_ids: std::collections::HashSet<i64> = tracks.iter().map(|t| t.id).collect();
    let succeeded_ids: Vec<i64> = ids
        .iter()
        .copied()
        .filter(|id| found_ids.contains(id))
        .collect();
    let failed: Vec<BatchTrashFailure> = not_found_failures(ids, &found_ids).collect();

    for track in &tracks {
        if let Some(ref cover_path) = track.cover_art_path {
            reader::remove_cover_art_file(cover_path);
        }
    }

    Ok(BatchTrashResult {
        succeeded_ids,
        failed,
    })
}

fn not_found_failures<'a>(
    ids: &'a [i64],
    found_ids: &'a std::collections::HashSet<i64>,
) -> impl Iterator<Item = BatchTrashFailure> + 'a {
    ids.iter()
        .filter(move |id| !found_ids.contains(id))
        .map(|&id| BatchTrashFailure {
            id,
            error: format!("Track {id} not found"),
        })
}

#[tauri::command(async)]
pub fn get_track_details(id: i64, db: State<DbState>) -> Result<TrackDetails, AppError> {
    let track = {
        let conn = db.0.lock().map_err(|_| AppError::LockPoisoned)?;
        library_repo::get_track_by_id(&conn, id)?
            .ok_or_else(|| AppError::Generic(format!("Track {id} not found")))?
    };
    // File I/O (tag parsing) runs without the DB lock held.
    reader::read_track_details(&track.file_path, &track)
}

#[tauri::command(async)]
pub fn update_track_metadata(
    id: i64,
    title: Option<String>,
    artist: Option<String>,
    album: Option<String>,
    db: State<DbState>,
) -> Result<Track, AppError> {
    let track = {
        let conn = db.0.lock().map_err(|_| AppError::LockPoisoned)?;
        library_repo::get_track_by_id(&conn, id)?
            .ok_or_else(|| AppError::Generic(format!("Track {id} not found")))?
    };

    let new_title = title.unwrap_or(track.title.clone());
    let new_artist = artist.unwrap_or(track.artist.clone());
    let new_album = album.unwrap_or(track.album.clone());

    // The tag rewrite can shift the whole audio payload (seconds on large
    // files), so it must run without the DB lock held.
    writer::write_metadata(
        &track.file_path,
        Some(&new_title),
        Some(&new_artist),
        Some(&new_album),
    )?;

    let conn = db.0.lock().map_err(|_| AppError::LockPoisoned)?;
    // The file tags above are already written; a DB failure here leaves the
    // two stores inconsistent, so the error must say what actually happened.
    library_repo::update_track_metadata(&conn, id, &new_title, &new_artist, &new_album).map_err(
        |e| {
            AppError::Generic(format!(
                "File tags were updated, but syncing the library database failed \
                 (rescan the folder to recover): {e}"
            ))
        },
    )?;

    let updated = library_repo::get_track_by_id(&conn, id)?
        .ok_or_else(|| AppError::Generic(format!("Track {id} not found after update")))?;

    Ok(updated)
}

#[tauri::command(async)]
pub fn get_track_lyrics(id: i64, db: State<DbState>) -> Result<Option<String>, AppError> {
    let file_path = {
        let conn = db.0.lock().map_err(|_| AppError::LockPoisoned)?;
        let track = library_repo::get_track_by_id(&conn, id)?
            .ok_or_else(|| AppError::Generic(format!("Track {id} not found")))?;
        track.file_path
    };
    // File I/O (sidecar read, tag parsing) runs without the DB lock held.
    Ok(reader::read_lyrics(&file_path))
}

/// User-triggered online lyrics lookup (LRCLIB). Synced hits are cached as a
/// sidecar `.lrc`; the network call and file I/O run without the DB lock held.
#[tauri::command(async)]
pub fn fetch_lyrics_online(id: i64, db: State<DbState>) -> Result<Option<String>, AppError> {
    let track = {
        let conn = db.0.lock().map_err(|_| AppError::LockPoisoned)?;
        library_repo::get_track_by_id(&conn, id)?
            .ok_or_else(|| AppError::Generic(format!("Track {id} not found")))?
    };
    // "Unknown Artist" is the reader's placeholder for a missing tag — an
    // LRCLIB query built from it can only mismatch.
    if track.artist.trim().is_empty() || track.artist == "Unknown Artist" {
        return Err(AppError::Generic(
            "track has no artist tag; cannot search online".into(),
        ));
    }
    match lyrics_online::fetch(
        &track.artist,
        &track.title,
        &track.album,
        track.duration_secs,
    )? {
        Some(lyrics_online::FetchedLyrics::Synced(text)) => {
            lyrics_online::save_sidecar_if_absent(&track.file_path, &text);
            Ok(Some(text))
        }
        Some(lyrics_online::FetchedLyrics::Plain(text)) => Ok(Some(text)),
        None => Ok(None),
    }
}

#[tauri::command(async)]
pub fn get_all_artists(db: State<DbState>) -> Result<Vec<ArtistSummary>, AppError> {
    let conn = db.0.lock().map_err(|_| AppError::LockPoisoned)?;
    library_repo::get_all_artists(&conn)
}

#[tauri::command(async)]
pub fn get_all_albums(db: State<DbState>) -> Result<Vec<AlbumSummary>, AppError> {
    let conn = db.0.lock().map_err(|_| AppError::LockPoisoned)?;
    library_repo::get_all_albums(&conn)
}

#[tauri::command(async)]
pub fn get_tracks_by_artist(artist: String, db: State<DbState>) -> Result<Vec<Track>, AppError> {
    let conn = db.0.lock().map_err(|_| AppError::LockPoisoned)?;
    library_repo::get_tracks_by_artist(&conn, &artist)
}

#[tauri::command(async)]
pub fn get_tracks_by_album(
    album: String,
    artist: String,
    db: State<DbState>,
) -> Result<Vec<Track>, AppError> {
    let conn = db.0.lock().map_err(|_| AppError::LockPoisoned)?;
    library_repo::get_tracks_by_album(&conn, &album, &artist)
}

#[tauri::command(async)]
pub fn get_most_played_tracks(
    limit: Option<i64>,
    db: State<DbState>,
) -> Result<Vec<Track>, AppError> {
    let conn = db.0.lock().map_err(|_| AppError::LockPoisoned)?;
    library_repo::get_most_played_tracks(&conn, limit.unwrap_or(50))
}

#[tauri::command(async)]
pub fn start_watching(
    folder: String,
    db: State<DbState>,
    watcher_state: State<WatcherState>,
) -> Result<(), AppError> {
    let conn = db.0.lock().map_err(|_| AppError::LockPoisoned)?;
    library_repo::add_scan_folder(&conn, &folder)?;
    drop(conn);

    let w = watcher_state.0.lock().map_err(|_| AppError::LockPoisoned)?;
    if let Some(ref watcher) = *w {
        watcher.watch(&folder)?;
    }
    Ok(())
}

#[tauri::command(async)]
pub fn stop_watching(
    folder: String,
    db: State<DbState>,
    watcher_state: State<WatcherState>,
) -> Result<(), AppError> {
    let conn = db.0.lock().map_err(|_| AppError::LockPoisoned)?;
    library_repo::remove_scan_folder(&conn, &folder)?;
    drop(conn);

    let w = watcher_state.0.lock().map_err(|_| AppError::LockPoisoned)?;
    if let Some(ref watcher) = *w {
        watcher.unwatch(&folder)?;
    }
    Ok(())
}

#[tauri::command(async)]
pub fn get_watched_folders(db: State<DbState>) -> Result<Vec<WatchedFolder>, AppError> {
    let conn = db.0.lock().map_err(|_| AppError::LockPoisoned)?;
    let folders = library_repo::get_all_scan_folders(&conn)?;
    drop(conn);

    Ok(folders.into_iter().map(WatchedFolder::from_path).collect())
}
