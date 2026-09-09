//! System health: CPU, memory, disk, load, and thermal pressure.
//!
//! Temperature uses sysinfo sensors when the Mac exposes them. Thermal
//! throttling is read from `pmset -g therm` (no root required).

use std::process::Command;

use sysinfo::Components;

use crate::models::{HealthAlert, SystemHealth, SystemSnapshot};

pub fn evaluate(system: &SystemSnapshot) -> SystemHealth {
    let cpu_pct = system.cpu_usage as f64;
    let mem_pct = if system.memory_total == 0 {
        0.0
    } else {
        (system.memory_used as f64 / system.memory_total as f64) * 100.0
    };
    let disk_pct = if system.disk_total == 0 {
        0.0
    } else {
        (system.disk_used as f64 / system.disk_total as f64) * 100.0
    };
    let load_ratio = system.load_avg_1 / (system.cpu_cores.max(1) as f64);
    let temperature_c = hottest_celsius();
    let speed_limit = cpu_speed_limit();

    let mut alerts = Vec::new();
    let mut score: i32 = 100;

    if cpu_pct >= 92.0 {
        score -= 28;
        alerts.push(alert(
            "cpu-critical",
            "critical",
            "CPU is running very hot",
            format!("Overall CPU is at {cpu_pct:.0}%. Close unused apps or stop a heavy process."),
        ));
    } else if cpu_pct >= 80.0 {
        score -= 14;
        alerts.push(alert(
            "cpu-high",
            "warning",
            "High CPU usage",
            format!("CPU is at {cpu_pct:.0}%. The machine may feel slow until load drops."),
        ));
    }

    if mem_pct >= 92.0 {
        score -= 22;
        alerts.push(alert(
            "memory-critical",
            "critical",
            "Memory is nearly full",
            format!("RAM is at {mem_pct:.0}%. macOS will start swapping and feel sluggish."),
        ));
    } else if mem_pct >= 82.0 {
        score -= 10;
        alerts.push(alert(
            "memory-high",
            "warning",
            "Memory pressure",
            format!("RAM is at {mem_pct:.0}%."),
        ));
    }

    if disk_pct >= 92.0 {
        score -= 18;
        alerts.push(alert(
            "disk-critical",
            "critical",
            "Startup disk is almost full",
            format!("Disk is at {disk_pct:.0}%. Free space before macOS starts failing writes."),
        ));
    } else if disk_pct >= 85.0 {
        score -= 8;
        alerts.push(alert(
            "disk-high",
            "warning",
            "Disk space is low",
            format!("Disk is at {disk_pct:.0}%."),
        ));
    }

    if load_ratio >= 1.8 {
        score -= 16;
        alerts.push(alert(
            "load-high",
            "warning",
            "Load average is high",
            format!(
                "1-minute load is {:.2} on {} cores.",
                system.load_avg_1, system.cpu_cores
            ),
        ));
    }

    let throttled = speed_limit.is_some_and(|limit| limit < 90);
    let overheating = temperature_c.is_some_and(|t| t >= 95.0) || throttled;
    if overheating {
        score -= 24;
        let detail = match (temperature_c, speed_limit) {
            (Some(t), Some(limit)) => format!("Hottest sensor {t:.0}°C · CPU speed limited to {limit}%."),
            (Some(t), None) => format!("Hottest sensor is {t:.0}°C."),
            (None, Some(limit)) => format!("macOS is limiting CPU speed to {limit}%."),
            _ => "The Mac is thermally constrained.".into(),
        };
        alerts.push(alert(
            "thermal",
            "critical",
            "Thermal pressure / overheating",
            detail,
        ));
    } else if temperature_c.is_some_and(|t| t >= 85.0) {
        score -= 10;
        alerts.push(alert(
            "warm",
            "warning",
            "CPU is running warm",
            format!("Hottest sensor is {:.0}°C.", temperature_c.unwrap()),
        ));
    }

    let score = score.clamp(5, 100) as u8;
    let status = if score >= 80 {
        "healthy"
    } else if score >= 55 {
        "watch"
    } else {
        "critical"
    };

    SystemHealth {
        score,
        status: status.into(),
        temperature_c,
        cpu_speed_limit: speed_limit,
        cpu_pct,
        memory_pct: mem_pct,
        disk_pct,
        load_ratio,
        alerts,
    }
}

fn alert(id: &str, severity: &str, title: &str, body: String) -> HealthAlert {
    HealthAlert {
        id: id.into(),
        severity: severity.into(),
        title: title.into(),
        body,
    }
}

fn hottest_celsius() -> Option<f32> {
    let components = Components::new_with_refreshed_list();
    components
        .iter()
        .filter_map(|component| component.temperature())
        .filter(|temp| temp.is_finite() && *temp > 1.0)
        .max_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal))
}

fn cpu_speed_limit() -> Option<u32> {
    let output = Command::new("pmset").args(["-g", "therm"]).output().ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout);
    for line in text.lines() {
        let line = line.trim();
        if let Some(rest) = line.strip_prefix("CPU_Speed_Limit") {
            let value = rest.trim().trim_start_matches('=').trim();
            if let Ok(limit) = value.parse::<u32>() {
                return Some(limit);
            }
        }
    }
    None
}
