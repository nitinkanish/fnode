//! Git status for already-discovered project folders.
//!
//! Binary is `/usr/bin/git` only. Paths are existing directories under $HOME
//! (the project scanner already enforced that). No shell interpolation.

use std::io::Read;
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::Duration;

use crate::models::Project;
use crate::paths;

const GIT: &str = "/usr/bin/git";
const TIMEOUT: Duration = Duration::from_millis(400);
const MAX_REPOS: usize = 60;

pub fn enrich(projects: &mut [Project]) {
    for project in projects.iter_mut().take(MAX_REPOS) {
        apply(project);
    }
}

fn apply(project: &mut Project) {
    let Ok(dir) = paths::validate_existing_dir(&project.path, None) else {
        return;
    };
    if !dir.join(".git").exists() {
        return;
    }
    if project.git_branch.is_none() {
        project.git_branch = git_out(&dir, &["rev-parse", "--abbrev-ref", "HEAD"]);
    }
    let porcelain = git_out(&dir, &["status", "--porcelain"]).unwrap_or_default();
    project.git_dirty = porcelain.lines().filter(|line| !line.is_empty()).count() as i64;
    if let Some((ahead, behind)) = ahead_behind(&dir) {
        project.git_ahead = ahead;
        project.git_behind = behind;
        project.git_has_remote = true;
    }
}

fn ahead_behind(dir: &Path) -> Option<(i64, i64)> {
    let raw = git_out(dir, &["rev-list", "--left-right", "--count", "@{upstream}...HEAD"])?;
    let mut parts = raw.split_whitespace();
    let behind = parts.next()?.parse().ok()?;
    let ahead = parts.next()?.parse().ok()?;
    Some((ahead, behind))
}

fn git_out(dir: &Path, args: &[&str]) -> Option<String> {
    let mut child = Command::new(GIT)
        .arg("-C")
        .arg(dir)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    let mut stdout = child.stdout.take()?;
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let mut buf = String::new();
        let _ = stdout.read_to_string(&mut buf);
        let _ = tx.send(buf);
    });
    match rx.recv_timeout(TIMEOUT) {
        Ok(buf) => {
            let status = child.wait().ok()?;
            if !status.success() {
                return None;
            }
            let text = buf.trim().to_string();
            if text.is_empty() {
                Some(String::new())
            } else {
                Some(text)
            }
        }
        Err(_) => {
            let _ = child.kill();
            let _ = child.wait();
            None
        }
    }
}
