//! Native macOS application menu bar.
//!
//! Structure and labels follow Apple HIG:
//! https://developer.apple.com/design/human-interface-guidelines/the-menu-bar

use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};

use tauri::menu::{AboutMetadata, Menu, MenuEvent, MenuItem, PredefinedMenuItem, Submenu};
use tauri::Emitter;
use tauri::{AppHandle, Manager, Runtime, WebviewUrl, WebviewWindowBuilder};
#[cfg(target_os = "macos")]
use tauri::TitleBarStyle;

pub const EVENT: &str = "fnode://menu";
static WINDOW_SEQ: AtomicU64 = AtomicU64::new(1);

pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let about = PredefinedMenuItem::about(
        app,
        Some("About FNode"),
        Some(AboutMetadata {
            name: Some("FNode".into()),
            version: Some(env!("CARGO_PKG_VERSION").into()),
            copyright: Some("Copyright © 2026 Nitin Kanish".into()),
            credits: Some(
                "Your machine. Your node. One pulse.\n\n\
FNode is a local-first macOS command center for developers. \
It shows live CPU, memory, disk, ports, processes, projects, Docker, Homebrew, and local AI runtimes — \
then lets you stop services and clear user caches on this Mac.\n\n\
Process control is fail-closed. Keys stay in SQLite and are never echoed. \
Nothing is uploaded unless you opt into the cloud assistant or cost tracker.\n\n\
Requires macOS 12 or later. MIT License.\n\
github.com/nitinkanish/fnode"
                    .into(),
            ),
            ..Default::default()
        }),
    )?;
    let settings = MenuItem::with_id(app, "settings", "Settings…", true, Some("CmdOrCtrl+,"))?;
    let services = PredefinedMenuItem::services(app, None)?;
    let hide = PredefinedMenuItem::hide(app, Some("Hide FNode"))?;
    let hide_others = PredefinedMenuItem::hide_others(app, None)?;
    let show_all = PredefinedMenuItem::show_all(app, None)?;
    let quit = PredefinedMenuItem::quit(app, Some("Quit FNode"))?;
    let sep = || PredefinedMenuItem::separator(app);

    let app_menu = Submenu::with_items(
        app,
        "FNode",
        true,
        &[
            &about,
            &sep()?,
            &settings,
            &sep()?,
            &services,
            &sep()?,
            &hide,
            &hide_others,
            &show_all,
            &sep()?,
            &quit,
        ],
    )?;

    // File: window-level items only. FNode is not a document app, so Save / Open
    // Recent / Print are omitted rather than shown disabled.
    let new_window = MenuItem::with_id(app, "file-new-window", "New Window", true, Some("CmdOrCtrl+N"))?;
    let close = MenuItem::with_id(app, "file-close", "Close", true, Some("CmdOrCtrl+W"))?;
    let close_all = MenuItem::with_id(app, "file-close-all", "Close All", true, Some("Alt+CmdOrCtrl+W"))?;
    let file_menu = Submenu::with_items(
        app,
        "File",
        true,
        &[&new_window, &sep()?, &close, &close_all],
    )?;

    let undo = PredefinedMenuItem::undo(app, None)?;
    let redo = PredefinedMenuItem::redo(app, None)?;
    let cut = PredefinedMenuItem::cut(app, None)?;
    let copy = PredefinedMenuItem::copy(app, None)?;
    let paste = PredefinedMenuItem::paste(app, None)?;
    let select_all = PredefinedMenuItem::select_all(app, None)?;
    let find = MenuItem::with_id(app, "edit-find", "Find…", true, Some("CmdOrCtrl+F"))?;
    let edit_menu = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &undo,
            &redo,
            &sep()?,
            &cut,
            &copy,
            &paste,
            &select_all,
            &sep()?,
            &find,
        ],
    )?;

    let reload = MenuItem::with_id(app, "view-reload", "Reload Data", true, Some("CmdOrCtrl+R"))?;
    let sidebar = MenuItem::with_id(app, "view-sidebar", "Hide Sidebar", true, Some("Alt+CmdOrCtrl+S"))?;
    let ask = MenuItem::with_id(app, "view-ask", "Ask FNode", true, Some("CmdOrCtrl+L"))?;
    let fullscreen = PredefinedMenuItem::fullscreen(app, None)?;
    let view_menu = Submenu::with_items(
        app,
        "View",
        true,
        &[&reload, &sep()?, &sidebar, &ask, &sep()?, &fullscreen],
    )?;

    let go_menu = Submenu::with_items(
        app,
        "Go",
        true,
        &[
            &MenuItem::with_id(app, "go:dashboard", "Overview", true, Some("CmdOrCtrl+1"))?,
            &MenuItem::with_id(app, "go:apps", "Apps", true, Some("CmdOrCtrl+2"))?,
            &MenuItem::with_id(app, "go:ports", "Ports", true, Some("CmdOrCtrl+3"))?,
            &MenuItem::with_id(app, "go:processes", "Processes", true, Some("CmdOrCtrl+4"))?,
            &MenuItem::with_id(app, "go:projects", "Projects", true, Some("CmdOrCtrl+5"))?,
            &MenuItem::with_id(app, "go:docker", "Docker", true, Some("CmdOrCtrl+6"))?,
            &MenuItem::with_id(app, "go:ai", "AI Models", true, Some("CmdOrCtrl+7"))?,
            &MenuItem::with_id(app, "go:brew", "Homebrew", true, Some("CmdOrCtrl+8"))?,
            &MenuItem::with_id(app, "go:cache", "Cache", true, Some("CmdOrCtrl+9"))?,
            &sep()?,
            &MenuItem::with_id(app, "go:settings", "Settings", true, None::<&str>)?,
        ],
    )?;

    let minimize = PredefinedMenuItem::minimize(app, None)?;
    let zoom = PredefinedMenuItem::maximize(app, Some("Zoom"))?;
    let bring = PredefinedMenuItem::bring_all_to_front(app, None)?;
    let window_menu = Submenu::with_items(
        app,
        "Window",
        true,
        &[&minimize, &zoom, &sep()?, &bring],
    )?;

    let help = MenuItem::with_id(app, "help-about", "FNode Help", true, None::<&str>)?;
    let github = MenuItem::with_id(app, "help-fnode", "FNode on GitHub", true, None::<&str>)?;
    let help_ask = MenuItem::with_id(app, "help-ask", "Ask FNode…", true, None::<&str>)?;
    let help_menu = Submenu::with_items(app, "Help", true, &[&help, &github, &sep()?, &help_ask])?;

    Menu::with_items(
        app,
        &[
            &app_menu,
            &file_menu,
            &edit_menu,
            &view_menu,
            &go_menu,
            &window_menu,
            &help_menu,
        ],
    )
}

pub fn on_event<R: Runtime>(app: &AppHandle<R>, event: MenuEvent) {
    let id = event.id.as_ref();
    match id {
        "settings" | "go:settings" => {
            reveal(app);
            let _ = app.emit(EVENT, "settings");
        }
        "file-new-window" => {
            if let Err(err) = open_window(app) {
                eprintln!("new window: {err}");
            }
        }
        "file-close" => hide_focused(app),
        "file-close-all" => {
            for (label, window) in app.webview_windows() {
                dismiss_window(&label, &window);
            }
        }
        "edit-find" => {
            reveal(app);
            let _ = app.emit(EVENT, "find");
        }
        "view-reload" => {
            let _ = app.emit(EVENT, "reload");
        }
        "view-sidebar" => {
            let _ = app.emit(EVENT, "sidebar");
        }
        "view-ask" | "help-ask" => {
            reveal(app);
            let _ = app.emit(EVENT, "ask");
        }
        "help-about" => {
            reveal(app);
            let _ = app.emit(EVENT, "about");
        }
        "help-fnode" => {
            let _ = Command::new("open")
                .arg("https://github.com/nitinkanish/fnode")
                .spawn();
        }
        id if id.starts_with("go:") => {
            reveal(app);
            let _ = app.emit(EVENT, id.trim_start_matches("go:"));
        }
        _ => {}
    }
}

pub fn hide_focused<R: Runtime>(app: &AppHandle<R>) {
    let windows = app.webview_windows();
    let focused = windows
        .iter()
        .find(|(_, window)| window.is_focused().unwrap_or(false))
        .map(|(label, window)| (label.clone(), window.clone()));
    if let Some((label, window)) = focused {
        dismiss_window(&label, &window);
        return;
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
}

fn dismiss_window<R: Runtime>(label: &str, window: &tauri::WebviewWindow<R>) {
    if label == "main" {
        let _ = window.hide();
    } else {
        let _ = window.close();
    }
}

pub fn reveal<R: Runtime>(app: &AppHandle<R>) {
    let visible = app.webview_windows().into_iter().find_map(|(_, window)| {
        window.is_visible().ok().filter(|visible| *visible).and(Some(window))
    });
    let window = visible.or_else(|| app.get_webview_window("main"));
    if let Some(window) = window {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn open_window<R: Runtime>(app: &AppHandle<R>) -> Result<(), Box<dyn std::error::Error>> {
    let n = WINDOW_SEQ.fetch_add(1, Ordering::Relaxed) + 1;
    let label = format!("win-{n}");
    let mut builder = WebviewWindowBuilder::new(app, &label, WebviewUrl::App("index.html".into()))
        .title("FNode")
        .inner_size(1440.0, 900.0)
        .min_inner_size(1100.0, 720.0)
        .resizable(true);
    #[cfg(target_os = "macos")]
    {
        builder = builder
            .hidden_title(true)
            .title_bar_style(TitleBarStyle::Overlay)
            .traffic_light_position(tauri::LogicalPosition::new(16.0, 20.0));
    }
    builder.build()?;
    Ok(())
}
