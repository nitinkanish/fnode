use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Instant;

use rusqlite::Connection;
use sysinfo::{Networks, ProcessesToUpdate, System};

use crate::battery;
use crate::db;
use crate::health;
use crate::models::{AppPaths, ChartProc, DevProcess, LiveSnapshot};
use crate::paths;
use crate::port_scanner;
use crate::privacy;
use crate::process_scanner;
use crate::system_monitor::{self, NetSample, DB_WRITE_TTL, LIVE_TTL};
use crate::tray;

struct LiveCache {
    at: Option<Instant>,
    snapshot: Option<LiveSnapshot>,
}

pub struct DockerCountCache {
    pub at: Option<Instant>,
    pub available: bool,
    pub total: usize,
    pub running: usize,
}

pub struct AppState {
    pub sys: Mutex<System>,
    pub networks: Mutex<Networks>,
    pub db: Mutex<Connection>,
    pub data_dir: PathBuf,
    pub captured_logs: Mutex<HashMap<u32, PathBuf>>,
    live: Mutex<LiveCache>,
    pub docker_cache: Mutex<DockerCountCache>,
    last_db_write: Mutex<Option<Instant>>,
    net_prev: Mutex<Option<NetSample>>,
}

impl AppState {
    pub fn new(db: Connection, sys: System, data_dir: PathBuf) -> Self {
        Self {
            sys: Mutex::new(sys),
            networks: Mutex::new(Networks::new_with_refreshed_list()),
            db: Mutex::new(db),
            data_dir,
            captured_logs: Mutex::new(HashMap::new()),
            live: Mutex::new(LiveCache {
                at: None,
                snapshot: None,
            }),
            docker_cache: Mutex::new(DockerCountCache {
                at: None,
                available: false,
                total: 0,
                running: 0,
            }),
            last_db_write: Mutex::new(None),
            net_prev: Mutex::new(None),
        }
    }

    pub fn lock_sys(&self) -> std::sync::MutexGuard<'_, System> {
        self.sys.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn lock_db(&self) -> std::sync::MutexGuard<'_, Connection> {
        self.db.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn app_paths(&self) -> AppPaths {
        AppPaths {
            data_dir: self.data_dir.display().to_string(),
            database: self.data_dir.join(crate::db::DB_FILENAME).display().to_string(),
            logs_dir: self.data_dir.join("logs").display().to_string(),
            home_dir: paths::home_dir().display().to_string(),
            executable: std::env::current_exe()
                .ok()
                .map(|p| p.display().to_string()),
        }
    }

    pub fn refresh_system(&self) {
        let mut sys = self.lock_sys();
        sys.refresh_cpu_all();
        sys.refresh_memory();
        sys.refresh_processes(ProcessesToUpdate::All, true);
        drop(sys);
        self.networks
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .refresh(true);
    }

    pub fn docker_counts(&self) -> (bool, usize, usize) {
        let cache = self.docker_cache.lock().unwrap_or_else(|e| e.into_inner());
        (cache.available, cache.total, cache.running)
    }

    pub fn set_docker_counts(&self, available: bool, total: usize, running: usize) {
        let mut cache = self.docker_cache.lock().unwrap_or_else(|e| e.into_inner());
        cache.at = Some(Instant::now());
        cache.available = available;
        cache.total = total;
        cache.running = running;
    }

    /// One sysinfo refresh + one `lsof`. Concurrent IPC callers share the result
    /// for LIVE_TTL so the UI can poll without tripling kernel work.
    pub fn live_snapshot(&self, developer_only: bool) -> LiveSnapshot {
        {
            let cache = self.live.lock().unwrap_or_else(|e| e.into_inner());
            if let (Some(at), Some(snapshot)) = (cache.at, cache.snapshot.as_ref()) {
                if at.elapsed() < LIVE_TTL {
                    return filter_snapshot(snapshot.clone(), developer_only);
                }
            }
        }

        let built = self.build_live();
        {
            let mut cache = self.live.lock().unwrap_or_else(|e| e.into_inner());
            cache.at = Some(Instant::now());
            cache.snapshot = Some(built.clone());
        }
        self.maybe_persist(&built);
        filter_snapshot(built, developer_only)
    }

    fn build_live(&self) -> LiveSnapshot {
        self.refresh_system();
        let raw_ports = port_scanner::scan_raw();

        let sys = self.lock_sys();
        let networks = self.networks.lock().unwrap_or_else(|e| e.into_inner());
        let prev = *self.net_prev.lock().unwrap_or_else(|e| e.into_inner());
        let (system, sample) = system_monitor::snapshot(&sys, &networks, prev);
        drop(networks);
        *self.net_prev.lock().unwrap_or_else(|e| e.into_inner()) = Some(sample);

        let ports = port_scanner::enrich(&sys, raw_ports);
        let mut ports_by_pid: HashMap<u32, Vec<u16>> = HashMap::new();
        for port in &ports {
            ports_by_pid.entry(port.pid).or_default().push(port.port);
        }
        let processes = process_scanner::list_processes(&sys, &ports_by_pid);
        drop(sys);

        let mut top_cpu: Vec<ChartProc> = processes
            .iter()
            .map(chart_proc)
            .collect();
        top_cpu.sort_by(|a, b| b.cpu.partial_cmp(&a.cpu).unwrap_or(std::cmp::Ordering::Equal));
        top_cpu.truncate(8);

        let mut top_memory: Vec<ChartProc> = processes.iter().map(chart_proc).collect();
        top_memory.sort_by(|a, b| b.memory_bytes.cmp(&a.memory_bytes));
        top_memory.truncate(8);

        let listening: Vec<u16> = ports.iter().map(|p| p.port).collect();
        let ai_services = [11434_u16, 1234, 7860, 8188]
            .iter()
            .filter(|port| listening.contains(port))
            .count();
        let (docker_available, docker_containers, docker_running) = self.docker_counts();
        let project_count = db::count_projects(&self.lock_db()).unwrap_or(0) as usize;

        let mut top_ports = ports.clone();
        top_ports.truncate(8);

        let all_groups = process_scanner::group_software(&processes);
        let mut gui_apps = process_scanner::gui_apps(&all_groups);
        gui_apps.truncate(80);
        let mut software_groups = all_groups;
        software_groups.truncate(40);
        let localhost_apps = process_scanner::localhost_apps(&ports, &processes);
        let mut health = health::evaluate(&system);
        health.temperature_c = health.temperature_c.or(system.temperature_c);
        let mut system = system;
        system.temperature_c = health.temperature_c;

        let privacy_enabled = db::get_setting(&self.lock_db(), "privacy_sensors_enabled")
            .ok()
            .flatten()
            .map(|v| v != "false")
            .unwrap_or(true);
        let privacy = privacy::scan(&processes, privacy_enabled);
        tray::apply_current(&privacy);
        let battery = battery::snapshot(&software_groups);

        LiveSnapshot {
            system,
            open_ports: ports.len(),
            docker_containers,
            docker_running,
            docker_available,
            ai_services,
            project_count,
            top_ports,
            ports,
            processes,
            top_cpu,
            top_memory,
            software_groups,
            gui_apps,
            localhost_apps,
            health,
            privacy,
            battery,
            paths: self.app_paths(),
        }
    }

    fn maybe_persist(&self, snapshot: &LiveSnapshot) {
        let mut last = self.last_db_write.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(at) = *last {
            if at.elapsed() < DB_WRITE_TTL {
                return;
            }
        }
        *last = Some(Instant::now());
        drop(last);
        let db = self.lock_db();
        let _ = db::replace_ports(&db, &snapshot.ports);
        let rows: Vec<(i64, String, String, Option<String>, f32, i64, Option<String>)> = snapshot
            .processes
            .iter()
            .filter(|p| p.is_dev_service)
            .take(80)
            .map(|p| {
                (
                    p.pid as i64,
                    p.display_name.clone(),
                    p.command.clone(),
                    p.cwd.clone(),
                    p.cpu,
                    p.memory_bytes as i64,
                    Some(p.started_at.to_string()),
                )
            })
            .collect();
        let _ = db::snapshot_processes(&db, &rows);
        let mem = if snapshot.system.memory_total == 0 {
            0.0
        } else {
            (snapshot.system.memory_used as f32 / snapshot.system.memory_total as f32) * 100.0
        };
        let swap = if snapshot.system.swap_total == 0 {
            0.0
        } else {
            (snapshot.system.swap_used as f32 / snapshot.system.swap_total as f32) * 100.0
        };
        let disk = if snapshot.system.disk_total == 0 {
            0.0
        } else {
            (snapshot.system.disk_used as f32 / snapshot.system.disk_total as f32) * 100.0
        };
        let ts = chrono::Utc::now().timestamp();
        let _ = db::insert_metrics(
            &db,
            ts,
            snapshot.system.cpu_usage,
            mem,
            swap,
            disk,
            snapshot.system.network_rx_per_sec,
            snapshot.system.network_tx_per_sec,
        );
    }
}

fn chart_proc(proc: &DevProcess) -> ChartProc {
    ChartProc {
        pid: proc.pid,
        name: proc.display_name.clone(),
        cpu: proc.cpu,
        memory_bytes: proc.memory_bytes,
    }
}

fn filter_snapshot(mut snapshot: LiveSnapshot, developer_only: bool) -> LiveSnapshot {
    if developer_only {
        snapshot.processes.retain(|p| p.is_dev_service);
    } else {
        snapshot.processes.truncate(250);
    }
    snapshot
}

pub fn mark_running(state: &AppState, projects: &mut [crate::models::Project]) {
    let sys = state.lock_sys();
    let cwds: Vec<PathBuf> = sys
        .processes()
        .values()
        .filter_map(|p| p.cwd().map(PathBuf::from))
        .collect();
    drop(sys);
    for project in projects.iter_mut() {
        let root = PathBuf::from(&project.path);
        project.is_running = cwds.iter().any(|cwd| paths::is_under(cwd, &root));
    }
}
