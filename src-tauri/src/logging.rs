//! Diagnostics log.
//!
//! A packaged app has no terminal, so `log::error!` / `warn!` / `info!` go to
//! stderr and to `lyra.log` in the app's log directory (tauri-plugin-log).
//! This module only holds the configuration and the two things the plugin
//! does not do: recording panics and the stderr-only fallback.

use tauri::{AppHandle, Runtime};
use tauri_plugin_log::{Builder, RotationStrategy, Target, TargetKind, TimezoneStrategy};

/// `lyra.log`; the plugin appends the extension.
const LOG_FILE_STEM: &str = "lyra";
/// At most this much in `lyra.log`, plus as much again in the one archived file.
const MAX_LOG_BYTES: u128 = 1024 * 1024;
/// Rotated files are renamed to `lyra_<date>_<time>.log`; keep one of them.
const ARCHIVED_LOG_FILES: usize = 1;

fn builder() -> Builder {
    Builder::new()
        // Dependencies (symphonia, tao, ...) log through the same crate:
        // keep their chatter out, ours in.
        .level(log::LevelFilter::Warn)
        .level_for(env!("CARGO_CRATE_NAME"), log::LevelFilter::Info)
        .max_file_size(MAX_LOG_BYTES)
        .rotation_strategy(RotationStrategy::KeepSome(ARCHIVED_LOG_FILES))
        // Local time needs the UTC offset, which cannot be read reliably
        // once threads are running; the plugin would silently fall back.
        .timezone_strategy(TimezoneStrategy::UseUtc)
}

/// Starts logging to stderr and the log file, and records panics.
///
/// Never fails: when the log file cannot be opened (read-only or full disk),
/// logging continues on stderr only and the app starts normally.
pub fn init<R: Runtime>(app: &AppHandle<R>) {
    let to_file = builder()
        .targets([
            Target::new(TargetKind::Stderr),
            Target::new(TargetKind::LogDir {
                file_name: Some(LOG_FILE_STEM.to_string()),
            }),
        ])
        .build();
    if let Err(e) = app.plugin(to_file) {
        eprintln!("[lyra] log file unavailable, logging to stderr only: {e}");
        let stderr_only = builder().targets([Target::new(TargetKind::Stderr)]).build();
        if let Err(e) = app.plugin(stderr_only) {
            eprintln!("[lyra] logging unavailable: {e}");
        }
    }
    install_panic_hook();
}

/// Records panics in the log, then runs the previous hook (which prints to stderr).
fn install_panic_hook() {
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        log::error!("panic: {info}");
        previous(info);
    }));
}
