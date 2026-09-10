//! Battery health from `ioreg` (no sudo). Energy ranking reuses CPU share
//! from the live process groups — macOS "Energy Impact" needs `powermetrics`.

use std::process::Command;

use crate::models::{BatteryDrainer, BatteryStatus, SoftwareGroup};

pub fn snapshot(groups: &[SoftwareGroup]) -> BatteryStatus {
    let text = ioreg_battery().unwrap_or_default();
    if text.is_empty() || (!text.contains("AppleSmartBattery") && !text.contains("\"CycleCount\"")) {
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

    parse_ioreg(&text, drainers(groups))
}

fn parse_ioreg(text: &str, drainers: Vec<BatteryDrainer>) -> BatteryStatus {
    let cycle_count = int_key(text, "CycleCount");
    let design = int_key(text, "DesignCapacity");
    // Apple Silicon reports MaxCapacity/CurrentCapacity as 0–100 percents.
    // Wear and mAh live on the AppleRaw* / NominalChargeCapacity keys.
    let max = int_key(text, "AppleRawMaxCapacity")
        .or_else(|| int_key(text, "NominalChargeCapacity"))
        .or_else(|| int_key(text, "MaxCapacity").filter(|&n| n > 100));
    let current_raw = int_key(text, "AppleRawCurrentCapacity");
    let current_pct = int_key(text, "CurrentCapacity").filter(|&n| n <= 100);
    let charging = bool_key(text, "IsCharging").unwrap_or(false);

    let max_capacity_pct = match (max, design) {
        (Some(max), Some(design)) if design > 0 => Some(((max as f32 / design as f32) * 100.0).min(100.0)),
        _ => None,
    };
    let percent = current_pct
        .map(|n| n as f32)
        .or_else(|| match (current_raw, max) {
            (Some(cur), Some(full)) if full > 0 => Some((cur as f32 / full as f32) * 100.0),
            _ => None,
        });

    let condition = condition_label(max_capacity_pct, text);

    BatteryStatus {
        present: true,
        percent,
        cycle_count,
        design_capacity: design,
        max_capacity: max,
        max_capacity_pct,
        condition,
        charging,
        drainers,
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
    top_level_value(text, key)?.parse().ok()
}

fn bool_key(text: &str, key: &str) -> Option<bool> {
    let value = top_level_value(text, key)?;
    Some(value.eq_ignore_ascii_case("Yes") || value.eq_ignore_ascii_case("true"))
}

/// Only `ioreg` properties at the AppleSmartBattery object, not nested dicts.
/// Nested `BatteryData` also contains DesignCapacity/MaxCapacity and the first
/// `=` on that line is the dict itself, which used to make health "Unknown".
fn top_level_value<'a>(text: &'a str, key: &str) -> Option<&'a str> {
    let prefix = format!("\"{key}\"");
    for line in text.lines() {
        let line = line.trim();
        if !line.starts_with(&prefix) {
            continue;
        }
        let rest = line.get(prefix.len()..)?.trim_start();
        if !rest.starts_with('=') {
            continue;
        }
        return Some(rest[1..].trim().trim_end_matches(','));
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"
+-o AppleSmartBattery  <class AppleSmartBattery>
      "BatteryData" = {"MaxCapacity"=100,"DesignCapacity"=6249,"CycleCount"=203}
      "CurrentCapacity" = 88
      "MaxCapacity" = 100
      "DesignCapacity" = 6249
      "CycleCount" = 203
      "IsCharging" = Yes
      "AppleRawMaxCapacity" = 5838
      "AppleRawCurrentCapacity" = 5080
      "NominalChargeCapacity" = 5990
"#;

    #[test]
    fn reads_top_level_raw_mah_not_nested_percents() {
        let status = parse_ioreg(SAMPLE, vec![]);
        assert!(status.present);
        assert_eq!(status.cycle_count, Some(203));
        assert_eq!(status.design_capacity, Some(6249));
        assert_eq!(status.max_capacity, Some(5838));
        assert_eq!(status.percent, Some(88.0));
        assert!(status.charging);
        let health = status.max_capacity_pct.unwrap();
        assert!((health - 93.4).abs() < 0.2);
        assert_eq!(status.condition, "Normal");
    }
}
