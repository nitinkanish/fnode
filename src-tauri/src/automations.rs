//! Condition → action rules stored in SQLite.
//!
//! Actions never escalate privileges. `notify` becomes an in-app alert.
//! `offer_stop` lists stoppable localhost PIDs; the UI still confirms.

use std::collections::HashMap;
use std::time::Instant;

use rusqlite::Connection;

use crate::db;
use crate::models::{AutomationAlert, AutomationRule, LiveSnapshot, LocalhostApp};

pub fn evaluate(
    conn: &Connection,
    snapshot: &LiveSnapshot,
    holds: &mut HashMap<String, Instant>,
) -> Vec<AutomationAlert> {
    let Ok(rules) = db::list_automations(conn) else {
        return Vec::new();
    };
    let mut alerts = Vec::new();
    let mut active = Vec::new();
    for rule in rules.into_iter().filter(|rule| rule.enabled) {
        match rule.condition_type.as_str() {
            "cpu_pct" => {
                maybe_hold(
                    holds,
                    &mut active,
                    &mut alerts,
                    &rule,
                    snapshot.system.cpu_usage as f64 >= rule.threshold,
                    format!("CPU is at {:.0}% (rule ≥ {:.0}%).", snapshot.system.cpu_usage, rule.threshold),
                    Vec::new(),
                );
            }
            "memory_pct" => {
                let pct = if snapshot.system.memory_total == 0 {
                    0.0
                } else {
                    snapshot.system.memory_used as f64 / snapshot.system.memory_total as f64 * 100.0
                };
                maybe_hold(
                    holds,
                    &mut active,
                    &mut alerts,
                    &rule,
                    pct >= rule.threshold,
                    format!("RAM is at {pct:.0}% (rule ≥ {:.0}%).", rule.threshold),
                    Vec::new(),
                );
            }
            "idle_dev_server" => {
                for app in idle_servers(&snapshot.localhost_apps, rule.threshold) {
                    let key = format!("{}:{}", rule.id, app.pid);
                    let duration = std::cmp::max(rule.duration_secs, 60);
                    let pids = if app.can_stop { vec![app.pid] } else { Vec::new() };
                    let held = holds.entry(key.clone()).or_insert_with(Instant::now);
                    if held.elapsed().as_secs() >= duration {
                        active.push(key);
                        if rule.action_type == "offer_stop" && !pids.is_empty() {
                            alerts.push(alert(
                                &rule,
                                format!("{} on :{} looks idle.", app.name, app.port),
                                format!(
                                    "CPU {cpu:.1}% for {mins}+ min. Offer to stop PID {pid} — confirmation still required.",
                                    cpu = app.cpu,
                                    mins = duration / 60,
                                    pid = app.pid
                                ),
                                pids,
                            ));
                        } else {
                            alerts.push(alert(
                                &rule,
                                format!("{} on :{} is idle.", app.name, app.port),
                                format!("CPU {cpu:.1}% for {mins}+ min.", cpu = app.cpu, mins = duration / 60),
                                Vec::new(),
                            ));
                        }
                    } else {
                        active.push(key);
                    }
                }
            }
            _ => {}
        }
    }
    holds.retain(|key, _| active.iter().any(|keep| keep == key));
    alerts
}

fn maybe_hold(
    holds: &mut HashMap<String, Instant>,
    active: &mut Vec<String>,
    alerts: &mut Vec<AutomationAlert>,
    rule: &AutomationRule,
    matches: bool,
    body: String,
    pids: Vec<u32>,
) {
    let key = format!("rule:{}", rule.id);
    if !matches {
        return;
    }
    let held = holds.entry(key.clone()).or_insert_with(Instant::now);
    active.push(key);
    if held.elapsed().as_secs() < rule.duration_secs.max(20) {
        return;
    }
    alerts.push(alert(rule, rule.name.clone(), body, pids));
}

fn idle_servers(apps: &[LocalhostApp], cpu_max: f64) -> Vec<&LocalhostApp> {
    apps.iter()
        .filter(|app| app.cpu as f64 <= cpu_max && app.can_stop)
        .collect()
}

fn alert(rule: &AutomationRule, title: String, body: String, pids: Vec<u32>) -> AutomationAlert {
    AutomationAlert {
        id: format!("auto:{}:{title}", rule.id),
        severity: if rule.condition_type == "cpu_pct" { "warning".into() } else { "info".into() },
        title,
        body,
        action: if rule.action_type == "offer_stop" && !pids.is_empty() {
            Some("stop".into())
        } else {
            None
        },
        pids,
    }
}

pub fn validate_rule(rule: &AutomationRule) -> Result<(), String> {
    if rule.name.trim().is_empty() || rule.name.len() > 80 {
        return Err("Name must be 1–80 characters.".into());
    }
    let cond_ok = matches!(
        rule.condition_type.as_str(),
        "cpu_pct" | "memory_pct" | "idle_dev_server"
    );
    let action_ok = matches!(rule.action_type.as_str(), "notify" | "offer_stop");
    if !cond_ok || !action_ok {
        return Err("Unknown condition or action.".into());
    }
    if !(1.0..=100.0).contains(&rule.threshold) {
        return Err("Threshold must be between 1 and 100.".into());
    }
    if !(20..=86_400).contains(&rule.duration_secs) {
        return Err("Duration must be between 20 seconds and 24 hours.".into());
    }
    Ok(())
}
