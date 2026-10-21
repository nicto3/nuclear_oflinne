use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde_json::json;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{
    command, AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, Rect, WebviewUrl,
    WebviewWindow, WebviewWindowBuilder, Window, WindowEvent,
};

const MAIN_WINDOW: &str = "main";
const MINI_WINDOW: &str = "miniplayer";
const MINI_WIDTH: f64 = 368.0;
const MINI_HEIGHT: f64 = 236.0;
const SCREEN_MARGIN: f64 = 4.0;
const REOPEN_GUARD: Duration = Duration::from_millis(350);

static LAST_AUTO_HIDE: Mutex<Option<Instant>> = Mutex::new(None);

fn emit_command(app: &AppHandle, command: &str) {
    if let Err(err) = app.emit("miniplayer:command", json!({ "type": command })) {
        log::error!("[Tray] Failed to emit command {command}: {err}");
    }
}

fn emit_visibility(app: &AppHandle, visible: bool) {
    if let Err(err) = app.emit("miniplayer:visibility", visible) {
        log::error!("[Tray] Failed to emit mini player visibility: {err}");
    }
}

fn hide_mini(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MINI_WINDOW) {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
            emit_visibility(app, false);
        }
    }
}

fn show_main(app: &AppHandle) {
    hide_mini(app);
    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn recently_auto_hidden() -> bool {
    LAST_AUTO_HIDE
        .lock()
        .ok()
        .and_then(|guard| *guard)
        .is_some_and(|instant| instant.elapsed() < REOPEN_GUARD)
}

fn build_mini(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    WebviewWindowBuilder::new(app, MINI_WINDOW, WebviewUrl::App("index.html".into()))
        .title("Nuclear mini player")
        .inner_size(MINI_WIDTH, MINI_HEIGHT)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .transparent(true)
        .shadow(false)
        .visible(false)
        .build()
}

fn position_near_tray(app: &AppHandle, window: &WebviewWindow, rect: &Rect) {
    let icon_position = rect.position.to_physical::<f64>(1.0);
    let icon_size = rect.size.to_physical::<f64>(1.0);
    let center_x = icon_position.x + icon_size.width / 2.0;
    let center_y = icon_position.y + icon_size.height / 2.0;

    let monitor = app
        .available_monitors()
        .ok()
        .and_then(|monitors| {
            monitors.into_iter().find(|monitor| {
                let position = monitor.position();
                let size = monitor.size();
                center_x >= position.x as f64
                    && center_x < position.x as f64 + size.width as f64
                    && center_y >= position.y as f64
                    && center_y < position.y as f64 + size.height as f64
            })
        })
        .or_else(|| window.primary_monitor().ok().flatten());

    let Some(monitor) = monitor else {
        return;
    };

    let scale = monitor.scale_factor();
    let width = MINI_WIDTH * scale;
    let height = MINI_HEIGHT * scale;
    let margin = SCREEN_MARGIN * scale;
    let monitor_position = monitor.position();
    let monitor_size = monitor.size();

    let min_x = monitor_position.x as f64 + margin;
    let max_x = (monitor_position.x as f64 + monitor_size.width as f64 - width - margin).max(min_x);
    let x = (center_x - width / 2.0).clamp(min_x, max_x);

    let monitor_middle_y = monitor_position.y as f64 + monitor_size.height as f64 / 2.0;
    let y = if center_y > monitor_middle_y {
        icon_position.y - height - margin
    } else {
        icon_position.y + icon_size.height + margin
    };

    let _ = window.set_size(PhysicalSize::new(width.round() as u32, height.round() as u32));
    let _ = window.set_position(PhysicalPosition::new(x.round() as i32, y.round() as i32));
}

fn toggle_mini(app: &AppHandle, rect: &Rect) {
    let existing = app.get_webview_window(MINI_WINDOW);

    if let Some(window) = &existing {
        if window.is_visible().unwrap_or(false) {
            hide_mini(app);
            return;
        }
    }
    if recently_auto_hidden() {
        return;
    }

    let window = match existing {
        Some(window) => window,
        None => match build_mini(app) {
            Ok(window) => window,
            Err(err) => {
                log::error!("[Tray] Failed to create mini player window: {err}");
                return;
            }
        },
    };

    position_near_tray(app, &window, rect);
    let _ = window.show();
    let _ = window.set_focus();
    emit_visibility(app, true);
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Show Nuclear", true, None::<&str>)?;
    let toggle = MenuItem::with_id(app, "toggle", "Play / Pause", true, None::<&str>)?;
    let previous = MenuItem::with_id(app, "previous", "Previous track", true, None::<&str>)?;
    let next = MenuItem::with_id(app, "next", "Next track", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &toggle, &previous, &next, &separator, &quit])?;

    let mut builder = TrayIconBuilder::with_id("nuclear-tray")
        .tooltip("Nuclear")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => show_main(app),
            "toggle" => emit_command(app, "toggle"),
            "previous" => emit_command(app, "previous"),
            "next" => emit_command(app, "next"),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| match event {
            TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                rect,
                ..
            } => toggle_mini(tray.app_handle(), &rect),
            TrayIconEvent::DoubleClick {
                button: MouseButton::Left,
                ..
            } => show_main(tray.app_handle()),
            _ => {}
        });

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }

    builder.build(app)?;
    Ok(())
}

pub fn init_tray(app_handle: AppHandle) {
    if let Err(err) = build_tray(&app_handle) {
        log::error!("[Tray] Failed to create tray icon: {err}");
    }
}

pub fn handle_window_event(window: &Window, event: &WindowEvent) {
    match (window.label(), event) {
        (MAIN_WINDOW, WindowEvent::CloseRequested { api, .. }) => {
            api.prevent_close();
            let _ = window.hide();
            hide_mini(window.app_handle());
        }
        (MINI_WINDOW, WindowEvent::Focused(false)) => {
            if window.is_visible().unwrap_or(false) {
                let _ = window.hide();
                if let Ok(mut guard) = LAST_AUTO_HIDE.lock() {
                    *guard = Some(Instant::now());
                }
                emit_visibility(window.app_handle(), false);
            }
        }
        _ => {}
    }
}

#[command]
#[specta::specta]
pub fn show_main_window(app_handle: AppHandle) {
    show_main(&app_handle);
}

#[command]
#[specta::specta]
pub fn hide_mini_player(app_handle: AppHandle) {
    hide_mini(&app_handle);
}
