use std::path::{Path, PathBuf};
use std::time::Duration;

use futures::StreamExt;
use tauri::{command, AppHandle, Manager};
use tokio::io::AsyncWriteExt;

const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";

pub fn offline_dir(app_handle: &AppHandle) -> Result<PathBuf, String> {
    app_handle
        .path()
        .app_data_dir()
        .map(|dir| dir.join("offline"))
        .map_err(|err| err.to_string())
}

pub fn is_safe_file_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 128
        && !name.starts_with('.')
        && name.chars().all(|character| {
            character.is_ascii_alphanumeric()
                || character == '-'
                || character == '_'
                || character == '.'
        })
}

async fn write_stream(response: reqwest::Response, path: &Path) -> Result<u64, String> {
    let mut file = tokio::fs::File::create(path)
        .await
        .map_err(|err| err.to_string())?;
    let mut written: u64 = 0;
    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|err| err.to_string())?;
        file.write_all(&chunk)
            .await
            .map_err(|err| err.to_string())?;
        written += chunk.len() as u64;
    }

    file.flush().await.map_err(|err| err.to_string())?;
    Ok(written)
}

async fn download_to(url: &str, dir: &Path, file_name: &str) -> Result<u64, String> {
    tokio::fs::create_dir_all(dir)
        .await
        .map_err(|err| err.to_string())?;

    let client = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .connect_timeout(Duration::from_secs(30))
        .read_timeout(Duration::from_secs(60))
        .build()
        .map_err(|err| err.to_string())?;

    let response = client
        .get(url)
        .send()
        .await
        .map_err(|err| err.to_string())?;

    if !response.status().is_success() {
        return Err(format!("HTTP error: {}", response.status()));
    }

    let final_path = dir.join(file_name);
    let part_path = dir.join(format!("{file_name}.part"));

    match write_stream(response, &part_path).await {
        Ok(0) => {
            let _ = tokio::fs::remove_file(&part_path).await;
            Err("Downloaded file is empty".to_string())
        }
        Ok(written) => {
            tokio::fs::rename(&part_path, &final_path)
                .await
                .map_err(|err| err.to_string())?;
            Ok(written)
        }
        Err(message) => {
            let _ = tokio::fs::remove_file(&part_path).await;
            Err(message)
        }
    }
}

#[command]
#[specta::specta]
pub async fn offline_download(
    app_handle: AppHandle,
    url: String,
    file_name: String,
) -> Result<u64, String> {
    if !is_safe_file_name(&file_name) {
        return Err(format!("Invalid file name: {file_name}"));
    }
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("Invalid URL scheme. Expected http(s)".to_string());
    }

    let dir = offline_dir(&app_handle)?;
    log::info!("[Offline] Downloading {file_name}");

    download_to(&url, &dir, &file_name).await.map_err(|message| {
        log::error!("[Offline] Download of {file_name} failed: {message}");
        message
    })
}

#[command]
#[specta::specta]
pub async fn offline_delete(app_handle: AppHandle, file_name: String) -> Result<(), String> {
    if !is_safe_file_name(&file_name) {
        return Err(format!("Invalid file name: {file_name}"));
    }

    let dir = offline_dir(&app_handle)?;
    for name in [file_name.clone(), format!("{file_name}.part")] {
        match tokio::fs::remove_file(dir.join(&name)).await {
            Ok(()) => {}
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => {}
            Err(err) => return Err(err.to_string()),
        }
    }
    Ok(())
}
