//! Path and URL guards for process control.
//!
//! Folder/terminal/Cursor actions only accept existing directories the
//! current user owns (home, or FNode's own data dir). URLs are limited
//! to loopback http(s) so the renderer cannot drive `open` at the public web.

use std::path::{Path, PathBuf};

use url::Url;

pub fn home_dir() -> PathBuf {
    dirs::home_dir().unwrap_or_else(|| PathBuf::from("/"))
}

pub fn is_under(child: &Path, parent: &Path) -> bool {
    child == parent || child.starts_with(parent)
}

/// Canonicalize `path` and require it to live under the user's home or `extra`.
pub fn validate_existing_dir(path: &str, extra: Option<&Path>) -> Result<PathBuf, String> {
    if path.is_empty() || path.len() > 1024 {
        return Err("Path is empty or too long.".into());
    }
    if path.contains('\0') || path.contains('\n') {
        return Err("Path contains invalid characters.".into());
    }
    let raw = PathBuf::from(path);
    let resolved = raw.canonicalize().map_err(|_| "That folder no longer exists.".to_string())?;
    if !resolved.is_dir() {
        return Err("That path is not a folder.".into());
    }
    let home = home_dir();
    let allowed = extra.map(|p| is_under(&resolved, p)).unwrap_or(false);
    if is_under(&resolved, &home) || allowed {
        Ok(resolved)
    } else {
        Err("Refusing to open a folder outside your home directory.".into())
    }
}

pub fn validate_loopback_url(url: &str) -> Result<String, String> {
    let mut normalized = Url::parse(url).map_err(|_| "Invalid URL.".to_string())?;
    if normalized.scheme() != "http" && normalized.scheme() != "https" {
        return Err("Only http(s) URLs can be opened.".into());
    }
    let host = normalized.host_str().unwrap_or("").to_string();
    let loopback = matches!(host.as_str(), "localhost" | "127.0.0.1" | "::1" | "[::1]");
    if !loopback {
        return Err("FNode only opens loopback URLs (localhost).".into());
    }
    if host == "::1" || host == "[::1]" {
        let _ = normalized.set_host(Some("127.0.0.1"));
    }
    Ok(normalized.to_string())
}

pub fn docker_name_ok(name: &str) -> bool {
    let mut chars = name.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    first.is_ascii_alphanumeric()
        && name.len() <= 128
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | '.'))
}

pub fn is_system_executable(exe: &Path) -> bool {
    const PREFIXES: &[&str] = &["/System/", "/usr/sbin/", "/sbin/", "/usr/libexec/"];
    let text = exe.to_string_lossy();
    PREFIXES.iter().any(|prefix| text.starts_with(prefix))
}
