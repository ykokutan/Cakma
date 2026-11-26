#[cfg(desktop)]
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

#[cfg(desktop)]
fn open_overlay_window(app: &tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("overlay") {
        let _ = win.show();
        return Ok(());
    }

    WebviewWindowBuilder::new(app, "overlay", WebviewUrl::App("overlay.html".into()))
        .title("Çakma Overlay")
        .inner_size(290.0, 260.0)
        .min_inner_size(220.0, 140.0)
        .position(24.0, 24.0)
        .transparent(true)
        .background_color(tauri::window::Color(0, 0, 0, 0))
        .shadow(false)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(true)
        .build()
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn toggle_overlay_window(app: tauri::AppHandle) -> Result<bool, String> {
    #[cfg(desktop)]
    {
        if let Some(win) = app.get_webview_window("overlay") {
            win.close().map_err(|e| e.to_string())?;
            return Ok(false);
        }

        open_overlay_window(&app)?;
        Ok(true)
    }
    #[cfg(not(desktop))]
    {
        let _ = app;
        Ok(false)
    }
}

#[tauri::command]
pub async fn set_overlay_window(app: tauri::AppHandle, enabled: bool) -> Result<bool, String> {
    #[cfg(desktop)]
    {
        if enabled {
            open_overlay_window(&app)?;
            Ok(true)
        } else {
            if let Some(win) = app.get_webview_window("overlay") {
                win.close().map_err(|e| e.to_string())?;
            }
            Ok(false)
        }
    }
    #[cfg(not(desktop))]
    {
        let _ = (app, enabled);
        Ok(false)
    }
}

#[tauri::command]
pub fn get_overlay_window_state(app: tauri::AppHandle) -> bool {
    #[cfg(desktop)]
    {
        app.get_webview_window("overlay").is_some()
    }
    #[cfg(not(desktop))]
    {
        let _ = app;
        false
    }
}

#[tauri::command]
pub async fn position_overlay_window(app: tauri::AppHandle, corner: String) -> Result<(), String> {
    #[cfg(desktop)]
    if let Some(overlay) = app.get_webview_window("overlay") {
        let margin = 16i32;
        let overlay_w = 290i32;
        let overlay_h = 260i32;
        let (sw, sh) = if let Ok(Some(mon)) = overlay.primary_monitor() {
            let size = mon.size();
            let scale = mon.scale_factor();
            (
                (size.width as f64 / scale) as i32,
                (size.height as f64 / scale) as i32,
            )
        } else {
            (1920, 1080)
        };
        let (x, y) = match corner.as_str() {
            "top-right" => ((sw - overlay_w - margin).max(0), margin),
            "bottom-left" => (margin, (sh - overlay_h - 48).max(0)),
            "bottom-right" => (
                (sw - overlay_w - margin).max(0),
                (sh - overlay_h - 48).max(0),
            ),
            _ => (margin, margin),
        };
        let _ = overlay.set_position(tauri::Position::Logical(tauri::LogicalPosition::new(
            x as f64, y as f64,
        )));
    }
    #[cfg(not(desktop))]
    let _ = (app, corner);
    Ok(())
}

#[tauri::command]
pub async fn set_overlay_ignore_cursor(app: tauri::AppHandle, ignore: bool) -> Result<(), String> {
    #[cfg(desktop)]
    if let Some(overlay) = app.get_webview_window("overlay") {
        overlay
            .set_ignore_cursor_events(ignore)
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(desktop))]
    let _ = (app, ignore);
    Ok(())
}

#[tauri::command]
pub async fn resize_overlay_window(
    app: tauri::AppHandle,
    width: f64,
    height: f64,
) -> Result<(), String> {
    #[cfg(desktop)]
    if let Some(overlay) = app.get_webview_window("overlay") {
        let w = width.clamp(220.0, 460.0);
        let h = height.clamp(140.0, 480.0);
        overlay
            .set_size(tauri::Size::Logical(tauri::LogicalSize::new(w, h)))
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(desktop))]
    let _ = (app, width, height);
    Ok(())
}
