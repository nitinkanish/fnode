//! User-owned cache inspection and cleanup, with live OS progress.
//!
//! Only known folders under the home directory can be listed or deleted.
//! System paths (`/System`, `/Library`, `/var`) are never accepted.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter};
use walkdir::WalkDir;

use crate::models::{CacheClearResult, CacheEntry, CacheGuide, CacheProgress, CacheSyscall};
use crate::paths;

struct Spec {
    id: &'static str,
    label: &'static str,
    description: &'static str,
    after_clear: &'static str,
    rel: &'static str,
}

const SPECS: &[Spec] = &[
    Spec {
        id: "user-caches",
        label: "User app caches",
        description: "Contents of ~/Library/Caches. macOS apps store disposable data here.",
        after_clear: "Apps recreate files they need. Nested Homebrew/pip/Yarn caches inside this folder are also emptied.",
        rel: "Library/Caches",
    },
    Spec {
        id: "homebrew",
        label: "Homebrew downloads",
        description: "Cached Homebrew bottles and source downloads.",
        after_clear: "The next brew install/upgrade re-downloads packages.",
        rel: "Library/Caches/Homebrew",
    },
    Spec {
        id: "pip",
        label: "pip packages",
        description: "Python pip HTTP wheel cache.",
        after_clear: "pip will fetch wheels again on the next install.",
        rel: "Library/Caches/pip",
    },
    Spec {
        id: "yarn",
        label: "Yarn cache",
        description: "Yarn package cache.",
        after_clear: "yarn install will refill the cache.",
        rel: "Library/Caches/Yarn",
    },
    Spec {
        id: "npm",
        label: "npm cache",
        description: "npm content-addressable cache (~/.npm/_cacache).",
        after_clear: "npm install will re-populate _cacache.",
        rel: ".npm/_cacache",
    },
    Spec {
        id: "cocoapods",
        label: "CocoaPods cache",
        description: "CocoaPods download cache.",
        after_clear: "pod install will download specs and archives again.",
        rel: "Library/Caches/CocoaPods",
    },
    Spec {
        id: "gradle",
        label: "Gradle cache",
        description: "Gradle dependency and build caches.",
        after_clear: "The next Gradle build re-downloads artifacts and will be slower.",
        rel: ".gradle/caches",
    },
    Spec {
        id: "cargo-registry",
        label: "Cargo registry src",
        description: "Unpacked crate sources from crates.io.",
        after_clear: "cargo build fetches and unpacks crates again. The git db is left alone.",
        rel: ".cargo/registry/src",
    },
    Spec {
        id: "xcode-derived",
        label: "Xcode DerivedData",
        description: "Xcode build intermediates and indexes.",
        after_clear: "The next Xcode/xcodebuild will be a full rebuild.",
        rel: "Library/Developer/Xcode/DerivedData",
    },
];

const EVENT: &str = "cache-progress";
const EMIT_EVERY: Duration = Duration::from_millis(70);

pub fn guide() -> CacheGuide {
    CacheGuide {
        title: "User cache cleaner".into(),
        summary: "FNode empties known disposable folders inside your home directory. It talks to macOS through ordinary file-system calls (stat, realpath, readdir, unlink, rmdir). It never runs sudo, never touches APFS snapshots, and never deletes /System, /Library, or /var.".into(),
        does: vec![
            "Resolve each cache to a real path (realpath / canonicalize).".into(),
            "Confirm the path still lives under your home directory.".into(),
            "Skip symbolic links so a cache folder cannot point at a system tree.".into(),
            "Read directory entries (readdir) and delete files (unlink) then empty folders (rmdir).".into(),
            "Leave the cache folder itself in place so the app can write into it again.".into(),
        ],
        never: vec![
            "Does not delete macOS system caches in /Library/Caches or /private/var/folders.".into(),
            "Does not purge RAM, swap, or purgeable storage.".into(),
            "Does not run rm -rf on arbitrary paths — only the listed categories.".into(),
            "Does not follow symlinks out of your home directory.".into(),
            "Does not require administrator privileges.".into(),
        ],
        syscalls: vec![
            CacheSyscall {
                name: "lstat".into(),
                purpose: "Inspect the path without following a symlink.".into(),
            },
            CacheSyscall {
                name: "realpath".into(),
                purpose: "Resolve . and .. and confirm the folder is still under $HOME.".into(),
            },
            CacheSyscall {
                name: "stat".into(),
                purpose: "Read file size while scanning so the UI can show bytes.".into(),
            },
            CacheSyscall {
                name: "readdir".into(),
                purpose: "List children of a cache folder before deleting them.".into(),
            },
            CacheSyscall {
                name: "unlink".into(),
                purpose: "Remove a regular file from disk.".into(),
            },
            CacheSyscall {
                name: "rmdir".into(),
                purpose: "Remove an empty directory after its contents are gone.".into(),
            },
        ],
        categories: SPECS
            .iter()
            .map(|spec| unscanned(spec, paths::home_dir().join(spec.rel)))
            .collect(),
    }
}

pub fn inspect(app: &AppHandle) -> Vec<CacheEntry> {
    let mut sink = ProgressSink::new(app, "scan");
    sink.phase(
        "resolve",
        "stat",
        &paths::home_dir(),
        "Reading $HOME and the known cache locations.",
        true,
    );
    let home = paths::home_dir();
    let result: Vec<CacheEntry> = SPECS
        .iter()
        .map(|spec| {
            let raw = home.join(spec.rel);
            sink.phase(
                "enumerate",
                "stat",
                &raw,
                format!("Checking {}", spec.label),
                true,
            );
            if !raw.exists() {
                sink.phase(
                    "skip",
                    "stat",
                    &raw,
                    format!("{} is not present.", spec.label),
                    true,
                );
                return unscanned(spec, raw);
            }
            let Ok(resolved) = guard_cache_dir(&raw) else {
                sink.phase(
                    "skip",
                    "realpath",
                    &raw,
                    format!("Skipped {} — path is outside the home guard.", spec.label),
                    true,
                );
                return unscanned(spec, raw);
            };
            sink.phase(
                "guard",
                "realpath",
                &resolved,
                "Path is inside your home directory. Counting files…",
                true,
            );
            let (bytes, files) = dir_size(&resolved, &mut sink);
            CacheEntry {
                id: spec.id.into(),
                label: spec.label.into(),
                description: spec.description.into(),
                after_clear: spec.after_clear.into(),
                path: resolved.display().to_string(),
                bytes,
                files,
                exists: true,
                scanned: true,
            }
        })
        .collect();
    sink.done(
        &home,
        format!("Scan finished. {} cache locations checked.", result.len()),
        result.iter().map(|e| e.bytes).sum(),
        result.iter().map(|e| e.files).sum(),
    );
    result
}

pub fn clear(app: &AppHandle, id: &str) -> Result<CacheClearResult, String> {
    let mut sink = ProgressSink::new(app, "clear");
    let spec = SPECS
        .iter()
        .find(|spec| spec.id == id)
        .ok_or_else(|| "Unknown cache category.".to_string())?;
    let raw = paths::home_dir().join(spec.rel);
    sink.phase(
        "resolve",
        "stat",
        &raw,
        format!("Looking up {} at {}", spec.label, raw.display()),
        true,
    );
    let resolved = guard_cache_dir(&raw)?;
    sink.phase(
        "guard",
        "realpath",
        &resolved,
        "Canonical path is under your home directory. Starting deletes.",
        true,
    );
    let mut stats = ClearStats::default();
    wipe_contents(&resolved, &resolved, &mut stats, &mut sink)?;
    let result = CacheClearResult {
        id: spec.id.into(),
        label: spec.label.into(),
        path: resolved.display().to_string(),
        bytes: stats.bytes,
        files: stats.files,
        dirs: stats.dirs,
        skipped: stats.skipped,
    };
    sink.done(
        &resolved,
        format!(
            "Finished. Removed {} files and {} folders ({}) from {}.",
            result.files,
            result.dirs,
            display_bytes(result.bytes),
            spec.label
        ),
        result.bytes,
        result.files,
    );
    Ok(result)
}

fn unscanned(spec: &Spec, path: PathBuf) -> CacheEntry {
    let exists = path.exists();
    CacheEntry {
        id: spec.id.into(),
        label: spec.label.into(),
        description: spec.description.into(),
        after_clear: spec.after_clear.into(),
        path: path.display().to_string(),
        bytes: 0,
        files: 0,
        exists,
        scanned: false,
    }
}

fn guard_cache_dir(path: &Path) -> Result<PathBuf, String> {
    if !path.exists() {
        return Err("That cache folder is not present.".into());
    }
    let resolved = path
        .canonicalize()
        .map_err(|_| "Could not resolve that cache folder.".to_string())?;
    if !resolved.is_dir() {
        return Err("That cache path is not a folder.".into());
    }
    let home = paths::home_dir();
    let home = home.canonicalize().unwrap_or(home);
    if !paths::is_under(&resolved, &home) {
        return Err("Refusing to touch a folder outside your home directory.".into());
    }
    let forbidden = ["/System", "/usr", "/bin", "/sbin", "/var", "/private", "/Library"];
    let text = resolved.to_string_lossy();
    if forbidden.iter().any(|prefix| text.starts_with(prefix)) && !text.contains("/Users/") {
        return Err("Refusing to touch a system folder.".into());
    }
    Ok(resolved)
}

fn dir_size(path: &Path, sink: &mut ProgressSink) -> (u64, u64) {
    let mut bytes = 0u64;
    let mut files = 0u64;
    for entry in WalkDir::new(path).max_depth(12).into_iter().filter_map(|e| e.ok()) {
        if !entry.file_type().is_file() {
            continue;
        }
        let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
        bytes = bytes.saturating_add(size);
        files += 1;
        sink.tick(
            "enumerate",
            "stat",
            entry.path(),
            format!("stat {} (+{})", entry.path().display(), display_bytes(size)),
            bytes,
            files,
            0,
        );
    }
    (bytes, files)
}

#[derive(Default)]
struct ClearStats {
    bytes: u64,
    files: u64,
    dirs: u64,
    skipped: u64,
}

fn wipe_contents(
    root: &Path,
    dir: &Path,
    stats: &mut ClearStats,
    sink: &mut ProgressSink,
) -> Result<(), String> {
    sink.tick(
        "enumerate",
        "readdir",
        dir,
        format!("readdir {}", dir.display()),
        stats.bytes,
        stats.files,
        stats.skipped,
    );
    let children = fs::read_dir(dir).map_err(|e| e.to_string())?;
    let home = paths::home_dir()
        .canonicalize()
        .unwrap_or_else(|_| paths::home_dir());
    for child in children {
        let child = child.map_err(|e| e.to_string())?;
        wipe_path(root, &child.path(), &home, stats, sink)?;
    }
    Ok(())
}

fn wipe_path(
    root: &Path,
    path: &Path,
    home: &Path,
    stats: &mut ClearStats,
    sink: &mut ProgressSink,
) -> Result<(), String> {
    let meta = match path.symlink_metadata() {
        Ok(meta) => meta,
        Err(_) => {
            stats.skipped += 1;
            return Ok(());
        }
    };
    sink.tick(
        "inspect",
        "lstat",
        path,
        format!("lstat {}", path.display()),
        stats.bytes,
        stats.files,
        stats.skipped,
    );
    if meta.file_type().is_symlink() {
        stats.skipped += 1;
        sink.tick(
            "skip",
            "lstat",
            path,
            format!("skip symlink {}", path.display()),
            stats.bytes,
            stats.files,
            stats.skipped,
        );
        return Ok(());
    }
    let Ok(resolved) = path.canonicalize() else {
        stats.skipped += 1;
        return Ok(());
    };
    sink.tick(
        "guard",
        "realpath",
        &resolved,
        format!("realpath {}", resolved.display()),
        stats.bytes,
        stats.files,
        stats.skipped,
    );
    if !paths::is_under(&resolved, home) || resolved == *home {
        stats.skipped += 1;
        sink.tick(
            "skip",
            "realpath",
            &resolved,
            "Refusing path outside home.",
            stats.bytes,
            stats.files,
            stats.skipped,
        );
        return Ok(());
    }
    if resolved.is_dir() {
        wipe_contents(root, &resolved, stats, sink)?;
        if resolved != root {
            match fs::remove_dir(&resolved) {
                Ok(()) => {
                    stats.dirs += 1;
                    sink.tick(
                        "delete",
                        "rmdir",
                        &resolved,
                        format!("rmdir {}", resolved.display()),
                        stats.bytes,
                        stats.files,
                        stats.skipped,
                    );
                }
                Err(error) => {
                    stats.skipped += 1;
                    sink.tick(
                        "skip",
                        "rmdir",
                        &resolved,
                        format!("rmdir skipped {}: {error}", resolved.display()),
                        stats.bytes,
                        stats.files,
                        stats.skipped,
                    );
                }
            }
        }
    } else {
        let size = meta.len();
        match fs::remove_file(&resolved) {
            Ok(()) => {
                stats.bytes = stats.bytes.saturating_add(size);
                stats.files += 1;
                sink.tick(
                    "delete",
                    "unlink",
                    &resolved,
                    format!("unlink {} ({})", resolved.display(), display_bytes(size)),
                    stats.bytes,
                    stats.files,
                    stats.skipped,
                );
            }
            Err(error) => {
                stats.skipped += 1;
                sink.tick(
                    "skip",
                    "unlink",
                    &resolved,
                    format!("unlink skipped {}: {error}", resolved.display()),
                    stats.bytes,
                    stats.files,
                    stats.skipped,
                );
            }
        }
    }
    Ok(())
}

struct ProgressSink<'a> {
    app: &'a AppHandle,
    job: &'static str,
    last: Instant,
    pending: u32,
}

impl<'a> ProgressSink<'a> {
    fn new(app: &'a AppHandle, job: &'static str) -> Self {
        Self {
            app,
            job,
            last: Instant::now() - EMIT_EVERY,
            pending: 0,
        }
    }

    fn phase(&mut self, phase: &str, syscall: &str, path: &Path, message: impl Into<String>, force: bool) {
        self.emit(CacheProgress {
            job: self.job.into(),
            phase: phase.into(),
            syscall: syscall.into(),
            path: path.display().to_string(),
            message: message.into(),
            bytes: 0,
            files: 0,
            skipped: 0,
            done: false,
        }, force);
    }

    fn tick(
        &mut self,
        phase: &str,
        syscall: &str,
        path: &Path,
        message: impl Into<String>,
        bytes: u64,
        files: u64,
        skipped: u64,
    ) {
        self.emit(CacheProgress {
            job: self.job.into(),
            phase: phase.into(),
            syscall: syscall.into(),
            path: path.display().to_string(),
            message: message.into(),
            bytes,
            files,
            skipped,
            done: false,
        }, false);
    }

    fn done(&mut self, path: &Path, message: String, bytes: u64, files: u64) {
        self.emit(CacheProgress {
            job: self.job.into(),
            phase: "done".into(),
            syscall: "ok".into(),
            path: path.display().to_string(),
            message,
            bytes,
            files,
            skipped: 0,
            done: true,
        }, true);
    }

    fn emit(&mut self, event: CacheProgress, force: bool) {
        self.pending += 1;
        if !force && self.last.elapsed() < EMIT_EVERY && self.pending < 24 {
            return;
        }
        self.pending = 0;
        self.last = Instant::now();
        let _ = self.app.emit(EVENT, event);
    }
}

fn display_bytes(bytes: u64) -> String {
    if bytes < 1024 {
        return format!("{bytes} B");
    }
    let units = ["KB", "MB", "GB", "TB"];
    let mut value = bytes as f64 / 1024.0;
    let mut unit = 0;
    while value >= 1024.0 && unit < units.len() - 1 {
        value /= 1024.0;
        unit += 1;
    }
    if value >= 10.0 {
        format!("{value:.0} {}", units[unit])
    } else {
        format!("{value:.1} {}", units[unit])
    }
}
