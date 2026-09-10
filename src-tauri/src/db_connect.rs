//! One-click open for local database listeners.
//!
//! Only loopback addresses, only postgres/redis/mongo process names or well
//! known ports, and only URL schemes (no AppleScript, no shell interpolation).

use std::process::Command;

use crate::models::PortInfo;

pub fn classify(port: &PortInfo) -> Option<&'static str> {
    let name = format!("{} {}", port.process_name, port.display_name).to_ascii_lowercase();
    if name.contains("postgres") || name.contains("postmaster") || port.port == 5432 {
        return Some("postgres");
    }
    if name.contains("redis") || port.port == 6379 {
        return Some("redis");
    }
    if name.contains("mongo") || port.port == 27017 {
        return Some("mongodb");
    }
    None
}

pub fn open(kind: &str, port: u16, address: &str, listening: &[PortInfo]) -> Result<(), String> {
    if !matches!(kind, "postgres" | "redis" | "mongodb") {
        return Err("Unknown database kind.".into());
    }
    if !is_loopback(address) {
        return Err("FNode only opens loopback database ports.".into());
    }
    let Some(info) = listening.iter().find(|row| row.port == port && is_loopback(&row.address)) else {
        return Err("That port is not listening on loopback right now.".into());
    };
    let Some(detected) = classify(info) else {
        return Err("That listener does not look like Postgres, Redis, or MongoDB.".into());
    };
    if detected != kind {
        return Err("Port kind does not match the listening process.".into());
    }
    let url = match kind {
        "postgres" => format!("postgresql://127.0.0.1:{port}/postgres"),
        "redis" => format!("redis://127.0.0.1:{port}"),
        "mongodb" => format!("mongodb://127.0.0.1:{port}"),
        _ => return Err("Unknown database kind.".into()),
    };
    if Command::new("open").arg(&url).spawn().is_ok() {
        return Ok(());
    }
    let app = default_app(kind);
    Command::new("open")
        .args(["-a", app])
        .arg(&url)
        .spawn()
        .map_err(|_| {
            format!("Could not open {kind}. Install TablePlus, Compass, or another client that handles {kind} URLs.")
        })?;
    Ok(())
}

fn is_loopback(address: &str) -> bool {
    matches!(
        address,
        "127.0.0.1" | "localhost" | "::1" | "[::1]" | "*" | "0.0.0.0" | "::"
    )
}

fn default_app(kind: &str) -> &'static str {
    match kind {
        "mongodb" => "MongoDB Compass",
        "redis" => "TablePlus",
        _ => "TablePlus",
    }
}
