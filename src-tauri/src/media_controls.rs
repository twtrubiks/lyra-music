//! MPRIS media controls (Linux only): lets the desktop — the KDE task manager
//! tooltip, media keys, the lock screen — show what is playing and control it.
//!
//! Requests come in on souvlaki's D-Bus thread. Play / pause go straight to the
//! player; next / previous are forwarded to the frontend on the same events the
//! tray uses, because the play queue lives there.
//!
//! Neither the track length nor the position is published: souvlaki only
//! reports a position when the playback status is set, so a seek bar on the
//! desktop side would drift. Without a length, desktops hide the seek bar.

use std::fmt::Write as _;
use std::sync::Mutex;

use rusqlite::Connection;
use souvlaki::{MediaControlEvent, MediaControls, MediaMetadata, MediaPlayback, PlatformConfig};
use tauri::{AppHandle, Emitter, Manager};

use crate::audio::SharedPlayer;
use crate::lock::LockRecover;
use crate::models::player_state::PlayerState;
use crate::models::track::Track;
use crate::storage::library_repo;

/// Suffix of the bus name: `org.mpris.MediaPlayer2.lyra_music`.
const DBUS_NAME: &str = "lyra_music";
const DISPLAY_NAME: &str = "Lyra Music";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Status {
    Stopped,
    Paused,
    Playing,
}

/// Playback status as MPRIS understands it. Without a loaded track there is
/// nothing to resume, so that is `Stopped` whatever the sink reports.
pub fn status_of(current_track_id: Option<i64>, is_playing: bool) -> Status {
    match (current_track_id, is_playing) {
        (None, _) => Status::Stopped,
        (Some(_), true) => Status::Playing,
        (Some(_), false) => Status::Paused,
    }
}

/// What differs from the previous observation.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Changes {
    pub track: bool,
    pub status: bool,
}

/// Remembers what was last published, so the 250 ms poll only sends D-Bus
/// updates when something actually changed.
#[derive(Debug, Default)]
pub struct ChangeTracker {
    last: Option<(Option<i64>, Status)>,
}

impl ChangeTracker {
    pub fn observe(&mut self, track_id: Option<i64>, status: Status) -> Changes {
        let changes = match self.last {
            None => Changes {
                track: true,
                status: true,
            },
            Some((last_track, last_status)) => Changes {
                track: last_track != track_id,
                status: last_status != status,
            },
        };
        self.last = Some((track_id, status));
        changes
    }
}

/// `file://` URL for an absolute path, percent-encoding everything outside the
/// RFC 3986 unreserved set (and `/`).
pub fn file_url(path: &str) -> String {
    let mut url = String::from("file://");
    for byte in path.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'/' | b'-' | b'.' | b'_' | b'~') {
            url.push(char::from(byte));
        } else {
            // Writing to a String cannot fail.
            let _ = write!(url, "%{byte:02X}");
        }
    }
    url
}

/// The app's presence on the session bus. Dropping it releases the bus name.
pub struct MediaSession {
    controls: MediaControls,
    tracker: ChangeTracker,
}

impl MediaSession {
    /// Register on the session bus. `None` when that fails (no session bus, or
    /// the name is taken): the app works as before, just without desktop
    /// media controls.
    pub fn start(app: AppHandle, player: SharedPlayer) -> Option<Self> {
        let config = PlatformConfig {
            display_name: DISPLAY_NAME,
            dbus_name: DBUS_NAME,
            hwnd: None,
        };
        let attached = MediaControls::new(config).and_then(|mut controls| {
            controls.attach(move |event| handle_event(&app, &player, &event))?;
            Ok(controls)
        });
        match attached {
            Ok(controls) => Some(Self {
                controls,
                tracker: ChangeTracker::default(),
            }),
            Err(e) => {
                log::warn!("desktop media controls unavailable: {e}");
                None
            }
        }
    }

    /// Publish the current track and playback status if they changed. Called
    /// from the player polling thread, outside the player lock.
    pub fn update(&mut self, state: &PlayerState, db: &Mutex<Connection>) {
        let status = status_of(state.current_track_id, state.is_playing);
        let changes = self.tracker.observe(state.current_track_id, status);

        if changes.track {
            let track = state.current_track_id.and_then(|id| load_track(db, id));
            self.publish_metadata(track.as_ref());
        }
        if changes.status {
            let playback = match status {
                Status::Stopped => MediaPlayback::Stopped,
                Status::Paused => MediaPlayback::Paused { progress: None },
                Status::Playing => MediaPlayback::Playing { progress: None },
            };
            if let Err(e) = self.controls.set_playback(playback) {
                log::warn!("failed to publish playback status: {e}");
            }
        }
    }

    fn publish_metadata(&mut self, track: Option<&Track>) {
        let cover_url = track
            .and_then(|t| t.cover_art_path.as_deref())
            .map(file_url);
        let metadata = MediaMetadata {
            title: track.map(|t| t.title.as_str()),
            artist: track.map(|t| t.artist.as_str()),
            album: track.map(|t| t.album.as_str()),
            cover_url: cover_url.as_deref(),
            duration: None,
        };
        if let Err(e) = self.controls.set_metadata(metadata) {
            log::warn!("failed to publish track metadata: {e}");
        }
    }
}

fn load_track(db: &Mutex<Connection>, id: i64) -> Option<Track> {
    let conn = db.lock_recover();
    match library_repo::get_track_by_id(&conn, id) {
        Ok(track) => track,
        Err(e) => {
            log::warn!("failed to load track {id} for media controls: {e}");
            None
        }
    }
}

fn handle_event(app: &AppHandle, player: &SharedPlayer, event: &MediaControlEvent) {
    match event {
        MediaControlEvent::Play => player.lock_recover().play(),
        // The frontend owns the queue and mirrors the backend's playing flag;
        // a real stop would drop the loaded track behind its back.
        MediaControlEvent::Pause | MediaControlEvent::Stop => player.lock_recover().pause(),
        MediaControlEvent::Toggle => {
            let p = player.lock_recover();
            if p.is_playing() {
                p.pause();
            } else {
                p.play();
            }
        }
        MediaControlEvent::Next => emit_to_main(app, "tray-next"),
        MediaControlEvent::Previous => emit_to_main(app, "tray-prev"),
        MediaControlEvent::Raise => {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
        MediaControlEvent::Quit => app.exit(0),
        // Seeking, volume and opening URIs are not offered over MPRIS.
        _ => {}
    }
}

fn emit_to_main(app: &AppHandle, event: &str) {
    if let Some(window) = app.get_webview_window("main")
        && let Err(e) = window.emit(event, ())
    {
        log::warn!("failed to forward {event} to the window: {e}");
    }
}
