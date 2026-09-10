//! macOS menu bar status item for camera / microphone activity.

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager};

use crate::models::PrivacyStatus;

static APP: std::sync::OnceLock<AppHandle> = std::sync::OnceLock::new();

pub fn install(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let _ = APP.set(app.handle().clone());
    let show = MenuItem::with_id(app, "show", "Show FNode", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show])?;
    let icon = app
        .default_window_icon()
        .cloned()
        .ok_or("missing window icon")?;

    TrayIconBuilder::with_id("privacy")
        .icon(icon)
        .icon_as_template(true)
        .tooltip("FNode")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| {
            if event.id.as_ref() == "show" {
                show_main(app);
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

pub fn apply_current(privacy: &PrivacyStatus) {
    if let Some(app) = APP.get() {
        apply(app, privacy);
    }
}

pub fn apply(app: &tauri::AppHandle, privacy: &PrivacyStatus) {
    let Some(tray) = app.tray_by_id("privacy") else {
        return;
    };
    let title = match (privacy.camera_active, privacy.microphone_active) {
        (true, true) => Some("Cam+Mic"),
        (true, false) => Some("Cam"),
        (false, true) => Some("Mic"),
        (false, false) => None,
    };
    let _ = tray.set_title(title);
    let tip = match (privacy.camera_active, privacy.microphone_active) {
        (true, true) => "Camera and microphone in use",
        (true, false) => "Camera in use",
        (false, true) => "Microphone in use",
        (false, false) => "FNode — sensors idle",
    };
    let _ = tray.set_tooltip(Some(tip));
}

fn show_main(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}
