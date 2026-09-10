//! Homebrew outdated formulae/casks. Binary path is fixed; package names are
//! allowlisted against the last `brew outdated` result — no shell interpolation.

use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Deserialize;

use crate::models::{BrewOutdated, BrewPackage};

const BREW_PATHS: &[&str] = &[
    "/opt/homebrew/bin/brew",
    "/usr/local/bin/brew",
];

static CACHE: Mutex<Option<Cached>> = Mutex::new(None);
static ALLOWED: Mutex<Vec<(String, bool)>> = Mutex::new(Vec::new());

struct Cached {
    at: Instant,
    value: BrewOutdated,
}

const CACHE_TTL: Duration = Duration::from_secs(60);

pub fn brew_bin() -> Option<PathBuf> {
    BREW_PATHS.iter().map(PathBuf::from).find(|path| path.is_file())
}

pub fn outdated(force: bool) -> BrewOutdated {
    if !force {
        if let Ok(guard) = CACHE.lock() {
            if let Some(cached) = guard.as_ref() {
                if cached.at.elapsed() < CACHE_TTL {
                    return cached.value.clone();
                }
            }
        }
    }

    let Some(bin) = brew_bin() else {
        return BrewOutdated {
            available: false,
            error: Some("Homebrew is not installed in /opt/homebrew or /usr/local.".into()),
            formulae: vec![],
            casks: vec![],
        };
    };

    let output = Command::new(&bin)
        .args(["outdated", "--json=v2"])
        .env_clear()
        .env("HOME", dirs::home_dir().unwrap_or_else(|| PathBuf::from("/")))
        .env("PATH", brew_path_env(&bin))
        .env("HOMEBREW_PREFIX", brew_prefix(&bin))
        .env("HOMEBREW_NO_AUTO_UPDATE", "1")
        .env("HOMEBREW_NO_ANALYTICS", "1")
        .env("LANG", "en_US.UTF-8")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output();

    let result = match output {
        Ok(out) if out.status.success() => parse_json(&out.stdout),
        Ok(out) => {
            let err = String::from_utf8_lossy(&out.stderr).trim().to_string();
            BrewOutdated {
                available: true,
                error: Some(if err.is_empty() {
                    "brew outdated failed.".into()
                } else {
                    err.chars().take(280).collect()
                }),
                formulae: vec![],
                casks: vec![],
            }
        }
        Err(err) => BrewOutdated {
            available: true,
            error: Some(err.to_string()),
            formulae: vec![],
            casks: vec![],
        },
    };

    let names: Vec<(String, bool)> = result
        .formulae
        .iter()
        .map(|pkg| (pkg.name.clone(), false))
        .chain(result.casks.iter().map(|pkg| (pkg.name.clone(), true)))
        .collect();
    if let Ok(mut allowed) = ALLOWED.lock() {
        *allowed = names;
    }
    if let Ok(mut cache) = CACHE.lock() {
        *cache = Some(Cached {
            at: Instant::now(),
            value: result.clone(),
        });
    }
    result
}

pub fn upgrade(name: &str) -> Result<String, String> {
    if !name_ok(name) {
        return Err("Refusing that package name.".into());
    }
    let allowed = ALLOWED.lock().map_err(|_| "Homebrew lock poisoned.".to_string())?;
    let Some((_, cask)) = allowed.iter().find(|(item, _)| item == name) else {
        return Err("That package is not in the current outdated list. Refresh first.".into());
    };
    let cask = *cask;
    drop(allowed);

    let bin = brew_bin().ok_or("Homebrew is not installed.")?;
    let mut args = vec!["upgrade"];
    if cask {
        args.push("--cask");
    } else {
        args.push("--formula");
    }
    args.push(name);

    let output = Command::new(&bin)
        .args(&args)
        .env_clear()
        .env("HOME", dirs::home_dir().unwrap_or_else(|| PathBuf::from("/")))
        .env("PATH", brew_path_env(&bin))
        .env("HOMEBREW_PREFIX", brew_prefix(&bin))
        .env("HOMEBREW_NO_AUTO_UPDATE", "1")
        .env("HOMEBREW_NO_ANALYTICS", "1")
        .env("LANG", "en_US.UTF-8")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|err| err.to_string())?;

    if let Ok(mut cache) = CACHE.lock() {
        *cache = None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    if output.status.success() {
        Ok(stdout.chars().take(2000).collect())
    } else {
        Err(stderr.chars().take(800).collect())
    }
}

fn brew_path_env(bin: &Path) -> String {
    let prefix = bin.parent().unwrap_or(Path::new("/usr/bin"));
    format!("{}:/usr/bin:/bin:/usr/sbin:/sbin", prefix.display())
}

fn brew_prefix(bin: &Path) -> PathBuf {
    bin.parent()
        .and_then(|dir| dir.parent())
        .unwrap_or(Path::new("/opt/homebrew"))
        .to_path_buf()
}

fn name_ok(name: &str) -> bool {
    let mut chars = name.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    first.is_ascii_alphanumeric()
        && name.len() <= 80
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '@' | '.' | '_' | '+' | '-'))
}

fn parse_json(bytes: &[u8]) -> BrewOutdated {
    #[derive(Deserialize)]
    struct Root {
        formulae: Option<Vec<Item>>,
        casks: Option<Vec<Item>>,
    }
    #[derive(Deserialize)]
    struct Item {
        name: String,
        installed_versions: Option<Vec<String>>,
        current_version: Option<String>,
        current_versions: Option<CurrentVersions>,
        pinned: Option<bool>,
    }
    #[derive(Deserialize)]
    struct CurrentVersions {
        stable: Option<String>,
    }

    let parsed: Root = match serde_json::from_slice(bytes) {
        Ok(v) => v,
        Err(err) => {
            return BrewOutdated {
                available: true,
                error: Some(format!("Could not parse brew JSON: {err}")),
                formulae: vec![],
                casks: vec![],
            };
        }
    };

    let formulae = parsed
        .formulae
        .unwrap_or_default()
        .into_iter()
        .filter(|item| name_ok(&item.name))
        .map(|item| BrewPackage {
            name: item.name,
            current: item
                .installed_versions
                .unwrap_or_default()
                .first()
                .cloned()
                .unwrap_or_else(|| "—".into()),
            latest: item.current_version.unwrap_or_default(),
            pinned: item.pinned.unwrap_or(false),
            cask: false,
        })
        .collect();

    let casks = parsed
        .casks
        .unwrap_or_default()
        .into_iter()
        .filter(|item| name_ok(&item.name))
        .map(|item| {
            let latest = item
                .current_version
                .or_else(|| item.current_versions.and_then(|v| v.stable))
                .unwrap_or_default();
            BrewPackage {
                name: item.name,
                current: item
                    .installed_versions
                    .unwrap_or_default()
                    .first()
                    .cloned()
                    .unwrap_or_else(|| "—".into()),
                latest,
                pinned: item.pinned.unwrap_or(false),
                cask: true,
            }
        })
        .collect();

    BrewOutdated {
        available: true,
        error: None,
        formulae,
        casks,
    }
}
