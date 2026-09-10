//! Camera and microphone clients on this Mac.
//!
//! We do not open the camera or microphone. Detection is `lsof` against a
//! bounded PID list (GUI apps already in the snapshot) plus helper-process
//! names. Full-table `lsof` is avoided so the 20s snapshot cadence stays intact.

use std::collections::HashSet;
use std::io::Read;
use std::process::{Command, Stdio};
use std::time::Duration;

use crate::models::{DevProcess, PrivacyApp, PrivacyStatus};

const CAMERA_HINTS: &[&str] = &[
    "applecamera",
    "vdcassistant",
    "cmio",
    "appleh13cam",
    "appleh16cam",
    "applet810",
    "usbcvideo",
    "isight",
];

const MIC_HINTS: &[&str] = &[
    "appleh13mic",
    "appleh16mic",
    "applemicrophone",
    "coreaudio.component",
    "ioaudioengine",
    "applet2mic",
    "micin",
];

const HELPER_SKIP: &[&str] = &[
    "VDCAssistant",
    "AppleCameraAssistant",
    "cameracaptured",
    "appleh13camerad",
    "cinematicframingd",
    "coreaudiod",
    "audiomxd",
];

pub fn scan(processes: &[DevProcess], enabled: bool) -> PrivacyStatus {
    if !enabled {
        return PrivacyStatus::idle();
    }

    let mut camera = HashSet::new();
    let mut mic = HashSet::new();

    for proc in processes {
        let name = proc.name.to_lowercase();
        if name.contains("vdcassistant")
            || name.contains("applecameraassistant")
            || name.contains("cameracaptured")
            || name.contains("appleh13camerad")
        {
            camera.insert(proc.pid);
        }
    }

    let pids: Vec<u32> = processes
        .iter()
        .filter(|proc| !is_helper(&proc.name))
        .map(|proc| proc.pid)
        .take(60)
        .collect();

    if let Some(text) = lsof_names(&pids) {
        let mut current: Option<u32> = None;
        for token in text.split('\0') {
            let bytes = token.as_bytes();
            if bytes.len() < 2 {
                continue;
            }
            match bytes[0] {
                b'p' => current = token[1..].parse().ok(),
                b'n' => {
                    let Some(pid) = current else { continue };
                    let lower = token[1..].to_ascii_lowercase();
                    if CAMERA_HINTS.iter().any(|hint| lower.contains(hint)) {
                        camera.insert(pid);
                    }
                    if MIC_HINTS.iter().any(|hint| lower.contains(hint)) {
                        mic.insert(pid);
                    }
                }
                _ => {}
            }
        }
    }

    PrivacyStatus {
        camera_active: !camera.is_empty(),
        microphone_active: !mic.is_empty(),
        camera_apps: resolve(processes, &camera),
        microphone_apps: resolve(processes, &mic),
    }
}

fn resolve(processes: &[DevProcess], pids: &HashSet<u32>) -> Vec<PrivacyApp> {
    let mut apps = Vec::new();
    let mut seen = HashSet::new();
    for proc in processes {
        if !pids.contains(&proc.pid) || is_helper(&proc.name) {
            continue;
        }
        let key = proc.software.to_lowercase();
        if !seen.insert(key) {
            continue;
        }
        apps.push(PrivacyApp {
            pid: proc.pid,
            name: proc.display_name.clone(),
            software: proc.software.clone(),
            icon: proc.icon.clone(),
        });
        if apps.len() >= 8 {
            break;
        }
    }
    apps
}

fn is_helper(name: &str) -> bool {
    HELPER_SKIP
        .iter()
        .any(|skip| name.eq_ignore_ascii_case(skip))
}

fn lsof_names(pids: &[u32]) -> Option<String> {
    if pids.is_empty() {
        return None;
    }
    let list = pids
        .iter()
        .map(|pid| pid.to_string())
        .collect::<Vec<_>>()
        .join(",");
    let mut child = Command::new("/usr/sbin/lsof")
        .args(["-nP", "-F", "pn0", "-p", &list])
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
    match rx.recv_timeout(Duration::from_millis(800)) {
        Ok(buf) => {
            let _ = child.wait();
            Some(buf)
        }
        Err(_) => {
            let _ = child.kill();
            let _ = child.wait();
            None
        }
    }
}
