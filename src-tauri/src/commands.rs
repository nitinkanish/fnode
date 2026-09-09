use std::path::PathBuf;

use serde_json::json;
use tauri::State;

use crate::ai_detector;
use crate::assistant;
use crate::control;
use crate::db;
use crate::docker;
use crate::models::{
    AppSettings, AssistantReply, DevProcess, DockerOverview, LiveSnapshot, LogResult, PortInfo,
    Project, SettingsUpdate, SystemSnapshot,
};
use crate::project_detector;
use crate::state::{self, AppState};

#[tauri::command]
pub fn get_live_snapshot(state: State<AppState>, developer_only: bool) -> Result<LiveSnapshot, String> {
    Ok(state.live_snapshot(developer_only))
}

#[tauri::command]
pub fn get_dashboard_overview(state: State<AppState>) -> Result<LiveSnapshot, String> {
    Ok(state.live_snapshot(true))
}

#[tauri::command]
pub fn get_system_snapshot(state: State<AppState>) -> Result<SystemSnapshot, String> {
    Ok(state.live_snapshot(true).system)
}

#[tauri::command]
pub fn get_listening_ports(state: State<AppState>) -> Result<Vec<PortInfo>, String> {
    Ok(state.live_snapshot(true).ports)
}

#[tauri::command]
pub fn get_processes(state: State<AppState>, developer_only: bool) -> Result<Vec<DevProcess>, String> {
    Ok(state.live_snapshot(developer_only).processes)
}

#[tauri::command]
pub fn scan_projects(state: State<AppState>) -> Result<Vec<Project>, String> {
    let roots = project_roots_from_settings(&state);
    let mut projects = project_detector::scan(&roots);
    state::mark_running(&state, &mut projects);
    let db = state.lock_db();
    db::upsert_projects(&db, &projects).map_err(|e| e.to_string())?;
    let mut stored = db::list_projects(&db).map_err(|e| e.to_string())?;
    drop(db);
    state::mark_running(&state, &mut stored);
    Ok(stored)
}

#[tauri::command]
pub fn get_projects(state: State<AppState>) -> Result<Vec<Project>, String> {
    let mut projects = {
        let db = state.lock_db();
        db::list_projects(&db).map_err(|e| e.to_string())?
    };
    if projects.is_empty() {
        return scan_projects(state);
    }
    state::mark_running(&state, &mut projects);
    Ok(projects)
}

#[tauri::command]
pub async fn get_docker_overview(state: State<'_, AppState>) -> Result<DockerOverview, String> {
    let overview = docker::overview().await;
    let running = overview
        .containers
        .iter()
        .filter(|c| c.state.eq_ignore_ascii_case("running"))
        .count();
    state.set_docker_counts(overview.available, overview.containers.len(), running);
    if overview.available {
        let db = state.lock_db();
        let _ = db::replace_containers(&db, &overview.containers);
    }
    Ok(overview)
}

#[tauri::command]
pub async fn docker_start(id: String) -> Result<(), String> {
    docker::start(&id).await
}

#[tauri::command]
pub async fn docker_stop(id: String) -> Result<(), String> {
    docker::stop(&id).await
}

#[tauri::command]
pub async fn docker_restart(id: String) -> Result<(), String> {
    docker::restart(&id).await
}

#[tauri::command]
pub async fn docker_logs(id: String) -> Result<LogResult, String> {
    let lines = docker::logs(&id, 200).await?;
    Ok(LogResult {
        source: "docker".into(),
        title: format!("Container {id}"),
        lines,
    })
}

#[tauri::command]
pub fn docker_open_shell(name: String) -> Result<(), String> {
    docker::open_shell(&name)
}

#[tauri::command]
pub async fn detect_ai_services(state: State<'_, AppState>) -> Result<Vec<crate::models::AiService>, String> {
    state.refresh_system();
    let (listening, hints) = {
        let sys = state.lock_sys();
        let ports = crate::port_scanner::scan(&sys);
        let listening: Vec<u16> = ports.iter().map(|p| p.port).collect();
        let hints = ai_detector::hints_from_system(&sys);
        (listening, hints)
    };
    let services = ai_detector::detect(&hints, &listening).await;
    let persist: Vec<(String, String, Option<String>, Option<String>)> = services
        .iter()
        .flat_map(|svc| {
            if svc.models.is_empty() {
                vec![(
                    svc.provider.clone(),
                    svc.provider.clone(),
                    None,
                    svc.endpoint.clone(),
                )]
            } else {
                svc.models
                    .iter()
                    .map(|model| {
                        (
                            svc.provider.clone(),
                            model.name.clone(),
                            model.size.clone(),
                            svc.endpoint.clone(),
                        )
                    })
                    .collect()
            }
        })
        .collect();
    let db = state.lock_db();
    let _ = db::replace_ai_models(&db, &persist);
    Ok(services)
}

#[tauri::command]
pub fn ai_start(provider: String) -> Result<(), String> {
    ai_detector::start_provider(&provider)
}

#[tauri::command]
pub fn ai_stop(state: State<AppState>, pid: u32) -> Result<(), String> {
    let sys = state.lock_sys();
    control::kill_pid(Some(&sys), pid, false)
}

#[tauri::command]
pub fn ai_open_chat(provider: String, endpoint: Option<String>) -> Result<(), String> {
    ai_detector::open_chat(&provider, endpoint.as_deref())
}

#[tauri::command]
pub fn kill_process(state: State<AppState>, pid: u32, force: bool) -> Result<(), String> {
    let sys = state.lock_sys();
    control::kill_pid(Some(&sys), pid, force)
}

#[tauri::command]
pub fn restart_process(state: State<AppState>, pid: u32) -> Result<u32, String> {
    state.refresh_system();
    let log_dir = state.data_dir.join("logs");
    let plan = {
        let sys = state.lock_sys();
        control::plan_restart(&sys, pid)?
    };
    let (new_pid, log_path) = control::execute_restart(plan, pid, &log_dir)?;
    state
        .captured_logs
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .insert(new_pid, log_path);
    Ok(new_pid)
}

#[tauri::command]
pub fn open_terminal(state: State<AppState>, path: String) -> Result<(), String> {
    control::open_terminal(&path, Some(&state.data_dir))
}

#[tauri::command]
pub fn open_folder(state: State<AppState>, path: String) -> Result<(), String> {
    control::open_folder(&path, Some(&state.data_dir))
}

#[tauri::command]
pub fn open_in_cursor(path: String) -> Result<(), String> {
    control::open_in_cursor(&path)
}

#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    control::open_url(&url)
}

#[tauri::command]
pub async fn get_logs(
    state: State<'_, AppState>,
    pid: Option<u32>,
    cwd: Option<String>,
    container_id: Option<String>,
) -> Result<LogResult, String> {
    if let Some(id) = container_id {
        return docker_logs(id).await;
    }

    if let Some(pid) = pid {
        let captured = state
            .captured_logs
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .get(&pid)
            .cloned();
        if let Some(path) = captured {
            let lines = control::tail_file(&path, 64 * 1024)?;
            return Ok(LogResult {
                source: "captured".into(),
                title: format!("PID {pid} (captured after restart)"),
                lines,
            });
        }
    }

    if let Some(cwd) = cwd {
        let lines = control::collect_project_logs(std::path::Path::new(&cwd));
        if !lines.is_empty() {
            return Ok(LogResult {
                source: "files".into(),
                title: cwd,
                lines,
            });
        }
    }

    Ok(LogResult {
        source: "unavailable".into(),
        title: "Logs".into(),
        lines: vec![
            "FNode can only capture stdout/stderr for processes it restarts.".into(),
            "For Docker containers, use View logs on the Docker page.".into(),
            "If this is a Node/Python app, log files in ./logs will appear here when present.".into(),
        ],
    })
}

#[tauri::command]
pub async fn ask_assistant(state: State<'_, AppState>, question: String) -> Result<AssistantReply, String> {
    let live = state.live_snapshot(true);
    let (openai_enabled, openai_model, api_key) = {
        let db = state.lock_db();
        let openai_enabled = db::get_setting(&db, "openai_enabled")
            .ok()
            .flatten()
            .map(|v| v == "true")
            .unwrap_or(false);
        let openai_model = db::get_setting(&db, "openai_model")
            .ok()
            .flatten()
            .unwrap_or_else(|| "gpt-4o-mini".into());
        let api_key = db::get_setting(&db, "openai_api_key").ok().flatten();
        (openai_enabled, openai_model, api_key)
    };

    let overview = crate::models::DashboardOverview {
        system: live.system.clone(),
        open_ports: live.open_ports,
        docker_containers: live.docker_containers,
        docker_running: live.docker_running,
        docker_available: live.docker_available,
        ai_services: live.ai_services,
        project_count: live.project_count,
        top_ports: live.top_ports.clone(),
    };
    let projects = {
        let db = state.lock_db();
        let mut projects = db::list_projects(&db).unwrap_or_default();
        drop(db);
        state::mark_running(&state, &mut projects);
        projects
    };

    let local = assistant::answer_locally(&question, &overview, &live.ports, &live.processes, &projects);
    if openai_enabled {
        if let Some(key) = api_key.filter(|k| !k.is_empty()) {
            let context = assistant::build_context(&overview, &live.ports, &live.processes, &projects);
            match openai_complete(&key, &openai_model, &question, &context).await {
                Ok(answer) => {
                    return Ok(AssistantReply {
                        answer,
                        local_only: false,
                        citations: local.citations,
                    });
                }
                Err(err) => {
                    return Ok(AssistantReply {
                        answer: format!(
                            "{}\n\n(OpenAI request failed: {err}. Showing the local analysis instead.)",
                            local.answer
                        ),
                        local_only: true,
                        citations: local.citations,
                    });
                }
            }
        }
    }
    Ok(local)
}

#[tauri::command]
pub fn get_settings(state: State<AppState>) -> Result<AppSettings, String> {
    let db = state.lock_db();
    let openai_enabled = db::get_setting(&db, "openai_enabled")
        .ok()
        .flatten()
        .map(|v| v == "true")
        .unwrap_or(false);
    let openai_model = db::get_setting(&db, "openai_model")
        .ok()
        .flatten()
        .unwrap_or_else(|| "gpt-4o-mini".into());
    let poll_interval_ms = db::get_setting(&db, "poll_interval_ms")
        .ok()
        .flatten()
        .and_then(|v| v.parse().ok())
        .unwrap_or(3000);
    let project_roots = db::get_setting(&db, "project_roots")
        .ok()
        .flatten()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_else(|| {
            project_detector::default_roots()
                .iter()
                .map(|p| p.to_string_lossy().into_owned())
                .collect()
        });
    let has_openai_key = db::get_setting(&db, "openai_api_key")
        .ok()
        .flatten()
        .map(|v| !v.is_empty())
        .unwrap_or(false);
    drop(db);

    Ok(AppSettings {
        openai_enabled,
        openai_model,
        poll_interval_ms,
        project_roots,
        has_openai_key,
        paths: state.app_paths(),
    })
}

#[tauri::command]
pub fn save_settings(state: State<AppState>, update: SettingsUpdate) -> Result<AppSettings, String> {
    {
        let db = state.lock_db();
        if let Some(enabled) = update.openai_enabled {
            db::set_setting(&db, "openai_enabled", if enabled { "true" } else { "false" })
                .map_err(|e| e.to_string())?;
        }
        if let Some(model) = update.openai_model {
            db::set_setting(&db, "openai_model", &model).map_err(|e| e.to_string())?;
        }
        if let Some(ms) = update.poll_interval_ms {
            db::set_setting(&db, "poll_interval_ms", &ms.to_string()).map_err(|e| e.to_string())?;
        }
        if let Some(roots) = update.project_roots {
            let encoded = serde_json::to_string(&roots).map_err(|e| e.to_string())?;
            db::set_setting(&db, "project_roots", &encoded).map_err(|e| e.to_string())?;
        }
        if let Some(key) = update.openai_api_key {
            if key.is_empty() {
                db::delete_setting(&db, "openai_api_key").map_err(|e| e.to_string())?;
            } else {
                db::set_setting(&db, "openai_api_key", &key).map_err(|e| e.to_string())?;
            }
        }
    }
    get_settings(state)
}

fn project_roots_from_settings(state: &AppState) -> Vec<PathBuf> {
    let db = state.lock_db();
    if let Ok(Some(raw)) = db::get_setting(&db, "project_roots") {
        if let Ok(list) = serde_json::from_str::<Vec<String>>(&raw) {
            return list.into_iter().map(PathBuf::from).collect();
        }
    }
    drop(db);
    project_detector::default_roots()
}

async fn openai_complete(
    key: &str,
    model: &str,
    question: &str,
    context: &str,
) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(40))
        .build()
        .map_err(|e| e.to_string())?;
    let body = json!({
        "model": model,
        "temperature": 0.2,
        "messages": [
            {
                "role": "system",
                "content": "You are FNode, a local development command center for this Mac. Tagline: Your machine. Your node. One pulse. Answer using only the provided machine snapshot. Do not invent PIDs, ports, or projects. Never request or repeat secrets. Prefer concise, actionable answers."
            },
            {
                "role": "user",
                "content": format!("Question: {question}\n\nSnapshot:\n{context}")
            }
        ]
    });
    let response = client
        .post("https://api.openai.com/v1/chat/completions")
        .bearer_auth(key)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status()));
    }
    let payload: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
    payload
        .pointer("/choices/0/message/content")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| "OpenAI returned an empty completion".into())
}
