use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::Duration;

use futures::{stream, StreamExt};
use reqwest::Url;
use tauri::{command, AppHandle, Manager};
use tokio::io::AsyncWriteExt;

const HLS_CONCURRENCY: usize = 6;
const HLS_PLAYLIST_FILE: &str = "playlist.m3u8";

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

fn build_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .connect_timeout(Duration::from_secs(30))
        .read_timeout(Duration::from_secs(60))
        .build()
        .map_err(|err| err.to_string())
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

    let client = build_client()?;

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

struct HlsPlan {
    lines: Vec<String>,
    downloads: Vec<(Url, String)>,
}

fn split_parts(list: &str) -> Vec<String> {
    let mut parts = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;

    for character in list.chars() {
        match character {
            '"' => {
                in_quotes = !in_quotes;
                current.push(character);
            }
            ',' if !in_quotes => parts.push(std::mem::take(&mut current)),
            _ => current.push(character),
        }
    }
    if !current.is_empty() {
        parts.push(current);
    }
    parts
}

fn attribute_value(parts: &[String], name: &str) -> Option<String> {
    parts.iter().find_map(|part| {
        let (key, value) = part.split_once('=')?;
        (key.trim() == name).then(|| value.trim().trim_matches('"').to_string())
    })
}

fn with_local_uri(parts: &[String], local_name: &str) -> String {
    parts
        .iter()
        .map(|part| match part.split_once('=') {
            Some((key, _)) if key.trim() == "URI" => format!("URI=\"{local_name}\""),
            _ => part.clone(),
        })
        .collect::<Vec<_>>()
        .join(",")
}

fn extension_of(url: &Url, default: &str) -> String {
    url.path()
        .rsplit('/')
        .next()
        .and_then(|name| name.rsplit_once('.'))
        .map(|(_, extension)| extension.to_ascii_lowercase())
        .filter(|extension| {
            !extension.is_empty()
                && extension.len() <= 5
                && extension
                    .chars()
                    .all(|character| character.is_ascii_alphanumeric())
        })
        .unwrap_or_else(|| default.to_string())
}

fn register_download(
    downloads: &mut Vec<(Url, String)>,
    known: &mut HashMap<String, String>,
    url: Url,
    local_name: String,
) -> String {
    if let Some(existing) = known.get(url.as_str()) {
        return existing.clone();
    }
    known.insert(url.to_string(), local_name.clone());
    downloads.push((url, local_name.clone()));
    local_name
}

fn pick_variant(text: &str, base: &Url) -> Result<Option<Url>, String> {
    if !text.contains("#EXT-X-STREAM-INF") {
        return Ok(None);
    }

    let mut best: Option<(u64, String)> = None;
    let mut pending_bandwidth: Option<u64> = None;

    for line in text.lines().map(str::trim) {
        if let Some(attributes) = line.strip_prefix("#EXT-X-STREAM-INF:") {
            let parts = split_parts(attributes);
            pending_bandwidth = Some(
                attribute_value(&parts, "BANDWIDTH")
                    .and_then(|value| value.parse().ok())
                    .unwrap_or(0),
            );
        } else if !line.is_empty() && !line.starts_with('#') {
            if let Some(bandwidth) = pending_bandwidth.take() {
                let is_better = best
                    .as_ref()
                    .map_or(true, |(current, _)| bandwidth > *current);
                if is_better {
                    best = Some((bandwidth, line.to_string()));
                }
            }
        }
    }

    let (_, uri) = best.ok_or_else(|| "Master playlist has no variants".to_string())?;
    base.join(&uri).map(Some).map_err(|err| err.to_string())
}

fn plan_media_playlist(text: &str, base: &Url) -> Result<HlsPlan, String> {
    let mut lines = Vec::new();
    let mut downloads: Vec<(Url, String)> = Vec::new();
    let mut known: HashMap<String, String> = HashMap::new();
    let mut segment_index = 0usize;
    let mut aux_index = 0usize;

    for raw_line in text.lines() {
        let line = raw_line.trim_end();
        if line.is_empty() {
            lines.push(String::new());
            continue;
        }

        if let Some(rest) = line.strip_prefix('#') {
            let (tag, attributes) = match rest.split_once(':') {
                Some((tag, attributes)) => (tag, attributes),
                None => (rest, ""),
            };

            match tag {
                "EXT-X-BYTERANGE" => {
                    return Err("Byte-range HLS segments are not supported".to_string());
                }
                "EXT-X-KEY" => {
                    let parts = split_parts(attributes);
                    match attribute_value(&parts, "METHOD").as_deref() {
                        Some("NONE") | None => lines.push(line.to_string()),
                        Some("AES-128") => {
                            let key_uri = attribute_value(&parts, "URI")
                                .ok_or_else(|| "HLS key has no URI".to_string())?;
                            let key_url = base.join(&key_uri).map_err(|err| err.to_string())?;
                            aux_index += 1;
                            let local_name = register_download(
                                &mut downloads,
                                &mut known,
                                key_url,
                                format!("key{aux_index}.bin"),
                            );
                            lines.push(format!(
                                "#EXT-X-KEY:{}",
                                with_local_uri(&parts, &local_name)
                            ));
                        }
                        Some(method) => {
                            return Err(format!("Unsupported HLS encryption: {method}"));
                        }
                    }
                }
                "EXT-X-MAP" => {
                    let parts = split_parts(attributes);
                    if attribute_value(&parts, "BYTERANGE").is_some() {
                        return Err("Byte-range HLS segments are not supported".to_string());
                    }
                    let map_uri = attribute_value(&parts, "URI")
                        .ok_or_else(|| "HLS init segment has no URI".to_string())?;
                    let map_url = base.join(&map_uri).map_err(|err| err.to_string())?;
                    aux_index += 1;
                    let extension = extension_of(&map_url, "mp4");
                    let local_name = register_download(
                        &mut downloads,
                        &mut known,
                        map_url,
                        format!("init{aux_index}.{extension}"),
                    );
                    lines.push(format!(
                        "#EXT-X-MAP:{}",
                        with_local_uri(&parts, &local_name)
                    ));
                }
                _ => lines.push(line.to_string()),
            }
            continue;
        }

        let segment_url = base.join(line).map_err(|err| err.to_string())?;
        let extension = extension_of(&segment_url, "bin");
        let local_name = register_download(
            &mut downloads,
            &mut known,
            segment_url,
            format!("s{segment_index:05}.{extension}"),
        );
        segment_index += 1;
        lines.push(local_name);
    }

    if segment_index == 0 {
        return Err("HLS playlist has no segments".to_string());
    }

    Ok(HlsPlan { lines, downloads })
}

async fn fetch_playlist(client: &reqwest::Client, url: &Url) -> Result<(String, Url), String> {
    let response = client
        .get(url.clone())
        .send()
        .await
        .map_err(|err| err.to_string())?;

    if !response.status().is_success() {
        return Err(format!("HTTP error {} for playlist", response.status()));
    }

    let final_url = response.url().clone();
    let text = response.text().await.map_err(|err| err.to_string())?;
    Ok((text, final_url))
}

async fn download_part(client: reqwest::Client, url: Url, path: PathBuf) -> Result<u64, String> {
    let response = client
        .get(url.clone())
        .send()
        .await
        .map_err(|err| err.to_string())?;

    if !response.status().is_success() {
        return Err(format!(
            "HTTP error {} for {}",
            response.status(),
            url.path()
        ));
    }

    match write_stream(response, &path).await? {
        0 => Err(format!("Empty HLS part: {}", url.path())),
        written => Ok(written),
    }
}

async fn download_parts(
    client: &reqwest::Client,
    downloads: &[(Url, String)],
    dir: &Path,
) -> Result<u64, String> {
    let results: Vec<Result<u64, String>> = stream::iter(downloads.iter().cloned())
        .map(|(url, local_name)| download_part(client.clone(), url, dir.join(local_name)))
        .buffer_unordered(HLS_CONCURRENCY)
        .collect()
        .await;

    let mut total = 0u64;
    for result in results {
        total += result?;
    }
    Ok(total)
}

async fn download_hls_to(playlist_url: &str, dir: &Path, name: &str) -> Result<u64, String> {
    let client = build_client()?;
    let start_url = Url::parse(playlist_url).map_err(|err| err.to_string())?;

    let (mut text, mut base) = fetch_playlist(&client, &start_url).await?;
    if let Some(variant_url) = pick_variant(&text, &base)? {
        let (variant_text, variant_base) = fetch_playlist(&client, &variant_url).await?;
        text = variant_text;
        base = variant_base;
    }

    let plan = plan_media_playlist(&text, &base)?;

    tokio::fs::create_dir_all(dir)
        .await
        .map_err(|err| err.to_string())?;

    let final_dir = dir.join(name);
    let part_dir = dir.join(format!("{name}.part"));
    let _ = tokio::fs::remove_dir_all(&part_dir).await;
    tokio::fs::create_dir_all(&part_dir)
        .await
        .map_err(|err| err.to_string())?;

    let outcome = async {
        let total = download_parts(&client, &plan.downloads, &part_dir).await?;

        let mut playlist = plan.lines.join("\n");
        playlist.push('\n');
        tokio::fs::write(part_dir.join(HLS_PLAYLIST_FILE), playlist)
            .await
            .map_err(|err| err.to_string())?;

        let _ = tokio::fs::remove_dir_all(&final_dir).await;
        tokio::fs::rename(&part_dir, &final_dir)
            .await
            .map_err(|err| err.to_string())?;
        Ok::<u64, String>(total)
    }
    .await;

    if outcome.is_err() {
        let _ = tokio::fs::remove_dir_all(&part_dir).await;
    }
    outcome
}

#[command]
#[specta::specta]
pub async fn offline_download_hls(
    app_handle: AppHandle,
    url: String,
    dir_name: String,
) -> Result<u64, String> {
    if !is_safe_file_name(&dir_name) {
        return Err(format!("Invalid directory name: {dir_name}"));
    }
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("Invalid URL scheme. Expected http(s)".to_string());
    }

    let dir = offline_dir(&app_handle)?;
    log::info!("[Offline] Downloading HLS stream {dir_name}");

    download_hls_to(&url, &dir, &dir_name)
        .await
        .map_err(|message| {
            log::error!("[Offline] HLS download of {dir_name} failed: {message}");
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
        let path = dir.join(&name);
        let removal = match tokio::fs::metadata(&path).await {
            Ok(metadata) if metadata.is_dir() => tokio::fs::remove_dir_all(&path).await,
            Ok(_) => tokio::fs::remove_file(&path).await,
            Err(err) => Err(err),
        };

        match removal {
            Ok(()) => {}
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => {}
            Err(err) => return Err(err.to_string()),
        }
    }
    Ok(())
}
