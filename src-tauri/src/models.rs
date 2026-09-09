use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemSnapshot {
    pub hostname: String,
    pub os_name: String,
    pub os_version: String,
    pub cpu_brand: String,
    pub cpu_cores: usize,
    pub cpu_usage: f32,
    pub memory_used: u64,
    pub memory_total: u64,
    pub swap_used: u64,
    pub swap_total: u64,
    pub disk_used: u64,
    pub disk_total: u64,
    pub disk_mount: String,
    pub process_count: usize,
    pub uptime_seconds: u64,
    pub load_avg_1: f64,
    pub load_avg_5: f64,
    pub load_avg_15: f64,
    pub cpu_per_core: Vec<f32>,
    pub arch: String,
    pub kernel: String,
    pub network_rx_bytes: u64,
    pub network_tx_bytes: u64,
    pub network_rx_per_sec: f64,
    pub network_tx_per_sec: f64,
    pub temperature_c: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChartProc {
    pub pid: u32,
    pub name: String,
    pub cpu: f32,
    pub memory_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppPaths {
    pub data_dir: String,
    pub database: String,
    pub logs_dir: String,
    pub home_dir: String,
    pub executable: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveSnapshot {
    pub system: SystemSnapshot,
    pub open_ports: usize,
    pub docker_containers: usize,
    pub docker_running: usize,
    pub docker_available: bool,
    pub ai_services: usize,
    pub project_count: usize,
    pub top_ports: Vec<PortInfo>,
    pub ports: Vec<PortInfo>,
    pub processes: Vec<DevProcess>,
    pub top_cpu: Vec<ChartProc>,
    pub top_memory: Vec<ChartProc>,
    pub software_groups: Vec<SoftwareGroup>,
    pub gui_apps: Vec<SoftwareGroup>,
    pub localhost_apps: Vec<LocalhostApp>,
    pub health: SystemHealth,
    pub paths: AppPaths,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardOverview {
    pub system: SystemSnapshot,
    pub open_ports: usize,
    pub docker_containers: usize,
    pub docker_running: usize,
    pub docker_available: bool,
    pub ai_services: usize,
    pub project_count: usize,
    pub top_ports: Vec<PortInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortInfo {
    pub port: u16,
    pub protocol: String,
    pub address: String,
    pub pid: u32,
    pub process_name: String,
    pub display_name: String,
    pub command: String,
    pub cpu: f32,
    pub memory_bytes: u64,
    pub project_name: Option<String>,
    pub project_path: Option<String>,
    pub cwd: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvVar {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DevProcess {
    pub pid: u32,
    pub parent_pid: Option<u32>,
    pub name: String,
    pub display_name: String,
    pub framework: Option<String>,
    pub runtime: Option<String>,
    pub command: String,
    pub cwd: Option<String>,
    pub cpu: f32,
    pub memory_bytes: u64,
    pub started_at: u64,
    pub ports: Vec<u16>,
    pub is_dev_service: bool,
    pub safe_env: Vec<EnvVar>,
    pub exe: Option<String>,
    pub status: String,
    pub software: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SoftwareGroup {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub cpu: f32,
    pub memory_bytes: u64,
    pub process_count: usize,
    pub pids: Vec<u32>,
    pub ports: Vec<u16>,
    pub can_stop: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalhostApp {
    pub pid: u32,
    pub name: String,
    pub software: String,
    pub port: u16,
    pub address: String,
    pub cpu: f32,
    pub memory_bytes: u64,
    pub cwd: Option<String>,
    pub can_stop: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthAlert {
    pub id: String,
    pub severity: String,
    pub title: String,
    pub body: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemHealth {
    pub score: u8,
    pub status: String,
    pub temperature_c: Option<f32>,
    pub cpu_speed_limit: Option<u32>,
    pub cpu_pct: f64,
    pub memory_pct: f64,
    pub disk_pct: f64,
    pub load_ratio: f64,
    pub alerts: Vec<HealthAlert>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheEntry {
    pub id: String,
    pub label: String,
    pub description: String,
    pub after_clear: String,
    pub path: String,
    pub bytes: u64,
    pub files: u64,
    pub exists: bool,
    pub scanned: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheSyscall {
    pub name: String,
    pub purpose: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheGuide {
    pub title: String,
    pub summary: String,
    pub does: Vec<String>,
    pub never: Vec<String>,
    pub syscalls: Vec<CacheSyscall>,
    pub categories: Vec<CacheEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheProgress {
    pub job: String,
    pub phase: String,
    pub syscall: String,
    pub path: String,
    pub message: String,
    pub bytes: u64,
    pub files: u64,
    pub skipped: u64,
    pub done: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheClearResult {
    pub id: String,
    pub label: String,
    pub path: String,
    pub bytes: u64,
    pub files: u64,
    pub dirs: u64,
    pub skipped: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: i64,
    pub name: String,
    pub path: String,
    pub framework: Option<String>,
    pub language: Option<String>,
    pub git_branch: Option<String>,
    pub last_modified: Option<String>,
    pub created_at: String,
    pub is_running: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerContainer {
    pub id: String,
    pub name: String,
    pub image: String,
    pub status: String,
    pub state: String,
    pub ports: Vec<String>,
    pub created: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerImage {
    pub id: String,
    pub tags: Vec<String>,
    pub size: u64,
    pub created: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerVolume {
    pub name: String,
    pub driver: String,
    pub mountpoint: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerNetwork {
    pub id: String,
    pub name: String,
    pub driver: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerOverview {
    pub available: bool,
    pub error: Option<String>,
    pub containers: Vec<DockerContainer>,
    pub images: Vec<DockerImage>,
    pub volumes: Vec<DockerVolume>,
    pub networks: Vec<DockerNetwork>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiModel {
    pub name: String,
    pub size: Option<String>,
    pub parameter_size: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiService {
    pub provider: String,
    pub running: bool,
    pub endpoint: Option<String>,
    pub models: Vec<AiModel>,
    pub pid: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogResult {
    pub source: String,
    pub title: String,
    pub lines: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssistantReply {
    pub answer: String,
    pub local_only: bool,
    pub citations: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub openai_enabled: bool,
    pub openai_model: String,
    pub poll_interval_ms: u64,
    pub project_roots: Vec<String>,
    pub has_openai_key: bool,
    pub paths: AppPaths,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsUpdate {
    pub openai_enabled: Option<bool>,
    pub openai_model: Option<String>,
    pub poll_interval_ms: Option<u64>,
    pub project_roots: Option<Vec<String>>,
    /// If Some, replace the stored key. Empty string clears it. Never echoed back.
    pub openai_api_key: Option<String>,
}
