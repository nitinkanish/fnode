mod ai_detector;
mod app_icon;
mod assistant;
mod cache;
mod commands;
mod control;
mod db;
mod dock_icon;
mod docker;
mod error;
mod health;
mod models;
mod paths;
mod port_scanner;
mod process_scanner;
mod project_detector;
mod state;
mod system_monitor;

use state::AppState;
use sysinfo::{ProcessesToUpdate, System};
use tauri::Manager;

/// FNode desktop shell.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir().expect("app data directory");
            std::fs::create_dir_all(&data_dir)?;
            std::fs::create_dir_all(data_dir.join("logs"))?;
            let db_path = data_dir.join(db::DB_FILENAME);
            migrate_legacy_db(&db_path);
            let db = db::init(&db_path)?;

            let mut sys = System::new();
            sys.refresh_cpu_all();
            sys.refresh_memory();
            sys.refresh_processes(ProcessesToUpdate::All, true);

            app.manage(AppState::new(db, sys, data_dir));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_live_snapshot,
            commands::get_dashboard_overview,
            commands::get_system_snapshot,
            commands::get_listening_ports,
            commands::get_processes,
            commands::scan_projects,
            commands::get_projects,
            commands::get_docker_overview,
            commands::docker_start,
            commands::docker_stop,
            commands::docker_restart,
            commands::docker_logs,
            commands::docker_open_shell,
            commands::detect_ai_services,
            commands::ai_start,
            commands::ai_stop,
            commands::ai_open_chat,
            commands::kill_process,
            commands::kill_processes,
            commands::get_cache_guide,
            commands::inspect_caches,
            commands::clear_cache,
            commands::restart_process,
            commands::open_terminal,
            commands::open_folder,
            commands::open_in_cursor,
            commands::open_url,
            commands::get_logs,
            commands::ask_assistant,
            commands::get_settings,
            commands::save_settings,
        ])
        .build(tauri::generate_context!())
        .expect("error while building FNode")
        .run(|_app, event| {
            if let tauri::RunEvent::Ready = event {
                dock_icon::apply();
            }
        });
}

fn migrate_legacy_db(dest: &std::path::Path) {
    if dest.exists() {
        return;
    }
    let Some(home) = dirs::home_dir() else {
        return;
    };
    let support = home.join("Library/Application Support");
    let candidates = [
        support.join("com.fnode.app/fnode.db"),
        support.join("com.devpilot.app/devpilot.db"),
    ];
    for old in candidates {
        if old.is_file() {
            if let Some(parent) = dest.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            let _ = std::fs::copy(&old, dest);
            return;
        }
    }
}
