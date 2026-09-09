//! Docker Engine integration via the local UNIX socket (Docker Desktop).
//!
//! All calls time out quickly so a stopped Docker.app cannot freeze the UI.

use std::time::Duration;

use bollard::container::{
    ListContainersOptions, LogsOptions, RestartContainerOptions, StartContainerOptions,
    StopContainerOptions,
};
use bollard::image::ListImagesOptions;
use bollard::network::ListNetworksOptions;
use bollard::volume::ListVolumesOptions;
use bollard::Docker;
use futures_util::StreamExt;

use crate::models::{
    DockerContainer, DockerImage, DockerNetwork, DockerOverview, DockerVolume,
};

const TIMEOUT: Duration = Duration::from_secs(2);

fn connect() -> Result<Docker, String> {
    Docker::connect_with_local_defaults().map_err(|err| err.to_string())
}

pub async fn overview() -> DockerOverview {
    let docker = match connect() {
        Ok(d) => d,
        Err(err) => {
            return DockerOverview {
                available: false,
                error: Some(format!("Docker is not available: {err}")),
                containers: vec![],
                images: vec![],
                volumes: vec![],
                networks: vec![],
            };
        }
    };

    match tokio::time::timeout(TIMEOUT, docker.ping()).await {
        Ok(Ok(_)) => {}
        Ok(Err(err)) => {
            return unavailable(format!("Docker did not respond: {err}"));
        }
        Err(_) => {
            return unavailable("Docker did not respond in time. Is Docker Desktop running?".into());
        }
    }

    let containers = list_containers(&docker).await.unwrap_or_default();
    let images = list_images(&docker).await.unwrap_or_default();
    let volumes = list_volumes(&docker).await.unwrap_or_default();
    let networks = list_networks(&docker).await.unwrap_or_default();

    DockerOverview {
        available: true,
        error: None,
        containers,
        images,
        volumes,
        networks,
    }
}

fn unavailable(error: String) -> DockerOverview {
    DockerOverview {
        available: false,
        error: Some(error),
        containers: vec![],
        images: vec![],
        volumes: vec![],
        networks: vec![],
    }
}

async fn list_containers(docker: &Docker) -> Result<Vec<DockerContainer>, String> {
    let options = Some(ListContainersOptions::<String> {
        all: true,
        ..Default::default()
    });
    let list = docker
        .list_containers(options)
        .await
        .map_err(|err| err.to_string())?;

    Ok(list
        .into_iter()
        .map(|item| {
            let ports = item
                .ports
                .unwrap_or_default()
                .into_iter()
                .filter_map(|port| {
                    let private = port.private_port;
                    match (port.ip, port.public_port) {
                        (Some(ip), Some(public)) => Some(format!("{ip}:{public}->{private}")),
                        (_, Some(public)) => Some(format!("{public}->{private}")),
                        _ => Some(private.to_string()),
                    }
                })
                .collect();

            let name = item
                .names
                .unwrap_or_default()
                .into_iter()
                .next()
                .unwrap_or_default()
                .trim_start_matches('/')
                .to_string();

            DockerContainer {
                id: item.id.unwrap_or_default(),
                name,
                image: item.image.unwrap_or_default(),
                status: item.status.unwrap_or_default(),
                state: item.state.unwrap_or_default(),
                ports,
                created: item.created.unwrap_or_default(),
            }
        })
        .collect())
}

async fn list_images(docker: &Docker) -> Result<Vec<DockerImage>, String> {
    let options = Some(ListImagesOptions::<String> {
        all: false,
        ..Default::default()
    });
    let list = docker
        .list_images(options)
        .await
        .map_err(|err| err.to_string())?;
    Ok(list
        .into_iter()
        .map(|item| DockerImage {
            id: item.id,
            tags: item.repo_tags,
            size: item.size as u64,
            created: item.created,
        })
        .collect())
}

async fn list_volumes(docker: &Docker) -> Result<Vec<DockerVolume>, String> {
    let result = docker
        .list_volumes(None::<ListVolumesOptions<String>>)
        .await
        .map_err(|err| err.to_string())?;
    Ok(result
        .volumes
        .unwrap_or_default()
        .into_iter()
        .map(|item| DockerVolume {
            name: item.name,
            driver: item.driver,
            mountpoint: item.mountpoint,
        })
        .collect())
}

async fn list_networks(docker: &Docker) -> Result<Vec<DockerNetwork>, String> {
    let list = docker
        .list_networks(None::<ListNetworksOptions<String>>)
        .await
        .map_err(|err| err.to_string())?;
    Ok(list
        .into_iter()
        .map(|item| DockerNetwork {
            id: item.id.unwrap_or_default(),
            name: item.name.unwrap_or_default(),
            driver: item.driver.unwrap_or_default(),
        })
        .collect())
}

pub async fn start(id: &str) -> Result<(), String> {
    let docker = connect()?;
    docker
        .start_container(id, None::<StartContainerOptions<String>>)
        .await
        .map_err(|err| err.to_string())
}

pub async fn stop(id: &str) -> Result<(), String> {
    let docker = connect()?;
    docker
        .stop_container(id, None::<StopContainerOptions>)
        .await
        .map_err(|err| err.to_string())
}

pub async fn restart(id: &str) -> Result<(), String> {
    let docker = connect()?;
    docker
        .restart_container(id, None::<RestartContainerOptions>)
        .await
        .map_err(|err| err.to_string())
}

pub async fn logs(id: &str, tail: i64) -> Result<Vec<String>, String> {
    let docker = connect()?;
    let options = Some(LogsOptions::<String> {
        stdout: true,
        stderr: true,
        tail: tail.to_string(),
        timestamps: true,
        ..Default::default()
    });

    let mut stream = docker.logs(id, options);
    let mut lines = Vec::new();
    while let Some(chunk) = stream.next().await {
        match chunk {
            Ok(output) => lines.push(output.to_string().trim_end().to_string()),
            Err(err) => lines.push(format!("error reading logs: {err}")),
        }
        if lines.len() >= 500 {
            break;
        }
    }
    Ok(lines)
}

pub fn open_shell(name: &str) -> Result<(), String> {
    if !crate::paths::docker_name_ok(name) {
        return Err("Invalid container name.".into());
    }
    std::process::Command::new("osascript")
        .arg("-e")
        .arg(format!(
            r#"tell application "Terminal"
                activate
                do script "docker exec -it {name} /bin/sh || docker exec -it {name} /bin/bash"
            end tell"#
        ))
        .spawn()
        .map_err(|err| err.to_string())?;
    Ok(())
}

#[allow(dead_code)]
pub async fn running_count() -> (bool, usize, usize) {
    let overview = overview().await;
    let running = overview
        .containers
        .iter()
        .filter(|c| c.state.eq_ignore_ascii_case("running"))
        .count();
    (overview.available, overview.containers.len(), running)
}
