use std::path::Path;

use rusqlite::{params, Connection};

use crate::models::{AutomationRule, DockerContainer, PortInfo, Project};

pub const DB_FILENAME: &str = "fnode.db";

pub fn init(path: &Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(path)?;
    conn.execute_batch(
        r#"
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            path TEXT NOT NULL UNIQUE,
            framework TEXT,
            language TEXT,
            git_branch TEXT,
            last_modified TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS processes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pid INTEGER NOT NULL,
            name TEXT,
            command TEXT,
            path TEXT,
            cpu REAL,
            memory INTEGER,
            started_at TEXT,
            observed_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS ports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            port INTEGER NOT NULL,
            protocol TEXT,
            pid INTEGER,
            service TEXT,
            observed_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS containers (
            id TEXT PRIMARY KEY,
            name TEXT,
            image TEXT,
            status TEXT,
            ports TEXT,
            observed_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS ai_models (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            provider TEXT,
            model_name TEXT,
            size TEXT,
            endpoint TEXT,
            observed_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS metrics_history (
            ts INTEGER PRIMARY KEY,
            cpu REAL NOT NULL,
            memory REAL NOT NULL,
            swap REAL NOT NULL,
            disk REAL NOT NULL,
            rx REAL NOT NULL,
            tx REAL NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_metrics_history_ts ON metrics_history(ts);

        CREATE TABLE IF NOT EXISTS usage_events (
            id TEXT PRIMARY KEY,
            ts INTEGER NOT NULL,
            provider TEXT NOT NULL,
            model TEXT,
            input_tokens INTEGER NOT NULL DEFAULT 0,
            output_tokens INTEGER NOT NULL DEFAULT 0,
            usd REAL NOT NULL DEFAULT 0,
            source TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_usage_events_ts ON usage_events(ts);

        CREATE TABLE IF NOT EXISTS automations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            enabled INTEGER NOT NULL DEFAULT 1,
            name TEXT NOT NULL,
            condition_type TEXT NOT NULL,
            threshold REAL NOT NULL,
            duration_secs INTEGER NOT NULL,
            action_type TEXT NOT NULL
        );
        "#,
    )?;
    Ok(conn)
}

pub fn upsert_projects(conn: &Connection, projects: &[Project]) -> rusqlite::Result<()> {
    let mut stmt = conn.prepare(
        r#"
        INSERT INTO projects (name, path, framework, language, git_branch, last_modified)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6)
        ON CONFLICT(path) DO UPDATE SET
            name = excluded.name,
            framework = excluded.framework,
            language = excluded.language,
            git_branch = excluded.git_branch,
            last_modified = excluded.last_modified
        "#,
    )?;
    for project in projects {
        stmt.execute(params![
            project.name,
            project.path,
            project.framework,
            project.language,
            project.git_branch,
            project.last_modified,
        ])?;
    }
    Ok(())
}

pub fn list_projects(conn: &Connection) -> rusqlite::Result<Vec<Project>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT id, name, path, framework, language, git_branch, last_modified, created_at
        FROM projects
        ORDER BY last_modified DESC, name ASC
        "#,
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(Project {
            id: row.get(0)?,
            name: row.get(1)?,
            path: row.get(2)?,
            framework: row.get(3)?,
            language: row.get(4)?,
            git_branch: row.get(5)?,
            last_modified: row.get(6)?,
            created_at: row.get(7)?,
            is_running: false,
            git_dirty: 0,
            git_ahead: 0,
            git_behind: 0,
            git_has_remote: false,
        })
    })?;
    rows.collect()
}

pub fn count_projects(conn: &Connection) -> rusqlite::Result<i64> {
    conn.query_row("SELECT COUNT(*) FROM projects", [], |row| row.get(0))
}

pub fn replace_ports(conn: &Connection, ports: &[PortInfo]) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM ports", [])?;
    let mut stmt = conn.prepare(
        "INSERT INTO ports (port, protocol, pid, service) VALUES (?1, ?2, ?3, ?4)",
    )?;
    for port in ports {
        stmt.execute(params![
            port.port as i64,
            port.protocol,
            port.pid as i64,
            port.display_name,
        ])?;
    }
    Ok(())
}

pub fn replace_containers(conn: &Connection, containers: &[DockerContainer]) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM containers", [])?;
    let mut stmt = conn.prepare(
        "INSERT INTO containers (id, name, image, status, ports) VALUES (?1, ?2, ?3, ?4, ?5)",
    )?;
    for container in containers {
        stmt.execute(params![
            container.id,
            container.name,
            container.image,
            container.status,
            container.ports.join(", "),
        ])?;
    }
    Ok(())
}

pub fn replace_ai_models(
    conn: &Connection,
    rows: &[(String, String, Option<String>, Option<String>)],
) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM ai_models", [])?;
    let mut stmt = conn.prepare(
        "INSERT INTO ai_models (provider, model_name, size, endpoint) VALUES (?1, ?2, ?3, ?4)",
    )?;
    for (provider, name, size, endpoint) in rows {
        stmt.execute(params![provider, name, size, endpoint])?;
    }
    Ok(())
}

pub fn snapshot_processes(
    conn: &Connection,
    rows: &[(i64, String, String, Option<String>, f32, i64, Option<String>)],
) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM processes", [])?;
    let mut stmt = conn.prepare(
        "INSERT INTO processes (pid, name, command, path, cpu, memory, started_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
    )?;
    for (pid, name, command, path, cpu, memory, started_at) in rows {
        stmt.execute(params![pid, name, command, path, cpu, memory, started_at])?;
    }
    Ok(())
}

pub fn get_setting(conn: &Connection, key: &str) -> rusqlite::Result<Option<String>> {
    let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = ?1")?;
    let mut rows = stmt.query(params![key])?;
    match rows.next()? {
        Some(row) => Ok(Some(row.get(0)?)),
        None => Ok(None),
    }
}

pub fn set_setting(conn: &Connection, key: &str, value: &str) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

pub fn delete_setting(conn: &Connection, key: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM settings WHERE key = ?1", params![key])?;
    Ok(())
}

pub fn insert_metrics(
    conn: &Connection,
    ts: i64,
    cpu: f32,
    memory: f32,
    swap: f32,
    disk: f32,
    rx: f64,
    tx: f64,
) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT OR REPLACE INTO metrics_history (ts, cpu, memory, swap, disk, rx, tx)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![ts, cpu, memory, swap, disk, rx, tx],
    )?;
    conn.execute(
        "DELETE FROM metrics_history WHERE ts < ?1",
        params![ts - 30 * 24 * 60 * 60],
    )?;
    Ok(())
}

pub fn list_metrics(conn: &Connection, since_ts: i64, bucket_secs: i64) -> rusqlite::Result<Vec<crate::models::MetricsPoint>> {
    let bucket = bucket_secs.max(20);
    let mut stmt = conn.prepare(
        r#"
        SELECT
            (ts / ?2) * ?2 AS bucket,
            AVG(cpu), AVG(memory), AVG(swap), AVG(disk), AVG(rx), AVG(tx)
        FROM metrics_history
        WHERE ts >= ?1
        GROUP BY bucket
        ORDER BY bucket ASC
        "#,
    )?;
    let rows = stmt.query_map(params![since_ts, bucket], |row| {
        Ok(crate::models::MetricsPoint {
            ts: row.get(0)?,
            cpu: row.get(1)?,
            memory: row.get(2)?,
            swap: row.get(3)?,
            disk: row.get(4)?,
            rx: row.get(5)?,
            tx: row.get(6)?,
        })
    })?;
    rows.collect()
}

pub fn insert_usage(
    conn: &Connection,
    id: &str,
    ts: i64,
    provider: &str,
    model: Option<&str>,
    input_tokens: i64,
    output_tokens: i64,
    usd: f64,
    source: &str,
) -> rusqlite::Result<bool> {
    let changed = conn.execute(
        r#"
        INSERT OR IGNORE INTO usage_events (id, ts, provider, model, input_tokens, output_tokens, usd, source)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
        "#,
        params![id, ts, provider, model, input_tokens, output_tokens, usd, source],
    )?;
    Ok(changed > 0)
}

pub fn usage_totals(conn: &Connection, since_ts: i64) -> rusqlite::Result<(f64, i64)> {
    conn.query_row(
        "SELECT COALESCE(SUM(usd), 0), COALESCE(SUM(input_tokens + output_tokens), 0)
         FROM usage_events WHERE ts >= ?1",
        params![since_ts],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )
}

pub fn list_automations(conn: &Connection) -> rusqlite::Result<Vec<AutomationRule>> {
    let mut stmt = conn.prepare(
        "SELECT id, enabled, name, condition_type, threshold, duration_secs, action_type FROM automations ORDER BY id",
    )?;
    let rows = stmt.query_map([], |row| {
        let enabled: i64 = row.get(1)?;
        Ok(AutomationRule {
            id: row.get(0)?,
            enabled: enabled != 0,
            name: row.get(2)?,
            condition_type: row.get(3)?,
            threshold: row.get(4)?,
            duration_secs: {
                let v: i64 = row.get(5)?;
                v.max(0) as u64
            },
            action_type: row.get(6)?,
        })
    })?;
    rows.collect()
}

pub fn insert_automation(conn: &Connection, rule: &AutomationRule) -> rusqlite::Result<i64> {
    conn.execute(
        "INSERT INTO automations (enabled, name, condition_type, threshold, duration_secs, action_type)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            if rule.enabled { 1 } else { 0 },
            rule.name,
            rule.condition_type,
            rule.threshold,
            rule.duration_secs as i64,
            rule.action_type,
        ],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn update_automation(conn: &Connection, rule: &AutomationRule) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE automations SET enabled = ?1, name = ?2, condition_type = ?3, threshold = ?4, duration_secs = ?5, action_type = ?6 WHERE id = ?7",
        params![
            if rule.enabled { 1 } else { 0 },
            rule.name,
            rule.condition_type,
            rule.threshold,
            rule.duration_secs as i64,
            rule.action_type,
            rule.id,
        ],
    )?;
    Ok(())
}

pub fn delete_automation(conn: &Connection, id: i64) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM automations WHERE id = ?1", params![id])?;
    Ok(())
}
