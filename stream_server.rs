use std::io::SeekFrom;
use std::path::PathBuf;
use std::sync::Arc;

use axum::body::Body;
use axum::extract::{Path, State};
use axum::http::{header, HeaderMap, Response, StatusCode};
use axum::routing::get;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use reqwest::Client;
use std::time::Duration;
use tauri::{AppHandle, Manager};
use tokio::io::{AsyncReadExt, AsyncSeekExt};
use tokio::sync::oneshot;
use tokio_util::sync::CancellationToken;

const PORT_START: u16 = 9100;
const PORT_END: u16 = 9109;

const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";

const FORWARD_HEADERS: &[header::HeaderName] = &[
    header::CONTENT_TYPE,
    header::CONTENT_LENGTH,
    header::CONTENT_RANGE,
    header::ACCEPT_RANGES,
];

pub struct StreamServerState {
    port: u16,
}

fn decode_stream_url(encoded: &str) -> Result<String, String> {
    let bytes = URL_SAFE_NO_PAD
        .decode(encoded)
        .map_err(|err| format!("Invalid base64 URL: {err}"))?;

    let url = String::from_utf8(bytes).map_err(|err| format!("Invalid UTF-8 in URL: {err}"))?;

    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("Invalid URL scheme. Expected http(s)".to_string());
    }

    Ok(url)
}

fn cors_headers(headers: &mut HeaderMap) {
    headers.insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*".parse().unwrap());
    headers.insert(
        header::ACCESS_CONTROL_ALLOW_METHODS,
        "GET, OPTIONS, HEAD".parse().unwrap(),
    );
    headers.insert(
        header::ACCESS_CONTROL_ALLOW_HEADERS,
        "Range".parse().unwrap(),
    );
    headers.insert(
        header::ACCESS_CONTROL_EXPOSE_HEADERS,
        "Content-Range, Content-Length, Accept-Ranges"
            .parse()
            .unwrap(),
    );
}

fn error_response(status: StatusCode, message: String) -> Response<Body> {
    let mut response = Response::builder()
        .status(status)
        .body(Body::from(message))
        .unwrap();
    cors_headers(response.headers_mut());
    response
}

async fn proxy_stream(
    State(client): State<Arc<Client>>,
    Path(encoded_url): Path<String>,
    headers: HeaderMap,
) -> Response<Body> {
    let url = match decode_stream_url(&encoded_url) {
        Ok(url) => url,
        Err(message) => {
            log::error!("[StreamServer] {message}");
            return error_response(StatusCode::BAD_REQUEST, message);
        }
    };

    log::debug!(
        "[StreamServer] Proxying request, range: {:?}",
        headers.get(header::RANGE)
    );

    let mut upstream_request = client.get(&url);
    if let Some(range_value) = headers.get(header::RANGE) {
        upstream_request = upstream_request.header(header::RANGE, range_value);
    }

    let upstream_response = match upstream_request.send().await {
        Ok(response) => response,
        Err(err) => {
            log::error!("[StreamServer] Request failed: {err:?}");
            return error_response(StatusCode::BAD_GATEWAY, format!("Failed to fetch: {err}"));
        }
    };

    let upstream_status = upstream_response.status();
    if !upstream_status.is_success() && upstream_status != StatusCode::PARTIAL_CONTENT {
        log::error!("[StreamServer] Streaming service returned: {upstream_status}");
        return error_response(
            StatusCode::from_u16(upstream_status.as_u16()).unwrap_or(StatusCode::BAD_GATEWAY),
            format!("Streaming service returned error: {upstream_status}"),
        );
    }

    let upstream_headers = upstream_response.headers().clone();
    let body = Body::from_stream(upstream_response.bytes_stream());

    let mut response = Response::builder()
        .status(upstream_status.as_u16())
        .body(body)
        .unwrap();

    for name in FORWARD_HEADERS {
        if let Some(value) = upstream_headers.get(name) {
            response.headers_mut().insert(name, value.clone());
        }
    }

    cors_headers(response.headers_mut());
    response
}

fn parse_range(value: &str, total: u64) -> Option<(u64, u64)> {
    let spec = value.strip_prefix("bytes=")?;
    let (start_part, end_part) = spec.split_once('-')?;

    if start_part.is_empty() {
        let suffix: u64 = end_part.parse().ok()?;
        if suffix == 0 {
            return None;
        }
        return Some((total.saturating_sub(suffix), total - 1));
    }

    let start: u64 = start_part.parse().ok()?;
    let end = if end_part.is_empty() {
        total - 1
    } else {
        end_part.parse::<u64>().ok()?.min(total - 1)
    };

    if start > end || start >= total {
        None
    } else {
        Some((start, end))
    }
}

fn offline_content_type(path: &std::path::Path) -> String {
    let extension = path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.to_ascii_lowercase());

    match extension.as_deref() {
        Some("m3u8") => "application/vnd.apple.mpegurl".to_string(),
        Some("ts") => "video/mp2t".to_string(),
        Some("m4s") | Some("mp4") => "video/mp4".to_string(),
        Some("bin") => "application/octet-stream".to_string(),
        _ => mime_guess::from_path(path)
            .first_or_octet_stream()
            .to_string(),
    }
}

async fn serve_offline(
    State(offline_dir): State<Arc<PathBuf>>,
    Path(relative_path): Path<String>,
    headers: HeaderMap,
) -> Response<Body> {
    let segments: Vec<&str> = relative_path.split('/').collect();
    let is_valid = segments.len() <= 2
        && segments
            .iter()
            .all(|segment| crate::offline::is_safe_file_name(segment));
    if !is_valid {
        return error_response(StatusCode::BAD_REQUEST, "Invalid file name".to_string());
    }

    let mut path = offline_dir.as_ref().clone();
    for segment in &segments {
        path.push(segment);
    }
    let file_name = relative_path.clone();
    let mut file = match tokio::fs::File::open(&path).await {
        Ok(file) => file,
        Err(err) => {
            log::error!("[StreamServer] Offline file {file_name} not available: {err}");
            return error_response(StatusCode::NOT_FOUND, format!("Offline file not found: {err}"));
        }
    };

    let total = match file.metadata().await {
        Ok(metadata) => metadata.len(),
        Err(err) => {
            return error_response(StatusCode::INTERNAL_SERVER_ERROR, err.to_string());
        }
    };
    if total == 0 {
        return error_response(StatusCode::NOT_FOUND, "Offline file is empty".to_string());
    }

    let requested_range = headers
        .get(header::RANGE)
        .and_then(|value| value.to_str().ok());

    let (status, start, end) = match requested_range {
        None => (StatusCode::OK, 0, total - 1),
        Some(value) => match parse_range(value, total) {
            Some((start, end)) => (StatusCode::PARTIAL_CONTENT, start, end),
            None => {
                let mut response = Response::builder()
                    .status(StatusCode::RANGE_NOT_SATISFIABLE)
                    .header(header::CONTENT_RANGE, format!("bytes */{total}"))
                    .body(Body::empty())
                    .unwrap();
                cors_headers(response.headers_mut());
                return response;
            }
        },
    };

    let length = end - start + 1;
    if start > 0 {
        if let Err(err) = file.seek(SeekFrom::Start(start)).await {
            return error_response(StatusCode::INTERNAL_SERVER_ERROR, err.to_string());
        }
    }

    let mut buffer = vec![0u8; length as usize];
    if let Err(err) = file.read_exact(&mut buffer).await {
        return error_response(StatusCode::INTERNAL_SERVER_ERROR, err.to_string());
    }

    let content_type = offline_content_type(&path);

    let mut response = Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, content_type)
        .header(header::CONTENT_LENGTH, length.to_string())
        .header(header::ACCEPT_RANGES, "bytes")
        .body(Body::from(buffer))
        .unwrap();

    if status == StatusCode::PARTIAL_CONTENT {
        response.headers_mut().insert(
            header::CONTENT_RANGE,
            format!("bytes {start}-{end}/{total}").parse().unwrap(),
        );
    }

    cors_headers(response.headers_mut());
    response
}

async fn options_handler() -> Response<Body> {
    let mut response = Response::builder()
        .status(StatusCode::NO_CONTENT)
        .body(Body::empty())
        .unwrap();
    cors_headers(response.headers_mut());
    response
}

async fn start_server(
    client: Arc<Client>,
    offline_dir: PathBuf,
    ready: oneshot::Sender<Result<u16, String>>,
) {
    let cancellation_token = CancellationToken::new();

    let proxy_router = axum::Router::new()
        .route(
            "/stream/{encoded_url}",
            get(proxy_stream).options(options_handler),
        )
        .with_state(client);

    let offline_router = axum::Router::new()
        .route(
            "/offline/{*path}",
            get(serve_offline).options(options_handler),
        )
        .with_state(Arc::new(offline_dir));

    let router = proxy_router.merge(offline_router);

    let tcp_listener =
        match crate::net::bind_first_available_port("127.0.0.1", PORT_START, PORT_END).await {
            Ok(listener) => listener,
            Err(message) => {
                log::error!("Failed to bind stream server: {message}");
                let _ = ready.send(Err(message));
                return;
            }
        };

    let bound_port = tcp_listener.local_addr().unwrap().port();
    log::info!("Stream proxy listening on http://127.0.0.1:{bound_port}");
    let _ = ready.send(Ok(bound_port));

    let _ = axum::serve(tcp_listener, router)
        .with_graceful_shutdown(async move {
            cancellation_token.cancelled().await;
        })
        .await;

    log::info!("Stream server stopped");
}

pub fn init_stream_server(app_handle: AppHandle) {
    let client = Arc::new(
        Client::builder()
            .user_agent(USER_AGENT)
            .read_timeout(Duration::from_secs(300))
            .connect_timeout(Duration::from_secs(30))
            .build()
            .expect("Failed to create HTTP client for stream server"),
    );

    let offline_dir = crate::offline::offline_dir(&app_handle).unwrap_or_else(|message| {
        log::error!("[StreamServer] Failed to resolve offline directory: {message}");
        std::env::temp_dir().join("nuclear-offline")
    });

    let (ready_tx, ready_rx) = oneshot::channel();
    tauri::async_runtime::spawn(start_server(client, offline_dir, ready_tx));

    let handle = app_handle.clone();
    tauri::async_runtime::spawn(async move {
        match ready_rx.await {
            Ok(Ok(port)) => {
                log::info!("Stream server ready on port {port}");
                handle.manage(StreamServerState { port });
            }
            Ok(Err(message)) => {
                log::error!("Stream server failed to start: {message}");
            }
            Err(_) => {
                log::error!("Stream server task exited before reporting ready");
            }
        }
    });
}

#[tauri::command]
#[specta::specta]
pub fn stream_server_port(state: tauri::State<'_, StreamServerState>) -> u16 {
    state.port
}
