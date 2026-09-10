//! Battery health from `ioreg` (no sudo). Energy ranking reuses CPU share
//! from the live process groups — macOS "Energy Impact" needs `powermetrics`.

use std::process::Command;

use crate::models::{BatteryDrainer, BatteryStatus, SoftwareGroup};

pub fn snapshot(groups: &[SoftwareGroup]) -> BatteryStatus {
    let text = ioreg_battery().unwrap_or_default();
    if text.is_empty() || !text.contains("AppleSmartBattery") && !text.contains("CycleCount") {
        return BatteryStatus {
            present: false,
            percent: None,
            cycle_count: None,
            design_capacity: None,
            max_capacity: None,
            max_capacity_pct: None,
            condition: "Not present".into(),
            charging: false,
            drainers: drainers(groups),
        };
    }

    let cycle_count = int_key(&text, "CycleCount");
    let design = int_key(&text, "DesignCapacity");
    let max = int_key(&text, "AppleRawMaxCapacity").or_else(|| int_key(&text, "MaxCapacity"));
    let current = int_key(&text, "CurrentCapacity").or_else(|| int_key(&text, "AppleRawCurrentCapacity"));
    let charging = bool_key(&text, "IsCharging").unwrap_or(false);

    let max_capacity_pct = match (max, design) {
        (Some(max), Some(design)) if design > 0 => Some((max as f32 / design as f32) * 100.0),
        _ => None,
    };
    let percent = match (current, max.or(design)) {
        (Some(cur), Some(full)) if full > 0 => Some((cur as f32 / full as f32) * 100.0),
        _ => None,
    };

    let condition = condition_label(max_capacity_pct, &text);

    BatteryStatus {
        present: true,
        percent,
        cycle_count,
        design_capacity: design,
        max_capacity: max,
        max_capacity_pct,
        condition,
        charging,
        drainers: drainers(groups),
    }
}

fn drainers(groups: &[SoftwareGroup]) -> Vec<BatteryDrainer> {
    let mut rows: Vec<BatteryDrainer> = groups
        .iter()
        .filter(|group| group.cpu > 0.3)
        .map(|group| BatteryDrainer {
            name: group.name.clone(),
            cpu: group.cpu,
            memory_bytes: group.memory_bytes,
            icon: group.icon.clone(),
        })
        .collect();
    rows.sort_by(|a, b| b.cpu.partial_cmp(&a.cpu).unwrap_or(std::cmp::Ordering::Equal));
    rows.truncate(6);
    rows
}

fn condition_label(max_pct: Option<f32>, ioreg: &str) -> String {
    if ioreg.contains("PermanentFailureStatus\" = 1") {
        return "Service recommended".into();
    }
    match max_pct {
        Some(pct) if pct >= 80.0 => "Normal".into(),
        Some(pct) if pct >= 60.0 => "Fair".into(),
        Some(_) => "Poor".into(),
        None => "Unknown".into(),
    }
}

fn ioreg_battery() -> Option<String> {
    let output = Command::new("/usr/sbin/ioreg")
        .args(["-n", "AppleSmartBattery", "-r", "-d", "1", "-w", "0"])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    Some(String::from_utf8_lossy(&output.stdout).into_owned())
}

fn int_key(text: &str, key: &str) -> Option<u32> {
    let needle = format!("\"{key}\"");
    for line in text.lines() {
        let line = line.trim();
        if !line.contains(&needle) {
            continue;
        }
        let value = line.split('=').nth(1)?.trim().trim_end_matches(',');
        return value.parse().ok();
    }
    None
}

fn bool_key(text: &str, key: &str) -> Option<bool> {
    let needle = format!("\"{key}\"");
    for line in text.lines() {
        if !line.contains(&needle) {
            continue;
        }
        let value = line.split('=').nth(1)?.trim().trim_end_matches(',');
        return Some(value == "Yes" || value == "true");
    }
    None
}
