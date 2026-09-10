//! Discover local software projects by walking common developer folders.
//!
//! Depth is capped and well-known junk directories are skipped so a scan of
//! Desktop / Documents stays fast and never walks `node_modules`.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use walkdir::{DirEntry, WalkDir};

use crate::models::Project;
use crate::process_scanner::title_from_path;

const DEFAULT_ROOTS: &[&str] = &["Projects", "Developer", "Code", "Documents", "Desktop"];

const SKIP_DIRS: &[&str] = &[
    "node_modules",
    ".git",
    "target",
    "dist",
    "build",
    "venv",
    ".venv",
    "__pycache__",
    ".next",
    ".nuxt",
    "vendor",
    ".cache",
    ".turbo",
    "Library",
    "Applications",
    ".Trash",
];

const MARKERS: &[&str] = &[
    "package.json",
    "docker-compose.yml",
    "docker-compose.yaml",
    "compose.yml",
    "compose.yaml",
    "requirements.txt",
    "pyproject.toml",
    "Cargo.toml",
    "go.mod",
];

pub fn default_roots() -> Vec<PathBuf> {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("/"));
    DEFAULT_ROOTS
        .iter()
        .map(|name| home.join(name))
        .filter(|path| path.is_dir())
        .collect()
}

pub fn scan(roots: &[PathBuf]) -> Vec<Project> {
    let mut found = Vec::new();
    let mut seen = std::collections::HashSet::new();

    for root in roots {
        if !root.is_dir() {
            continue;
        }
        for entry in WalkDir::new(root)
            .max_depth(4)
            .into_iter()
            .filter_entry(is_allowed_dir)
            .filter_map(Result::ok)
        {
            if !entry.file_type().is_dir() {
                continue;
            }
            let path = entry.path();
            if !has_project_marker(path) {
                continue;
            }
            let key = path.to_string_lossy().to_string();
            if !seen.insert(key.clone()) {
                continue;
            }
            found.push(describe_project(path));
        }
    }

    found.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    found
}

fn is_allowed_dir(entry: &DirEntry) -> bool {
    if !entry.file_type().is_dir() {
        return true;
    }
    let name = entry.file_name().to_string_lossy();
    if name.starts_with('.') && name != "." {
        return false;
    }
    !SKIP_DIRS.contains(&name.as_ref())
}

fn has_project_marker(path: &Path) -> bool {
    MARKERS.iter().any(|marker| path.join(marker).is_file())
}

fn describe_project(path: &Path) -> Project {
    let (framework, language) = detect_stack(path);
    let name = package_name(path).unwrap_or_else(|| title_from_path(&path.to_string_lossy()));
    let last_modified = modified_iso(path);
    Project {
        id: 0,
        name,
        path: path.to_string_lossy().into_owned(),
        framework,
        language,
        git_branch: git_branch(path),
        last_modified,
        created_at: String::new(),
        is_running: false,
        git_dirty: 0,
        git_ahead: 0,
        git_behind: 0,
        git_has_remote: false,
    }
}

fn package_name(path: &Path) -> Option<String> {
    let raw = fs::read_to_string(path.join("package.json")).ok()?;
    let json: serde_json::Value = serde_json::from_str(&raw).ok()?;
    json.get("name")
        .and_then(|v| v.as_str())
        .map(|name| {
            name.rsplit('/').next().unwrap_or(name).to_string()
        })
        .map(|slug| title_from_path(&slug))
}

fn detect_stack(path: &Path) -> (Option<String>, Option<String>) {
    if path.join("package.json").is_file() {
        let raw = fs::read_to_string(path.join("package.json")).unwrap_or_default();
        let language = if path.join("tsconfig.json").is_file() || raw.contains("typescript") {
            Some("TypeScript".into())
        } else {
            Some("JavaScript".into())
        };
        return (js_framework(&raw), language);
    }
    if path.join("pyproject.toml").is_file() || path.join("requirements.txt").is_file() {
        let blob = read_joined(path, &["pyproject.toml", "requirements.txt", "manage.py"]);
        let framework = if blob.contains("fastapi") {
            Some("FastAPI".into())
        } else if blob.contains("django") || path.join("manage.py").is_file() {
            Some("Django".into())
        } else if blob.contains("flask") {
            Some("Flask".into())
        } else {
            Some("Python".into())
        };
        return (framework, Some("Python".into()));
    }
    if path.join("Cargo.toml").is_file() {
        return (Some("Rust".into()), Some("Rust".into()));
    }
    if path.join("go.mod").is_file() {
        return (Some("Go".into()), Some("Go".into()));
    }
    if path.join("docker-compose.yml").is_file()
        || path.join("docker-compose.yaml").is_file()
        || path.join("compose.yml").is_file()
    {
        return (Some("Docker Compose".into()), Some("Docker".into()));
    }
    (None, None)
}

fn js_framework(package_json: &str) -> Option<String> {
    let lower = package_json.to_lowercase();
    if lower.contains("\"next\"") {
        return Some("Next.js".into());
    }
    if lower.contains("@nestjs/core") {
        return Some("NestJS".into());
    }
    if lower.contains("@angular/core") {
        return Some("Angular".into());
    }
    if lower.contains("\"vue\"") || lower.contains("\"nuxt\"") {
        return Some("Vue".into());
    }
    if lower.contains("\"express\"") {
        return Some("Express".into());
    }
    if lower.contains("\"vite\"") {
        return Some("Vite".into());
    }
    if lower.contains("\"react\"") {
        return Some("React".into());
    }
    Some("JavaScript".into())
}

fn git_branch(path: &Path) -> Option<String> {
    let output = Command::new("git")
        .args(["-C", &path.to_string_lossy(), "rev-parse", "--abbrev-ref", "HEAD"])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let branch = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if branch.is_empty() {
        None
    } else {
        Some(branch)
    }
}

fn modified_iso(path: &Path) -> Option<String> {
    let modified = fs::metadata(path).ok()?.modified().ok()?;
    let datetime = chrono::DateTime::<chrono::Utc>::from(modified);
    Some(datetime.format("%Y-%m-%d").to_string())
}

fn read_joined(path: &Path, names: &[&str]) -> String {
    names
        .iter()
        .filter_map(|name| fs::read_to_string(path.join(name)).ok())
        .collect::<Vec<_>>()
        .join("\n")
        .to_lowercase()
}
