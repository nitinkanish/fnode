//! Resolve macOS .app icons to small PNG data URLs (cached in-process).

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
    let key = bundle.to_string_lossy().into_owned();
    if let Ok(cache) = cache().lock() {
        if let Some(hit) = cache.get(&key) {
            return hit.clone();
        }
    }
    let icon = convert_bundle(&bundle);
    if let Ok(mut cache) = cache().lock() {
        cache.insert(key, icon.clone());
    }
    icon
}

pub fn bundle_path(exe: &str) -> Option<PathBuf> {
    let path = Path::new(exe);
    for ancestor in path.ancestors() {
        if ancestor.extension().and_then(|ext| ext.to_str()) == Some("app") {
            return Some(ancestor.to_path_buf());
        }
    }
    None
}

fn convert_bundle(bundle: &Path) -> Option<String> {
    let icns = find_icns(bundle)?;
    let stamp = bundle
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("app")
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .take(24)
        .collect::<String>();
    let tmp = std::env::temp_dir().join(format!("fnode-icon-{stamp}.png"));
    let ok = Command::new("sips")
        .args(["-s", "format", "png", "-Z", "64"])
        .arg(&icns)
        .arg("--out")
        .arg(&tmp)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .ok()?
        .success();
    if !ok {
        return None;
    }
    let bytes = fs::read(&tmp).ok()?;
    let _ = fs::remove_file(&tmp);
    if bytes.len() < 32 || bytes.len() > 80_000 {
        return None;
    }
    Some(format!("data:image/png;base64,{}", b64(&bytes)))
}

fn find_icns(bundle: &Path) -> Option<PathBuf> {
    let resources = bundle.join("Contents/Resources");
    for name in ["AppIcon.icns", "Icon.icns", "icon.icns", "AppIcon"] {
        let with_ext = if name.ends_with(".icns") {
            resources.join(name)
        } else {
            resources.join(format!("{name}.icns"))
        };
        if with_ext.is_file() {
            return Some(with_ext);
        }
    }
    let Ok(entries) = fs::read_dir(&resources) else {
        return None;
    };
    entries
        .flatten()
        .map(|e| e.path())
        .find(|path| path.extension().and_then(|ext| ext.to_str()) == Some("icns"))
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
