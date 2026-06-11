use std::sync::Arc;

use crate::audio::SharedPlayer;
use tauri::{
    Emitter, Manager,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};

pub fn create_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let play_pause = MenuItem::with_id(app, "tray_play_pause", "Play / Pause", true, None::<&str>)?;
    let prev = MenuItem::with_id(app, "tray_prev", "Previous Track", true, None::<&str>)?;
    let next = MenuItem::with_id(app, "tray_next", "Next Track", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let show = MenuItem::with_id(app, "tray_show", "Show Window", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "tray_quit", "Quit", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&play_pause, &prev, &next, &separator, &show, &quit])?;

    let icon = app
        .default_window_icon()
        .ok_or("no default window icon configured")?
        .clone();

    TrayIconBuilder::new()
        .icon(icon)
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "tray_play_pause" => {
                let player = Arc::clone(app.state::<SharedPlayer>().inner());
                if let Ok(p) = player.lock() {
                    if p.is_playing() {
                        p.pause();
                    } else {
                        p.play();
                    }
                }
            }
            "tray_prev" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.emit("tray-prev", ());
                }
            }
            "tray_next" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.emit("tray-next", ());
                }
            }
            "tray_show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "tray_quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    if window.is_visible().unwrap_or(false) {
                        let _ = window.hide();
                    } else {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            }
        })
        .build(app)?;

    Ok(())
}
