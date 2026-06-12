pub mod audio;
pub mod commands;
pub mod error;
pub mod metadata;
pub mod models;
pub mod scanner;
pub mod storage;
pub mod tray;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use audio::AudioPlayer;
use audio::SharedPlayer;
use rusqlite::Connection;
use storage::db;
use tauri::{Emitter, Manager};

pub struct DbState(pub Arc<Mutex<Connection>>);
pub struct WatcherState(pub Mutex<Option<scanner::watcher::FolderWatcher>>);

fn spawn_player_polling(
    shutdown: Arc<AtomicBool>,
    app_handle: tauri::AppHandle,
    player: SharedPlayer,
) {
    std::thread::spawn(move || {
        while !shutdown.load(Ordering::Relaxed) {
            std::thread::sleep(std::time::Duration::from_millis(250));
            let state = {
                let mut p = match player.lock() {
                    Ok(p) => p,
                    Err(e) => {
                        eprintln!("player lock poisoned in polling thread: {e}");
                        continue;
                    }
                };
                let transitioned = p.check_gapless_transition();
                let ended = p.has_track_ended();
                if ended {
                    p.acknowledge_track_ended();
                }
                crate::models::player_state::PlayerState {
                    is_playing: p.is_playing(),
                    current_track_id: p.get_current_track_id(),
                    position_secs: p.get_pos(),
                    duration_secs: p.get_duration(),
                    volume: p.get_volume(),
                    track_ended: ended,
                    gapless_queued: p.is_gapless_queued(),
                    gapless_transitioned: transitioned,
                }
            };
            let _ = app_handle.emit("player-state-changed", &state);
        }
    });
}

/// Create the folder watcher and start watching all saved scan folders.
/// Returns `None` when the watcher cannot be created — the app still works,
/// only live library updates are disabled.
fn init_watcher(
    db_arc: &Arc<Mutex<Connection>>,
    app_handle: &tauri::AppHandle,
) -> Option<scanner::watcher::FolderWatcher> {
    let watcher = match scanner::watcher::FolderWatcher::new(
        Arc::<Mutex<Connection>>::clone(db_arc),
        app_handle.clone(),
    ) {
        Ok(w) => w,
        Err(e) => {
            eprintln!("[lyra] folder watcher unavailable, live library updates disabled: {e}");
            return None;
        }
    };

    match db_arc.lock() {
        Ok(conn) => match storage::library_repo::get_all_scan_folders(&conn) {
            Ok(folders) => {
                for folder in folders {
                    if let Err(e) = watcher.watch(&folder) {
                        eprintln!("[lyra] failed to watch folder {folder}: {e}");
                    }
                }
            }
            Err(e) => eprintln!("[lyra] failed to load scan folders for watching: {e}"),
        },
        Err(e) => eprintln!("[lyra] failed to lock db while starting watcher: {e}"),
    }

    Some(watcher)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let conn = db::init_db(app.handle())?;
            let db_arc = Arc::new(Mutex::new(conn));
            app.manage(DbState(Arc::<Mutex<Connection>>::clone(&db_arc)));

            let watcher = init_watcher(&db_arc, app.handle());
            app.manage(WatcherState(Mutex::new(watcher)));

            let player = AudioPlayer::new()?;
            app.manage(SharedPlayer::new(Mutex::new(player)));
            tray::create_tray(app)?;

            let shutdown = Arc::new(AtomicBool::new(false));
            let shutdown_for_thread = Arc::<AtomicBool>::clone(&shutdown);
            let shutdown_for_event = Arc::<AtomicBool>::clone(&shutdown);

            let player_for_thread = Arc::clone(app.state::<SharedPlayer>().inner());
            spawn_player_polling(shutdown_for_thread, app.handle().clone(), player_for_thread);

            let main_window = app.get_webview_window("main");
            if let Some(window) = main_window {
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::Destroyed = event {
                        shutdown_for_event.store(true, Ordering::Relaxed);
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Playback commands
            commands::playback::play_track,
            commands::playback::pause,
            commands::playback::resume,
            commands::playback::stop,
            commands::playback::seek,
            commands::playback::set_volume,
            commands::playback::get_player_state,
            commands::playback::queue_next_track,
            // Library commands
            commands::library::scan_folder,
            commands::library::get_all_tracks,
            commands::library::get_track_cover,
            commands::library::search_tracks,
            commands::library::remove_track,
            commands::library::trash_track,
            commands::library::trash_tracks,
            commands::library::remove_tracks,
            commands::library::get_track_details,
            commands::library::import_paths,
            commands::library::update_track_metadata,
            commands::library::get_all_artists,
            commands::library::get_all_albums,
            commands::library::get_tracks_by_artist,
            commands::library::get_tracks_by_album,
            commands::library::increment_play_count,
            commands::library::get_most_played_tracks,
            commands::library::start_watching,
            commands::library::stop_watching,
            commands::library::get_watched_folders,
            // Playlist commands
            commands::playlist::create_playlist,
            commands::playlist::rename_playlist,
            commands::playlist::get_all_playlists,
            commands::playlist::get_playlist_tracks,
            commands::playlist::add_to_playlist,
            commands::playlist::remove_from_playlist,
            commands::playlist::batch_add_to_playlist,
            commands::playlist::batch_remove_from_playlist,
            commands::playlist::reorder_playlist,
            commands::playlist::reorder_playlists,
            commands::playlist::delete_playlist,
            commands::playlist::save_playback_position,
            commands::playlist::get_last_playback_position,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
