//! Process lifecycle helpers. Destructive signals refuse PID 0/1, this app,
//! and well-known macOS system processes. Folder/URL actions are path- and
//! loopback-gated so a compromised renderer cannot open arbitrary locations.

use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Duration;

use sysinfo::System;

use crate::paths;
use crate::process_scanner;

const PROTECTED_NAMES: &[&str] = &[
    "kernel_task",
    "launchd",
    "WindowServer",
    "loginwindow",
    "sysmond",
    "UserEventAgent",
    "cfprefsd",
];

pub fn kill_pid(sys: Option<&System>, pid: u32, force: bool) -> Result<(), String> {
    let current = std::process::id();
    if pid == 0 || pid == 1 || pid == current {
        return Err("Refusing to signal a protected process.".into());
    }

    if let Some(sys) = sys {
        if let Some(proc) = process_scanner::find_process(sys, pid) {
            let name = proc.name().to_string_lossy();
            if PROTECTED_NAMES.iter().any(|n| name.eq_ignore_ascii_case(n)) {
                return Err(format!("Refusing to stop system process `{name}`."));
            }
        }
    }

    let sig = if force { libc::SIGKILL } else { libc::SIGTERM };
    let rc = unsafe { libc::kill(pid as i32, sig) };
    if rc != 0 {
        return Err(format!(
            "Could not signal PID {pid}: {}",
            std::io::Error::last_os_error()
        ));
    }
    Ok(())
}

pub struct RestartPlan {
    pub cmd: Vec<std::ffi::OsString>,
    pub cwd: Option<PathBuf>,
}

pub fn plan_restart(sys: &System, pid: u32) -> Result<RestartPlan, String> {
    let proc = process_scanner::find_process(sys, pid)
        .ok_or_else(|| format!("PID {pid} is no longer running."))?;

    let cmd: Vec<std::ffi::OsString> = proc.cmd().to_vec();
    if cmd.is_empty() {
        return Err("Cannot restart: original command line is unavailable.".into());
    }
    if let Some(exe) = proc.exe() {
        if paths::is_system_executable(exe) {
            return Err("Refusing to restart a system executable.".into());
        }
    }
    let cwd = proc.cwd().map(PathBuf::from);
    if let Some(dir) = &cwd {
        paths::validate_existing_dir(&dir.to_string_lossy(), None)?;
    }
    kill_pid(Some(sys), pid, false)?;
    Ok(RestartPlan { cmd, cwd })
}

pub fn execute_restart(plan: RestartPlan, pid: u32, log_dir: &Path) -> Result<(u32, PathBuf), String> {
    std::thread::sleep(Duration::from_millis(350));
    let still_alive = unsafe { libc::kill(pid as i32, 0) } == 0;
    if still_alive {
        kill_pid(None, pid, true)?;
        std::thread::sleep(Duration::from_millis(150));
    }

    std::fs::create_dir_all(log_dir).map_err(|e| e.to_string())?;
    let log_path = log_dir.join(format!("restart-{pid}.log"));
    let stdout = File::create(&log_path).map_err(|e| e.to_string())?;
    let stderr = stdout.try_clone().map_err(|e| e.to_string())?;

    let mut command = Command::new(&plan.cmd[0]);
    if plan.cmd.len() > 1 {
        command.args(&plan.cmd[1..]);
    }
    if let Some(dir) = plan.cwd {
        command.current_dir(dir);
    }
    command
        .stdin(Stdio::null())
        .stdout(Stdio::from(stdout))
        .stderr(Stdio::from(stderr));

    let child = command
        .spawn()
        .map_err(|err| format!("Restarted process failed to spawn: {err}"))?;

    Ok((child.id(), log_path))
}

pub fn open_terminal(path: &str, extra: Option<&Path>) -> Result<(), String> {
    let dir = paths::validate_existing_dir(path, extra)?;
    Command::new("open")
        .args(["-a", "Terminal"])
        .arg(&dir)
        .spawn()
        .map_err(|err| err.to_string())?;
    Ok(())
}

pub fn open_folder(path: &str, extra: Option<&Path>) -> Result<(), String> {
    let dir = paths::validate_existing_dir(path, extra)?;
    Command::new("open")
        .arg(&dir)
        .spawn()
        .map_err(|err| err.to_string())?;
    Ok(())
}

pub fn open_in_cursor(path: &str) -> Result<(), String> {
    let dir = paths::validate_existing_dir(path, None)?;
    if Command::new("cursor").arg(&dir).spawn().is_ok() {
        return Ok(());
    }
    Command::new("open")
        .args(["-a", "Cursor"])
        .arg(&dir)
        .spawn()
        .map_err(|_| {
            "Could not open Cursor. Install Cursor and enable the `cursor` shell command.".to_string()
        })?;
    Ok(())
}

pub fn open_url(url: &str) -> Result<(), String> {
    let normalized = paths::validate_loopback_url(url)?;
    Command::new("open")
        .arg(&normalized)
        .spawn()
        .map_err(|err| err.to_string())?;
    Ok(())
}

pub fn tail_file(path: &Path, max_bytes: usize) -> Result<Vec<String>, String> {
    let mut file = File::open(path).map_err(|err| err.to_string())?;
    let len = file.metadata().map_err(|err| err.to_string())?.len() as usize;
    if len > max_bytes {
        file.seek(SeekFrom::End(-(max_bytes as i64)))
            .map_err(|err| err.to_string())?;
    }
    let mut buf = String::new();
    file.read_to_string(&mut buf).map_err(|err| err.to_string())?;
    let lines: Vec<String> = buf.lines().map(|l| l.to_string()).collect();
    Ok(lines.into_iter().rev().take(400).collect::<Vec<_>>().into_iter().rev().collect())
}

pub fn collect_project_logs(cwd: &Path) -> Vec<String> {
    let Ok(cwd) = paths::validate_existing_dir(&cwd.to_string_lossy(), None) else {
        return Vec::new();
    };
    let candidates = [cwd.join("logs"), cwd.join("log"), cwd.join(".next/trace")];
    let mut lines = Vec::new();
    for dir in candidates {
        if !dir.is_dir() {
            continue;
        }
        if let Ok(entries) = std::fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|e| e.to_str()) == Some("log") {
                    if let Ok(chunk) = tail_file(&path, 32 * 1024) {
                        lines.push(format!("--- {} ---", path.display()));
                        lines.extend(chunk);
                    }
                }
            }
        }
    }
    for name in ["npm-debug.log", "yarn-error.log", "dev.log", "server.log"] {
        let path = cwd.join(name);
        if path.is_file() {
            if let Ok(chunk) = tail_file(&path, 32 * 1024) {
                lines.push(format!("--- {name} ---"));
                lines.extend(chunk);
            }
        }
    }
    lines
}
