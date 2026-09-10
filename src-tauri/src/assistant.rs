use crate::models::{AssistantReply, DashboardOverview, DevProcess, PortInfo, Project};

pub fn answer_locally(
    question: &str,
    overview: &DashboardOverview,
    ports: &[PortInfo],
    processes: &[DevProcess],
    projects: &[Project],
) -> AssistantReply {
    let q = question.to_lowercase();
    let mut citations = Vec::new();

    if let Some(port) = extract_port(&q) {
        if let Some(info) = ports.iter().find(|p| p.port == port) {
            citations.push(format!("port:{port}"));
            return AssistantReply {
                answer: format!(
                    "Port {port} is in use by **{}** (process `{}`, PID {}).\n\nCommand: `{}`\nCPU: {:.1}% · Memory: {}\n{}",
                    info.display_name,
                    info.process_name,
                    info.pid,
                    info.command,
                    info.cpu,
                    fmt_bytes(info.memory_bytes),
                    info.project_path
                        .as_deref()
                        .map(|p| format!("Project path: `{p}`"))
                        .unwrap_or_default()
                ),
                local_only: true,
                citations,
            };
        }
        return AssistantReply {
            answer: format!("Nothing on this machine is currently listening on port {port}."),
            local_only: true,
            citations,
        };
    }

    if q.contains("slow")
        || (q.contains("why") && q.contains("machine"))
        || q.contains("cpu")
        || q.contains("memory")
    {
        let mut top: Vec<&DevProcess> = processes.iter().collect();
        top.sort_by(|a, b| {
            b.cpu
                .partial_cmp(&a.cpu)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        top.truncate(5);
        citations.push("system:cpu".into());
        let lines: Vec<String> = top
            .iter()
            .map(|p| {
                format!(
                    "• {} — {:.1}% CPU, {} RAM (PID {})",
                    p.display_name,
                    p.cpu,
                    fmt_bytes(p.memory_bytes),
                    p.pid
                )
            })
            .collect();
        let mem_pct = if overview.system.memory_total > 0 {
            (overview.system.memory_used as f64 / overview.system.memory_total as f64) * 100.0
        } else {
            0.0
        };
        return AssistantReply {
            answer: format!(
                "CPU is at {:.1}% and memory is at {:.1}% ({}/{}).\n\nHighest CPU processes right now:\n{}\n\nDev servers are usually safe to restart; system processes (WindowServer, kernel_task) should be left alone.",
                overview.system.cpu_usage,
                mem_pct,
                fmt_bytes(overview.system.memory_used),
                fmt_bytes(overview.system.memory_total),
                lines.join("\n")
            ),
            local_only: true,
            citations,
        };
    }

    if q.contains("safely stop") || (q.contains("stop") && q.contains("safe")) {
        let candidates: Vec<&DevProcess> = processes
            .iter()
            .filter(|p| p.is_dev_service && p.cpu < 5.0)
            .take(8)
            .collect();
        if candidates.is_empty() {
            return AssistantReply {
                answer: "I don't see idle developer services that are obviously safe to stop. Stick to Node/Python/Docker containers you started yourself.".into(),
                local_only: true,
                citations,
            };
        }
        let lines: Vec<String> = candidates
            .iter()
            .map(|p| {
                format!(
                    "• {} (PID {}, {}) — {:.1}% CPU, listening on {:?}",
                    p.display_name,
                    p.pid,
                    p.runtime.clone().unwrap_or_else(|| p.name.clone()),
                    p.cpu,
                    p.ports
                )
            })
            .collect();
        citations.push("processes:dev".into());
        return AssistantReply {
            answer: format!(
                "These look like developer services you started, not macOS system processes. Stopping them will free RAM but drop any local servers:\n\n{}",
                lines.join("\n")
            ),
            local_only: true,
            citations,
        };
    }

    if q.contains("unused") && q.contains("project") {
        let unused: Vec<&Project> = projects.iter().filter(|p| !p.is_running).take(10).collect();
        citations.push("projects".into());
        if unused.is_empty() {
            return AssistantReply {
                answer: "Every discovered project has at least one matching process running, or no projects have been scanned yet.".into(),
                local_only: true,
                citations,
            };
        }
        let lines: Vec<String> = unused
            .iter()
            .map(|p| {
                format!(
                    "• {} [{}] — `{}`",
                    p.name,
                    p.framework.clone().unwrap_or_else(|| "unknown".into()),
                    p.path
                )
            })
            .collect();
        return AssistantReply {
            answer: format!(
                "These projects are on disk but have no matching running process:\n\n{}",
                lines.join("\n")
            ),
            local_only: true,
            citations,
        };
    }

    let running_dev = processes.iter().filter(|p| p.is_dev_service).count();
    AssistantReply {
        answer: format!(
            "Local snapshot: CPU {:.1}%, {} RAM used, {} listening ports, {} Docker containers, {} AI services, {} developer processes, {} known projects.\n\nAsk me things like “what is running on port 3000?”, “why is my machine slow?”, “what can I safely stop?”, or “which projects are unused?”",
            overview.system.cpu_usage,
            fmt_bytes(overview.system.memory_used),
            overview.open_ports,
            overview.docker_containers,
            overview.ai_services,
            running_dev,
            projects.len()
        ),
        local_only: true,
        citations: vec!["overview".into()],
    }
}

pub fn build_context(
    overview: &DashboardOverview,
    ports: &[PortInfo],
    processes: &[DevProcess],
    projects: &[Project],
) -> String {
    let mut lines = vec![
        format!(
            "System: {} {} | CPU {:.1}% | RAM {}/{}",
            overview.system.os_name,
            overview.system.os_version,
            overview.system.cpu_usage,
            fmt_bytes(overview.system.memory_used),
            fmt_bytes(overview.system.memory_total)
        ),
        format!(
            "Counts: ports={} docker={} ai={} projects={}",
            overview.open_ports,
            overview.docker_containers,
            overview.ai_services,
            projects.len()
        ),
        "Listening ports:".into(),
    ];
    for port in ports.iter().take(40) {
        lines.push(format!(
            "  :{} {} pid={} cmd={}",
            port.port, port.display_name, port.pid, port.command
        ));
    }
    lines.push("Top developer processes:".into());
    for proc in processes.iter().filter(|p| p.is_dev_service).take(30) {
        lines.push(format!(
            "  {} pid={} cpu={:.1} mem={} cwd={}",
            proc.display_name,
            proc.pid,
            proc.cpu,
            fmt_bytes(proc.memory_bytes),
            proc.cwd.clone().unwrap_or_default()
        ));
    }
    lines.push("Projects:".into());
    for project in projects.iter().take(40) {
        lines.push(format!(
            "  {} [{}] running={} path={}",
            project.name,
            project.framework.clone().unwrap_or_default(),
            project.is_running,
            project.path
        ));
    }
    lines.join("\n")
}

fn extract_port(question: &str) -> Option<u16> {
    let mut n = 0u32;
    let mut in_num = false;
    for c in question.chars().chain(std::iter::once(' ')) {
        if c.is_ascii_digit() {
            in_num = true;
            n = n.saturating_mul(10).saturating_add(u32::from(c as u8 - b'0'));
        } else if in_num {
            if (80..=65535).contains(&n) {
                return u16::try_from(n).ok();
            }
            n = 0;
            in_num = false;
        }
    }
    None
}

fn fmt_bytes(bytes: u64) -> String {
    const GB: f64 = 1024.0 * 1024.0 * 1024.0;
    const MB: f64 = 1024.0 * 1024.0;
    if bytes as f64 >= GB {
        format!("{:.1} GB", bytes as f64 / GB)
    } else {
        format!("{:.0} MB", bytes as f64 / MB)
    }
}
