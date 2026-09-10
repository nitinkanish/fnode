//! Local LLM/API cost estimates.
//!
//! Primary source: Cursor logs under the user's home Library folder.
//! Optional OpenAI / Anthropic keys (same SQLite pattern as the assistant)
//! are used only when the user enables cost tracking. Keys are never returned.

use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use rusqlite::Connection;

use crate::db;
use crate::models::UsageSummary;
use crate::paths;

const MAX_FILES: usize = 40;
const MAX_BYTES: u64 = 512 * 1024;

pub fn summary(conn: &Connection, enabled: bool) -> UsageSummary {
    if !enabled {
        return UsageSummary::disabled();
    }
    let now = chrono::Utc::now().timestamp();
    let day = now - 24 * 60 * 60;
    let month = now - 30 * 24 * 60 * 60;
    let (today_usd, today_tokens) = db::usage_totals(conn, day).unwrap_or((0.0, 0));
    let (month_usd, month_tokens) = db::usage_totals(conn, month).unwrap_or((0.0, 0));
    UsageSummary {
        enabled: true,
        today_usd,
        month_usd,
        today_tokens,
        month_tokens,
    }
}

pub fn scrape_cursor_logs(conn: &Connection) -> rusqlite::Result<u32> {
    let Some(root) = cursor_log_root() else {
        return Ok(0);
    };
    let mut inserted = 0u32;
    let cutoff = SystemTime::now()
        .checked_sub(std::time::Duration::from_secs(14 * 24 * 3600))
        .unwrap_or(SystemTime::UNIX_EPOCH);
    let mut files = Vec::new();
    collect_log_files(&root, 0, 6, cutoff, &mut files);
    for path in files {
        let Ok(text) = fs::read_to_string(&path) else {
            continue;
        };
        inserted += ingest_text(conn, "cursor-log", &text)?;
    }
    Ok(inserted)
}

pub async fn fetch_openai(key: &str) -> Vec<OpenAiCost> {
    if key.is_empty() || !key.starts_with("sk-") {
        return Vec::new();
    }
    let start = chrono::Utc::now().timestamp() - 7 * 24 * 3600;
    let Ok(client) = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
    else {
        return Vec::new();
    };
    let url = format!("https://api.openai.com/v1/organization/costs?start_time={start}&limit=15");
    let Ok(resp) = client
        .get(url)
        .bearer_auth(key)
        .header("OpenAI-Beta", "organization=v2")
        .send()
        .await
    else {
        return Vec::new();
    };
    if !resp.status().is_success() {
        return Vec::new();
    }
    let Ok(body) = resp.json::<serde_json::Value>().await else {
        return Vec::new();
    };
    let mut out = Vec::new();
    if let Some(rows) = body.get("data").and_then(|v| v.as_array()) {
        for row in rows {
            let ts = row
                .get("start_time")
                .and_then(|v| v.as_i64())
                .unwrap_or(chrono::Utc::now().timestamp());
            let usd = row
                .get("amount")
                .and_then(|a| a.get("value"))
                .and_then(|v| v.as_f64())
                .unwrap_or(0.0);
            if usd > 0.0 {
                out.push(OpenAiCost { ts, usd });
            }
        }
    }
    out
}

pub struct OpenAiCost {
    pub ts: i64,
    pub usd: f64,
}

pub fn store_openai_costs(conn: &Connection, rows: &[OpenAiCost]) -> rusqlite::Result<u32> {
    let mut n = 0u32;
    for row in rows {
        let id = format!("openai-cost-{}-{}", row.ts, row.usd);
        if db::insert_usage(conn, &id, row.ts, "openai", None, 0, 0, row.usd, "openai-api")? {
            n += 1;
        }
    }
    Ok(n)
}

fn cursor_log_root() -> Option<PathBuf> {
    let home = paths::home_dir();
    let candidate = home.join("Library/Application Support/Cursor/logs");
    if candidate.is_dir() && paths::is_under(&candidate, &home) {
        Some(candidate)
    } else {
        None
    }
}

fn ingest_text(conn: &Connection, source: &str, text: &str) -> rusqlite::Result<u32> {
    let mut inserted = 0u32;

    for (index, line) in text.lines().enumerate() {
        let input = digits_after(
            line,
            &["prompt_tokens", "prompt tokens", "prompttokens", "input_tokens", "input tokens", "inputtokens"],
        );
        let output = digits_after(
            line,
            &[
                "completion_tokens",
                "completion tokens",
                "completiontokens",
                "output_tokens",
                "output tokens",
                "outputtokens",
            ],
        );
        if input == 0 && output == 0 {
            continue;
        }
        let model = json_string_field(line, "model").or_else(|| json_string_field(line, "modelname"));
        let usd = estimate_usd(model.as_deref(), input, output);
        let mut hasher = DefaultHasher::new();
        source.hash(&mut hasher);
        index.hash(&mut hasher);
        line.hash(&mut hasher);
        let id = format!("{:x}", hasher.finish());
        let ts = chrono::Utc::now().timestamp();
        if db::insert_usage(
            conn,
            &id,
            ts,
            provider_for(model.as_deref()),
            model.as_deref(),
            input,
            output,
            usd,
            source,
        )? {
            inserted += 1;
        }
    }
    Ok(inserted)
}

fn collect_log_files(dir: &Path, depth: usize, max_depth: usize, cutoff: SystemTime, out: &mut Vec<PathBuf>) {
    if depth > max_depth || out.len() >= MAX_FILES {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        if out.len() >= MAX_FILES {
            return;
        }
        let path = entry.path();
        let Ok(meta) = entry.metadata() else {
            continue;
        };
        if meta.is_dir() {
            collect_log_files(&path, depth + 1, max_depth, cutoff, out);
            continue;
        }
        if !meta.is_file() {
            continue;
        }
        let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
        if !(name.ends_with(".log") || name.ends_with(".txt") || name.ends_with(".json")) {
            continue;
        }
        if meta.len() == 0 || meta.len() > MAX_BYTES {
            continue;
        }
        if meta.modified().ok().is_some_and(|m| m < cutoff) {
            continue;
        }
        out.push(path);
    }
}

fn digits_after(line: &str, keys: &[&str]) -> i64 {
    let lower = line.to_ascii_lowercase();
    let bytes = lower.as_bytes();
    for key in keys {
        let mut from = 0;
        while let Some(rel) = lower[from..].find(key) {
            let mut i = from + rel + key.len();
            while i < bytes.len() && matches!(bytes[i], b'"' | b'\'' | b':' | b'=' | b' ' | b'\t') {
                i += 1;
            }
            let start = i;
            while i < bytes.len() && bytes[i].is_ascii_digit() {
                i += 1;
            }
            let len = i - start;
            if (2..=9).contains(&len) {
                if let Ok(n) = lower[start..i].parse() {
                    return n;
                }
            }
            from += rel + 1;
        }
    }
    0
}

fn json_string_field(line: &str, field: &str) -> Option<String> {
    let lower = line.to_ascii_lowercase();
    let mut needle = String::with_capacity(field.len() + 2);
    needle.push('"');
    needle.push_str(field);
    needle.push('"');
    let mut from = 0;
    while let Some(rel) = lower[from..].find(&needle) {
        let after = from + rel + needle.len();
        let rest = line.get(after..)?;
        let rest = rest.trim_start().strip_prefix(':')?.trim_start().strip_prefix('"')?;
        let end = rest.find('"')?;
        if (2..=80).contains(&end) {
            return Some(rest[..end].to_string());
        }
        from = after;
    }
    None
}

fn provider_for(model: Option<&str>) -> &'static str {
    let Some(model) = model else {
        return "cursor";
    };
    let lower = model.to_ascii_lowercase();
    if lower.contains("claude") || lower.contains("anthropic") {
        "anthropic"
    } else if lower.contains("gpt") || lower.contains("openai") || lower.contains("o1") || lower.contains("o3") {
        "openai"
    } else {
        "cursor"
    }
}

fn estimate_usd(model: Option<&str>, input: i64, output: i64) -> f64 {
    let (in_rate, out_rate) = rates(model);
    (input as f64 / 1_000_000.0) * in_rate + (output as f64 / 1_000_000.0) * out_rate
}

fn rates(model: Option<&str>) -> (f64, f64) {
    let lower = model.unwrap_or("").to_ascii_lowercase();
    if lower.contains("mini") || lower.contains("haiku") {
        (0.25, 1.25)
    } else if lower.contains("opus") {
        (15.0, 75.0)
    } else if lower.contains("sonnet") || lower.contains("claude") {
        (3.0, 15.0)
    } else if lower.contains("gpt-4o") && !lower.contains("mini") {
        (2.5, 10.0)
    } else {
        (3.0, 12.0)
    }
}

