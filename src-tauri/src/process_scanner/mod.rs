//! Turn raw OS processes into developer-facing records.
//!
//! Environment variables are filtered before they ever leave this module.
//! Secrets matching common key patterns are never included in IPC payloads.

use std::collections::{HashMap, HashSet};
use std::ffi::OsStr;
use std::path::Path;

use sysinfo::{Pid, Process, System};

use crate::models::{DevProcess, EnvVar, LocalhostApp, PortInfo, SoftwareGroup};

const DEV_RUNTIMES: &[&str] = &[
    "node", "nodejs", "npm", "npx", "pnpm", "yarn", "bun", "deno",
    "python", "python3", "uvicorn", "gunicorn", "hypercorn", "django", "flask",
    "java", "jshell", "mvn", "gradle",
    "go", "rustc", "cargo", "target",
    "ruby", "php", "elixir", "beam.smp",
    "docker", "com.docker", "dockerd", "containerd",
    "postgres", "redis-server", "mongod", "mysql", "mysqld", "nginx",
    "ollama", "lmstudio", "lm-studio", "whisper", "vllm",
];

const SENSITIVE_ENV_MARKERS: &[&str] = &[
    "KEY", "SECRET", "TOKEN", "PASSWORD", "PASSWD", "PWD", "CREDENTIAL",
    "AUTHORIZATION", "AUTH", "PRIVATE", "CERTIFICATE", "COOKIE", "SESSION",
    "AWS_", "DATABASE_URL", "DB_URL", "CONNECTION_STRING", "API_KEY",
    "ACCESS_KEY", "CLIENT_SECRET", "WEBHOOK",
];

const SAFE_ENV_ALLOWLIST: &[&str] = &[
    "NODE_ENV", "PORT", "HOST", "PYTHONUNBUFFERED", "PYTHONDONTWRITEBYTECODE",
    "FLASK_ENV", "FLASK_APP", "DJANGO_SETTINGS_MODULE", "RUST_LOG", "GO_ENV",
    "DEBUG", "ENVIRONMENT", "APP_ENV", "VITE_DEV_SERVER",
];

pub fn command_line(process: &Process) -> String {
    let cmd: Vec<String> = process
        .cmd()
        .iter()
        .map(|part| part.to_string_lossy().into_owned())
        .collect();
    if cmd.is_empty() {
        process.name().to_string_lossy().into_owned()
    } else {
        cmd.join(" ")
    }
}

pub fn classify_process(process: &Process, listening_ports: &[u16]) -> DevProcess {
    let name = process.name().to_string_lossy().into_owned();
    let command = command_line(process);
    let cwd = process
        .cwd()
        .map(|path| path.to_string_lossy().into_owned());
    let runtime = detect_runtime(&name, &command);
    let framework = detect_framework(&command, cwd.as_deref());
    let display_name = display_name_for(&name, cwd.as_deref(), framework.as_deref());
    let exe = process.exe().map(|p| p.to_string_lossy().into_owned());
    let software = software_name(exe.as_deref(), &name, &display_name);
    let is_dev_service = runtime.is_some()
        || !listening_ports.is_empty()
        || looks_like_dev_command(&command);

    DevProcess {
        pid: process.pid().as_u32(),
        parent_pid: process.parent().map(|pid| pid.as_u32()),
        name,
        display_name,
        framework,
        runtime,
        command,
        cwd,
        cpu: process.cpu_usage(),
        memory_bytes: process.memory(),
        started_at: process.start_time(),
        ports: listening_ports.to_vec(),
        is_dev_service,
        safe_env: safe_environment(process),
        exe,
        status: format!("{:?}", process.status()),
        software,
    }
}

pub fn list_processes(sys: &System, ports_by_pid: &HashMap<u32, Vec<u16>>) -> Vec<DevProcess> {
    let mut processes: Vec<DevProcess> = sys
        .processes()
        .values()
        .map(|proc| {
            let ports = ports_by_pid
                .get(&proc.pid().as_u32())
                .cloned()
                .unwrap_or_default();
            classify_process(proc, &ports)
        })
        .collect();

    processes.sort_by(|a, b| {
        b.is_dev_service
            .cmp(&a.is_dev_service)
            .then(b.cpu.partial_cmp(&a.cpu).unwrap_or(std::cmp::Ordering::Equal))
            .then(b.memory_bytes.cmp(&a.memory_bytes))
    });

    processes
}

pub fn find_process<'a>(sys: &'a System, pid: u32) -> Option<&'a Process> {
    sys.process(Pid::from_u32(pid))
}

pub fn title_from_path(path: &str) -> String {
    Path::new(path)
        .file_name()
        .and_then(OsStr::to_str)
        .map(humanize_slug)
        .unwrap_or_else(|| path.to_string())
}

fn humanize_slug(slug: &str) -> String {
    slug.replace(['-', '_'], " ")
        .split_whitespace()
        .map(|word| {
            let mut chars = word.chars();
            match chars.next() {
                Some(first) => format!("{}{}", first.to_uppercase(), chars.as_str()),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn display_name_for(name: &str, cwd: Option<&str>, _framework: Option<&str>) -> String {
    if let Some(path) = cwd {
        let folder = title_from_path(path);
        if !folder.is_empty() && folder.to_lowercase() != name.to_lowercase() {
            return folder;
        }
    }
    humanize_slug(name)
}

fn detect_runtime(name: &str, command: &str) -> Option<String> {
    let hay = format!("{name} {command}").to_lowercase();
    if hay.contains("node") || hay.contains("npm") || hay.contains("pnpm") || hay.contains("yarn") || hay.contains("npx") || hay.contains("bun") {
        return Some("Node.js".into());
    }
    if hay.contains("python") || hay.contains("uvicorn") || hay.contains("gunicorn") || hay.contains("hypercorn") {
        return Some("Python".into());
    }
    if hay.contains("java") || hay.contains("gradle") || hay.contains("mvn") {
        return Some("JVM".into());
    }
    if hay.split_whitespace().any(|p| p == "go" || p.ends_with("/go")) || hay.contains("go run") {
        return Some("Go".into());
    }
    if hay.contains("cargo") || hay.contains("rustc") {
        return Some("Rust".into());
    }
    if DEV_RUNTIMES.iter().any(|rt| hay.split_whitespace().any(|p| p == *rt || p.ends_with(&format!("/{rt}")))) {
        return Some(name.into());
    }
    None
}

fn detect_framework(command: &str, cwd: Option<&str>) -> Option<String> {
    let lower = command.to_lowercase();
    if lower.contains("next") || lower.contains("next-server") {
        return Some("Next.js".into());
    }
    if lower.contains("vite") {
        return Some("Vite".into());
    }
    if lower.contains("nest") {
        return Some("NestJS".into());
    }
    if lower.contains("uvicorn") || lower.contains("fastapi") {
        return Some("FastAPI".into());
    }
    if lower.contains("django") || lower.contains("manage.py") {
        return Some("Django".into());
    }
    if lower.contains("flask") || lower.contains("werkzeug") {
        return Some("Flask".into());
    }
    if lower.contains("angular") {
        return Some("Angular".into());
    }
    if let Some(path) = cwd {
        return infer_framework_from_disk(Path::new(path));
    }
    None
}

fn infer_framework_from_disk(cwd: &Path) -> Option<String> {
    let package = cwd.join("package.json");
    if let Ok(contents) = std::fs::read_to_string(package) {
        if contents.contains("\"next\"") {
            return Some("Next.js".into());
        }
        if contents.contains("\"@nestjs/core\"") {
            return Some("NestJS".into());
        }
        if contents.contains("\"@angular/core\"") {
            return Some("Angular".into());
        }
        if contents.contains("\"vue\"") {
            return Some("Vue".into());
        }
        if contents.contains("\"express\"") {
            return Some("Express".into());
        }
        if contents.contains("\"vite\"") {
            return Some("Vite".into());
        }
        if contents.contains("\"react\"") {
            return Some("React".into());
        }
    }
    if file_contains(cwd.join("pyproject.toml"), "fastapi")
        || file_contains(cwd.join("requirements.txt"), "fastapi")
    {
        return Some("FastAPI".into());
    }
    if file_contains(cwd.join("pyproject.toml"), "django")
        || cwd.join("manage.py").exists()
    {
        return Some("Django".into());
    }
    if file_contains(cwd.join("pyproject.toml"), "flask")
        || file_contains(cwd.join("requirements.txt"), "flask")
    {
        return Some("Flask".into());
    }
    if cwd.join("Cargo.toml").exists() {
        return Some("Rust".into());
    }
    if cwd.join("go.mod").exists() {
        return Some("Go".into());
    }
    None
}

fn file_contains(path: std::path::PathBuf, needle: &str) -> bool {
    std::fs::read_to_string(path)
        .map(|contents| contents.to_lowercase().contains(needle))
        .unwrap_or(false)
}

fn looks_like_dev_command(command: &str) -> bool {
    let lower = command.to_lowercase();
    lower.contains("npm run")
        || lower.contains("pnpm ")
        || lower.contains("yarn ")
        || lower.contains("vite")
        || lower.contains("uvicorn")
        || lower.contains("cargo run")
        || lower.contains("go run")
}

fn safe_environment(process: &Process) -> Vec<EnvVar> {
    let mut seen = HashSet::new();
    let mut vars = Vec::new();

    for entry in process.environ() {
        let raw = entry.to_string_lossy();
        let Some((key, value)) = raw.split_once('=') else {
            continue;
        };
        if !is_env_key_safe(key) {
            continue;
        }
        if !seen.insert(key.to_string()) {
            continue;
        }
        vars.push(EnvVar {
            key: key.to_string(),
            value: truncate(value, 120),
        });
        if vars.len() >= 12 {
            break;
        }
    }

    vars.sort_by(|a, b| a.key.cmp(&b.key));
    vars
}

fn is_env_key_safe(key: &str) -> bool {
    let upper = key.to_uppercase();
    if SENSITIVE_ENV_MARKERS
        .iter()
        .any(|marker| upper.contains(marker))
    {
        return false;
    }
    SAFE_ENV_ALLOWLIST
        .iter()
        .any(|allowed| upper == *allowed)
        || upper.starts_with("NEXT_PUBLIC_")
}

fn truncate(value: &str, max: usize) -> String {
    if value.len() <= max {
        value.to_string()
    } else {
        format!("{}…", &value[..max])
    }
}

const PROTECTED_SOFTWARE: &[&str] = &[
    "kernel_task",
    "launchd",
    "WindowServer",
    "loginwindow",
    "sysmond",
    "UserEventAgent",
    "cfprefsd",
    "FNode",
    "fnode",
];

pub fn software_name(exe: Option<&str>, name: &str, display: &str) -> String {
    if let Some(exe) = exe {
        if let Some(app) = app_bundle_name(exe) {
            return app;
        }
    }
    if !display.is_empty() {
        display.to_string()
    } else {
        name.to_string()
    }
}

fn app_bundle_name(exe: &str) -> Option<String> {
    let path = Path::new(exe);
    for ancestor in path.ancestors() {
        if ancestor.extension().and_then(|ext| ext.to_str()) == Some("app") {
            return ancestor
                .file_stem()
                .map(|stem| stem.to_string_lossy().into_owned());
        }
    }
    None
}

pub fn is_gui_app(exe: Option<&str>) -> bool {
    exe.is_some_and(|path| path.contains(".app/"))
}

pub fn can_stop_name(name: &str) -> bool {
    !PROTECTED_SOFTWARE
        .iter()
        .any(|protected| name.eq_ignore_ascii_case(protected))
}

pub fn group_software(processes: &[DevProcess]) -> Vec<SoftwareGroup> {
    let mut map: HashMap<String, SoftwareGroup> = HashMap::new();
    for proc in processes {
        let entry = map.entry(proc.software.clone()).or_insert_with(|| SoftwareGroup {
            id: proc.software.clone(),
            name: proc.software.clone(),
            kind: if is_gui_app(proc.exe.as_deref()) {
                "app".into()
            } else if proc.is_dev_service {
                "service".into()
            } else {
                "process".into()
            },
            cpu: 0.0,
            memory_bytes: 0,
            process_count: 0,
            pids: Vec::new(),
            ports: Vec::new(),
            can_stop: true,
        });
        entry.cpu += proc.cpu;
        entry.memory_bytes = entry.memory_bytes.saturating_add(proc.memory_bytes);
        entry.process_count += 1;
        entry.pids.push(proc.pid);
        for port in &proc.ports {
            if !entry.ports.contains(port) {
                entry.ports.push(*port);
            }
        }
        if !can_stop_name(&proc.name) || !can_stop_name(&proc.software) {
            entry.can_stop = false;
        }
        if is_gui_app(proc.exe.as_deref()) {
            entry.kind = "app".into();
        }
    }
    let mut groups: Vec<SoftwareGroup> = map.into_values().collect();
    groups.sort_by(|a, b| {
        b.cpu
            .partial_cmp(&a.cpu)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then(b.memory_bytes.cmp(&a.memory_bytes))
    });
    groups
}

pub fn gui_apps(groups: &[SoftwareGroup]) -> Vec<SoftwareGroup> {
    groups
        .iter()
        .filter(|group| group.kind == "app")
        .cloned()
        .collect()
}

pub fn localhost_apps(ports: &[PortInfo], processes: &[DevProcess]) -> Vec<LocalhostApp> {
    let by_pid: HashMap<u32, &DevProcess> = processes.iter().map(|p| (p.pid, p)).collect();
    let mut apps = Vec::new();
    let mut seen = HashSet::new();
    for port in ports {
        if !is_local_bind(&port.address) {
            continue;
        }
        let key = (port.pid, port.port);
        if !seen.insert(key) {
            continue;
        }
        let proc = by_pid.get(&port.pid);
        let can_stop = proc
            .map(|p| can_stop_name(&p.name) && can_stop_name(&p.software))
            .unwrap_or(true);
        apps.push(LocalhostApp {
            pid: port.pid,
            name: port.display_name.clone(),
            software: proc
                .map(|p| p.software.clone())
                .unwrap_or_else(|| port.process_name.clone()),
            port: port.port,
            address: port.address.clone(),
            cpu: port.cpu,
            memory_bytes: port.memory_bytes,
            cwd: port.cwd.clone(),
            can_stop,
        });
    }
    apps.sort_by(|a, b| a.port.cmp(&b.port));
    apps
}

fn is_local_bind(address: &str) -> bool {
    matches!(
        address,
        "127.0.0.1" | "localhost" | "::1" | "[::1]" | "*" | "0.0.0.0" | "::"
    ) || address.starts_with("127.")
}
