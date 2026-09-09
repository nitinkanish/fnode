//! Detect local AI runtimes without sending any model data off-machine.
//!
//! Providers are identified by listening ports, process names, and (when the
//! service is up) their local HTTP APIs.

use std::time::Duration;

use serde_json::Value;

use crate::models::{AiModel, AiService};

const HTTP_TIMEOUT: Duration = Duration::from_millis(700);

#[derive(Clone, Debug)]
pub struct ProcessHint {
    pub pid: u32,
    pub name: String,
    pub command: String,
}

struct Probe {
    provider: &'static str,
    port: u16,
    path: &'static str,
}

const PROBES: &[Probe] = &[
    Probe {
        provider: "Ollama",
        port: 11434,
        path: "/api/tags",
    },
    Probe {
        provider: "LM Studio",
        port: 1234,
        path: "/v1/models",
    },
    Probe {
        provider: "LocalAI",
        port: 8080,
        path: "/v1/models",
    },
    Probe {
        provider: "vLLM",
        port: 8000,
        path: "/v1/models",
    },
];

pub fn hints_from_system(sys: &sysinfo::System) -> Vec<ProcessHint> {
    sys.processes()
        .values()
        .map(|proc| ProcessHint {
            pid: proc.pid().as_u32(),
            name: proc.name().to_string_lossy().into_owned(),
            command: proc
                .cmd()
                .iter()
                .map(|s| s.to_string_lossy().into_owned())
                .collect::<Vec<_>>()
                .join(" "),
        })
        .collect()
}

pub async fn detect(hints: &[ProcessHint], listening_ports: &[u16]) -> Vec<AiService> {
    let mut services = Vec::new();

    for probe in PROBES {
        let pid = find_pid(hints, probe.provider);
        let port_open = listening_ports.contains(&probe.port);
        let running = pid.is_some() || port_open;

        let (models, running_http) = if running || port_open {
            fetch_models(probe).await
        } else {
            (Vec::new(), false)
        };

        let is_running = running || running_http;
        if !is_running && models.is_empty() && !matches!(probe.provider, "Ollama" | "LM Studio") {
            continue;
        }

        if matches!(probe.provider, "Ollama" | "LM Studio") || is_running {
            services.push(AiService {
                provider: probe.provider.into(),
                running: is_running,
                endpoint: Some(format!("http://127.0.0.1:{}", probe.port)),
                models,
                pid,
            });
        }
    }

    if let Some(whisper) =
        detect_named(hints, "Whisper", &["whisper", "whisper-server", "faster-whisper"])
    {
        services.push(whisper);
    }
    if let Some(sd) = detect_named(
        hints,
        "Stable Diffusion",
        &["stable-diffusion", "sd-webui", "webui.py", "comfyui", "a1111"],
    ) {
        services.push(sd);
    }

    services
}

async fn fetch_models(probe: &Probe) -> (Vec<AiModel>, bool) {
    let url = format!("http://127.0.0.1:{}{}", probe.port, probe.path);
    let client = match reqwest::Client::builder().timeout(HTTP_TIMEOUT).build() {
        Ok(c) => c,
        Err(_) => return (Vec::new(), false),
    };
    let Ok(response) = client.get(&url).send().await else {
        return (Vec::new(), false);
    };
    if !response.status().is_success() {
        return (Vec::new(), true);
    }
    let Ok(json) = response.json::<Value>().await else {
        return (Vec::new(), true);
    };

    let models = if probe.provider == "Ollama" {
        json.get("models")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|item| {
                        let name = item.get("name")?.as_str()?.to_string();
                        let size = item.get("size").and_then(|v| v.as_u64()).map(format_bytes);
                        let parameter_size = item
                            .get("details")
                            .and_then(|d| d.get("parameter_size"))
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string());
                        Some(AiModel {
                            name,
                            size,
                            parameter_size,
                        })
                    })
                    .collect()
            })
            .unwrap_or_default()
    } else {
        json.get("data")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|item| {
                        Some(AiModel {
                            name: item.get("id")?.as_str()?.to_string(),
                            size: None,
                            parameter_size: None,
                        })
                    })
                    .collect()
            })
            .unwrap_or_default()
    };

    (models, true)
}

fn find_pid(hints: &[ProcessHint], provider: &str) -> Option<u32> {
    let needles: &[&str] = match provider {
        "Ollama" => &["ollama"],
        "LM Studio" => &["lm studio", "lmstudio", "lms"],
        "LocalAI" => &["local-ai", "localai"],
        "vLLM" => &["vllm"],
        _ => &[],
    };
    for proc in hints {
        let name = proc.name.to_lowercase();
        let cmd = proc.command.to_lowercase();
        if needles.iter().any(|n| name.contains(n) || cmd.contains(n)) {
            return Some(proc.pid);
        }
    }
    None
}

fn detect_named(hints: &[ProcessHint], provider: &str, needles: &[&str]) -> Option<AiService> {
    for proc in hints {
        let blob = format!("{} {}", proc.name.to_lowercase(), proc.command.to_lowercase());
        if needles.iter().any(|n| blob.contains(n)) {
            return Some(AiService {
                provider: provider.into(),
                running: true,
                endpoint: None,
                models: vec![],
                pid: Some(proc.pid),
            });
        }
    }
    None
}

pub fn start_provider(provider: &str) -> Result<(), String> {
    let app = match provider {
        "Ollama" => "Ollama",
        "LM Studio" => "LM Studio",
        _ => {
            return Err(format!(
                "{provider} cannot be launched as a macOS app from FNode"
            ))
        }
    };
    std::process::Command::new("open")
        .args(["-a", app])
        .spawn()
        .map_err(|err| err.to_string())?;
    Ok(())
}

pub fn open_chat(provider: &str, endpoint: Option<&str>) -> Result<(), String> {
    let url = match provider {
        "Ollama" => endpoint.unwrap_or("http://127.0.0.1:11434").to_string(),
        "LM Studio" => "http://127.0.0.1:1234".into(),
        _ => endpoint.unwrap_or("http://127.0.0.1").to_string(),
    };
    std::process::Command::new("open")
        .arg(url)
        .spawn()
        .map_err(|err| err.to_string())?;
    Ok(())
}

fn format_bytes(bytes: u64) -> String {
    const GB: f64 = 1024.0 * 1024.0 * 1024.0;
    const MB: f64 = 1024.0 * 1024.0;
    if bytes as f64 >= GB {
        format!("{:.1} GB", bytes as f64 / GB)
    } else {
        format!("{:.0} MB", bytes as f64 / MB)
    }
}
