use std::path::Path;

use rusqlite::{params, Connection};

use crate::models::{DockerContainer, PortInfo, Project};

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
