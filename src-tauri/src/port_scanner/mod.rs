//! Listening TCP ports on localhost / all interfaces.
//!
//! macOS does not expose a stable, documented userspace API for the full
//! socket table without elevated privileges. `lsof -nP -iTCP -sTCP:LISTEN`
//! is the same source Activity Monitor and `netstat` wrap, and it returns
//! the owning PID so we can join against sysinfo.

use std::collections::HashSet;
use std::process::Command;

use sysinfo::{Pid, System};

use crate::models::PortInfo;
use crate::process_scanner::{self, classify_process};

#[derive(Debug, Clone)]
pub struct RawListen {
    pub command: String,
    pub pid: u32,
    pub protocol: String,
    pub address: String,
    pub port: u16,
}

pub fn scan_raw() -> Vec<RawListen> {
    parse_lsof().unwrap_or_default()
}

pub fn scan(sys: &System) -> Vec<PortInfo> {
    enrich(sys, scan_raw())
}

pub fn enrich(sys: &System, raw: Vec<RawListen>) -> Vec<PortInfo> {
    let mut seen = HashSet::new();
    let mut ports = Vec::new();

    for row in raw {
        let key = (row.port, row.pid, row.address.clone());
        if !seen.insert(key) {
            continue;
        }

        let pid = Pid::from_u32(row.pid);
        let process = sys.process(pid);
        let (cpu, memory, command, cwd) = if let Some(proc) = process {
            (
                proc.cpu_usage(),
                proc.memory(),
                process_scanner::command_line(proc),
                proc.cwd().map(|p| p.to_string_lossy().into_owned()),
            )
        } else {
            (0.0, 0, row.command.clone(), None)
        };

        let classified = process
            .map(|proc| classify_process(proc, &[row.port]))
            .unwrap_or_else(|| {
                crate::models::DevProcess {
                    pid: row.pid,
                    parent_pid: None,
                    name: row.command.clone(),
                    display_name: row.command.clone(),
                    framework: None,
                    runtime: None,
                    command: command.clone(),
                    cwd: cwd.clone(),
                    cpu,
                    memory_bytes: memory,
                    started_at: 0,
                    ports: vec![row.port],
                    is_dev_service: true,
                    safe_env: Vec::new(),
                    exe: None,
                    status: "unknown".into(),
                }
            });

        let (project_name, project_path) = match &classified.cwd {
            Some(path) => (
                Some(classified.display_name.clone()),
                Some(path.clone()),
            ),
            None => (None, None),
        };

        ports.push(PortInfo {
            port: row.port,
            protocol: row.protocol,
            address: row.address,
            pid: row.pid,
            process_name: classified.name,
            display_name: classified.display_name,
            command: classified.command,
            cpu: classified.cpu,
            memory_bytes: classified.memory_bytes,
            project_name,
            project_path,
            cwd: classified.cwd,
        });
    }

    ports.sort_by_key(|p| p.port);
    ports
}

fn parse_lsof() -> Result<Vec<RawListen>, std::io::Error> {
    let output = Command::new("lsof")
        .args(["-nP", "-iTCP", "-sTCP:LISTEN"])
        .output()?;

    if !output.status.success() && output.stdout.is_empty() {
        return Err(std::io::Error::other("lsof failed"));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut rows = Vec::new();

    for line in stdout.lines().skip(1) {
        if let Some(row) = parse_lsof_line(line) {
            rows.push(row);
        }
    }

    Ok(rows)
}

/// lsof columns are whitespace-separated; NAME is last and looks like
/// `127.0.0.1:3000 (LISTEN)`, `*:5173 (LISTEN)`, or `[::1]:8080 (LISTEN)`.
fn parse_lsof_line(line: &str) -> Option<RawListen> {
    let parts: Vec<&str> = line.split_whitespace().collect();
    if parts.len() < 9 {
        return None;
    }

    let command = parts[0].to_string();
    let pid = parts[1].parse::<u32>().ok()?;
    let node = parts[7];
    let protocol = if node.eq_ignore_ascii_case("TCP") {
        "TCP".into()
    } else {
        node.to_uppercase()
    };

    let name_field = parts[8..].join(" ");
    let (address, port) = parse_listen_endpoint(&name_field)?;

    Some(RawListen {
        command,
        pid,
        protocol,
        address,
        port,
    })
}

fn parse_listen_endpoint(name: &str) -> Option<(String, u16)> {
    let listen = name.split_whitespace().next().unwrap_or(name);
    if let Some(rest) = listen.strip_prefix('[') {
        let (host, after) = rest.split_once("]:")?;
        let port = after
            .split([':', ' '])
            .next()
            .and_then(|p| p.parse::<u16>().ok())?;
        return Some((host.to_string(), port));
    }

    let (host, port_str) = listen.rsplit_once(':')?;
    let port = port_str
        .split([' ', '('])
        .next()
        .and_then(|p| p.parse::<u16>().ok())?;
    Some((host.to_string(), port))
}

#[cfg(test)]
mod tests {
    use super::parse_listen_endpoint;

    #[test]
    fn parses_ipv4_and_ipv6() {
        assert_eq!(
            parse_listen_endpoint("127.0.0.1:3000 (LISTEN)"),
            Some(("127.0.0.1".into(), 3000))
        );
        assert_eq!(
            parse_listen_endpoint("*:5173 (LISTEN)"),
            Some(("*".into(), 5173))
        );
        assert_eq!(
            parse_listen_endpoint("[::1]:8080 (LISTEN)"),
            Some(("::1".into(), 8080))
        );
    }
}
