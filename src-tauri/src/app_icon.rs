//! Resolve macOS .app icons to small PNG data URLs (cached in-process).
//!
//! Helper binaries live inside nested `.app` bundles under Frameworks.
//! Always resolve the outermost application bundle so Chrome Helper and
//! Cursor Helper show the real parent icon.

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Mutex, OnceLock};

static CACHE: OnceLock<Mutex<HashMap<String, Option<String>>>> = OnceLock::new();

fn cache() -> &'static Mutex<HashMap<String, Option<String>>> {
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn for_exe(exe: Option<&str>) -> Option<String> {
    let bundle = bundle_path(exe?)?;
    if !is_user_facing(&bundle) {
        return None;
    }
    for_bundle(&bundle)
}

pub fn is_user_facing(bundle: &Path) -> bool {
    let path = bundle.to_string_lossy();
    path.contains("/Applications/")
        || path.contains("/Users/")
        || path.ends_with("Finder.app")
        || path.contains("/Finder.app/")
}

pub fn for_bundle(bundle: &Path) -> Option<String> {
    let key = bundle.to_string_lossy().into_owned();
    if let Ok(cache) = cache().lock() {
        if let Some(hit) = cache.get(&key) {
            return hit.clone();
        }
    }
    let icon = convert_bundle(bundle);
    if let Ok(mut cache) = cache().lock() {
        cache.insert(key, icon.clone());
    }
    icon
}

/// Outermost `.app` so nested helpers (Chrome Helper.app inside Chrome.app) group together.
pub fn bundle_path(exe: &str) -> Option<PathBuf> {
    let path = Path::new(exe);
    let mut found = None;
    for ancestor in path.ancestors() {
        if ancestor.extension().and_then(|ext| ext.to_str()) == Some("app") {
            found = Some(ancestor.to_path_buf());
        }
    }
    found
}

fn convert_bundle(bundle: &Path) -> Option<String> {
    if let Some(icns) = find_icns(bundle) {
        if let Some(png) = sips_png(&icns) {
            return encode_png(&png);
        }
    }
    if allow_qlmanage(bundle) {
        qlmanage_png(bundle).and_then(|png| encode_png(&png))
    } else {
        None
    }
}

fn allow_qlmanage(bundle: &Path) -> bool {
    let path = bundle.to_string_lossy();
    path.contains("/Applications/") || path.contains("/Users/")
}

fn find_icns(bundle: &Path) -> Option<PathBuf> {
    let resources = bundle.join("Contents/Resources");
    if let Some(name) = plist_icon_file(bundle) {
        let candidate = if name.ends_with(".icns") {
            resources.join(&name)
        } else {
            resources.join(format!("{name}.icns"))
        };
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    let preferred = [
        "AppIcon.icns",
        "icon.icns",
        "Icon.icns",
        "app.icns",
        "electron.icns",
        "AppIcon",
    ];
    for name in preferred {
        let path = if name.ends_with(".icns") {
            resources.join(name)
        } else {
            resources.join(format!("{name}.icns"))
        };
        if path.is_file() {
            return Some(path);
        }
    }
    let Ok(entries) = fs::read_dir(&resources) else {
        return None;
    };
    let mut icns: Vec<PathBuf> = entries
        .flatten()
        .map(|e| e.path())
        .filter(|path| path.extension().and_then(|ext| ext.to_str()) == Some("icns"))
        .collect();
    icns.sort_by_key(|path| {
        let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
        let lower = name.to_ascii_lowercase();
        if lower.contains("appicon") || lower == "icon.icns" || lower == "app.icns" {
            0
        } else {
            1
        }
    });
    icns.into_iter().next()
}

fn plist_icon_file(bundle: &Path) -> Option<String> {
    let info = bundle.join("Contents/Info");
    let output = Command::new("defaults")
        .args(["read", &info.to_string_lossy(), "CFBundleIconFile"])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if value.is_empty() {
        None
    } else {
        Some(value)
    }
}

fn sips_png(icns: &Path) -> Option<Vec<u8>> {
    let tmp = unique_tmp("sips");
    let ok = Command::new("sips")
        .args(["-s", "format", "png", "-Z", "128"])
        .arg(icns)
        .arg("--out")
        .arg(&tmp)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .ok()?
        .success();
    let bytes = if ok { fs::read(&tmp).ok() } else { None };
    let _ = fs::remove_file(&tmp);
    bytes
}

fn qlmanage_png(bundle: &Path) -> Option<Vec<u8>> {
    let dir = std::env::temp_dir().join(format!(
        "fnode-ql-{}",
        std::process::id()
    ));
    let _ = fs::create_dir_all(&dir);
    let status = Command::new("qlmanage")
        .args(["-t", "-s", "128", "-o"])
        .arg(&dir)
        .arg(bundle)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .ok()?;
    if !status.success() {
        let _ = fs::remove_dir_all(&dir);
        return None;
    }
    let png = fs::read_dir(&dir)
        .ok()?
        .flatten()
        .map(|e| e.path())
        .find(|path| path.extension().and_then(|ext| ext.to_str()) == Some("png"));
    let bytes = png.and_then(|path| fs::read(path).ok());
    let _ = fs::remove_dir_all(&dir);
    bytes
}

fn encode_png(bytes: &[u8]) -> Option<String> {
    if bytes.len() < 32 || bytes.len() > 400_000 {
        return None;
    }
    Some(format!("data:image/png;base64,{}", b64(bytes)))
}

fn unique_tmp(tag: &str) -> PathBuf {
    std::env::temp_dir().join(format!(
        "fnode-icon-{}-{}-{}.png",
        tag,
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0)
    ))
}

fn b64(data: &[u8]) -> String {
    const TABLE: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((data.len() + 2) / 3 * 4);
    for chunk in data.chunks(3) {
        let a = chunk[0] as u32;
        let b = chunk.get(1).copied().unwrap_or(0) as u32;
        let c = chunk.get(2).copied().unwrap_or(0) as u32;
        let n = (a << 16) | (b << 8) | c;
        out.push(TABLE[((n >> 18) & 63) as usize] as char);
        out.push(TABLE[((n >> 12) & 63) as usize] as char);
        out.push(if chunk.len() > 1 {
            TABLE[((n >> 6) & 63) as usize] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            TABLE[(n & 63) as usize] as char
        } else {
            '='
        });
    }
    out
}
