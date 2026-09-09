//! Live host metrics via sysinfo.
//!
//! CPU percentages require two samples. AppState keeps a long-lived `System`
//! so each poll after the first is accurate without sleeping the UI thread.

use std::path::Path;
use std::time::{Duration, Instant};

use sysinfo::{Disks, Networks, System};

use crate::models::SystemSnapshot;

#[derive(Clone, Copy)]
pub struct NetSample {
    pub at: Instant,
    pub rx: u64,
    pub tx: u64,
}

pub fn snapshot(sys: &System, networks: &Networks, previous: Option<NetSample>) -> (SystemSnapshot, NetSample) {
    let (disk_used, disk_total, disk_mount) = primary_disk();
    let load = System::load_average();
    let (rx, tx) = network_totals(networks);
    let now = Instant::now();
    let (rx_rate, tx_rate) = match previous {
        Some(prev) => {
            let secs = now.duration_since(prev.at).as_secs_f64().max(0.001);
            (
                rx.saturating_sub(prev.rx) as f64 / secs,
                tx.saturating_sub(prev.tx) as f64 / secs,
            )
        }
        None => (0.0, 0.0),
    };

    let snap = SystemSnapshot {
        hostname: System::host_name().unwrap_or_else(|| "localhost".into()),
        os_name: System::name().unwrap_or_else(|| "macOS".into()),
        os_version: System::os_version().unwrap_or_default(),
        cpu_brand: sys
            .cpus()
            .first()
            .map(|cpu| cpu.brand().to_string())
            .unwrap_or_else(|| "Unknown CPU".into()),
        cpu_cores: sys.cpus().len(),
        cpu_usage: sys.global_cpu_usage(),
        memory_used: sys.used_memory(),
        memory_total: sys.total_memory(),
        swap_used: sys.used_swap(),
        swap_total: sys.total_swap(),
        disk_used,
        disk_total,
        disk_mount,
        process_count: sys.processes().len(),
        uptime_seconds: System::uptime(),
        load_avg_1: load.one,
        load_avg_5: load.five,
        load_avg_15: load.fifteen,
        cpu_per_core: sys.cpus().iter().map(|cpu| cpu.cpu_usage()).collect(),
        arch: System::cpu_arch(),
        kernel: System::kernel_version().unwrap_or_default(),
        network_rx_bytes: rx,
        network_tx_bytes: tx,
        network_rx_per_sec: rx_rate,
        network_tx_per_sec: tx_rate,
    };

    (snap, NetSample { at: now, rx, tx })
}

fn network_totals(networks: &Networks) -> (u64, u64) {
    let mut rx = 0u64;
    let mut tx = 0u64;
    for (_, data) in networks.iter() {
        rx = rx.saturating_add(data.total_received());
        tx = tx.saturating_add(data.total_transmitted());
    }
    (rx, tx)
}

/// Prefer the root volume so Time Machine / iOS backups are not summed in.
fn primary_disk() -> (u64, u64, String) {
    let disks = Disks::new_with_refreshed_list();
    let root = disks
        .list()
        .iter()
        .find(|disk| disk.mount_point() == Path::new("/"));

    if let Some(disk) = root {
        let total = disk.total_space();
        let available = disk.available_space();
        let used = total.saturating_sub(available);
        return (used, total, "/".into());
    }

    let mut total = 0u64;
    let mut available = 0u64;
    for disk in disks.list() {
        total += disk.total_space();
        available += disk.available_space();
    }
    (total.saturating_sub(available), total, "all volumes".into())
}

pub const LIVE_TTL: Duration = Duration::from_millis(900);
pub const DB_WRITE_TTL: Duration = Duration::from_secs(20);
