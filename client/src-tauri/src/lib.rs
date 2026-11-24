mod overlay;
mod platform;
mod remote_assist;
mod window_state;

use std::sync::atomic::Ordering;
use tauri::{
    Emitter, Manager, WindowEvent,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    if let Some(url) = window_state::extract_deep_link_from_args(std::env::args())
        && let Ok(mut g) = window_state::pending_deep_link_store().lock()
    {
        *g = Some(url);
    }

    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder
            .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.unminimize();
                    let _ = win.show();
                    let _ = win.set_focus();
                }
                if let Some(url) = window_state::extract_deep_link_from_args(argv) {
                    if let Ok(mut g) = window_state::pending_deep_link_store().lock() {
                        *g = Some(url.clone());
                    }
                    let _ = app.emit("deep-link-url", url);
                }
            }))
            .plugin(tauri_plugin_updater::Builder::new().build())
            .plugin(tauri_plugin_global_shortcut::Builder::new().build());
    }

    builder =
        builder
            .plugin(tauri_plugin_process::init())
            .invoke_handler(tauri::generate_handler![
                platform::detect_running_game,
                platform::request_window_attention,
                platform::get_autostart,
                platform::set_autostart,
                platform::focus_main_window,
                platform::set_taskbar_badge,
                platform::set_global_ptt,
                platform::get_platform_capabilities,
                platform::update_tray_state,
                platform::list_capturable_windows,
                overlay::toggle_overlay_window,
                overlay::set_overlay_window,
                overlay::get_overlay_window_state,
                overlay::position_overlay_window,
                overlay::set_overlay_ignore_cursor,
                overlay::resize_overlay_window,
                remote_assist::simulate_remote_input,
                remote_assist::get_display_monitors,
                remote_assist::set_remote_assist_killswitch,
                remote_assist::set_remote_assist_safe_mode,
                remote_assist::get_remote_assist_safe_mode,
                remote_assist::set_remote_assist_host_hud,
                remote_assist::push_remote_assist_overlay_event,
                window_state::get_close_to_tray,
                window_state::set_close_to_tray,
                window_state::take_pending_deep_link
            ]);

    builder
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            #[cfg(target_os = "windows")]
            window_state::register_cakma_protocol_windows();

            let saved_state = window_state::load_window_state(app.handle());
            window_state::CLOSE_TO_TRAY.store(saved_state.close_to_tray, Ordering::Relaxed);
            if let Some(win) = app.get_webview_window("main") {
                let w = saved_state.width.clamp(940, 7680);
                let h = saved_state.height.clamp(500, 4320);
                let _ = win.set_size(tauri::Size::Physical(tauri::PhysicalSize::new(w, h)));
                if let (Some(x), Some(y)) = (saved_state.x, saved_state.y)
                    && (-3200..=6400).contains(&x)
                    && (-1600..=3600).contains(&y)
                {
                    let _ = win.set_position(tauri::Position::Physical(
                        tauri::PhysicalPosition::new(x, y),
                    ));
                }
                if saved_state.maximized {
                    let _ = win.maximize();
                }
            }

            #[cfg(desktop)]
            {
                let show_item =
                    MenuItem::with_id(app, "show", "Çakma'yı Göster", true, None::<&str>)?;
                let mute_item = MenuItem::with_id(
                    app,
                    "toggle_mute",
                    "Mikrofonu Kapat / Aç",
                    true,
                    None::<&str>,
                )?;
                let deafen_item = MenuItem::with_id(
                    app,
                    "toggle_deafen",
                    "Kulaklığı Sağırlaştır / Aç",
                    true,
                    None::<&str>,
                )?;
                let leave_voice_item = MenuItem::with_id(
                    app,
                    "leave_voice",
                    "Ses Odasından Ayrıl",
                    true,
                    None::<&str>,
                )?;
                let status_online_item = MenuItem::with_id(
                    app,
                    "status_online",
                    "Durum: Çevrimiçi",
                    true,
                    None::<&str>,
                )?;
                let status_idle_item =
                    MenuItem::with_id(app, "status_idle", "Durum: Boşta", true, None::<&str>)?;
                let status_dnd_item = MenuItem::with_id(
                    app,
                    "status_dnd",
                    "Durum: Rahatsız Etme",
                    true,
                    None::<&str>,
                )?;
                let quit_item =
                    MenuItem::with_id(app, "quit", "Tamamen Kapat", true, None::<&str>)?;
                let menu = Menu::with_items(
                    app,
                    &[
                        &show_item,
                        &mute_item,
                        &deafen_item,
                        &leave_voice_item,
                        &status_online_item,
                        &status_idle_item,
                        &status_dnd_item,
                        &quit_item,
                    ],
                )?;

                let mut tray_builder = TrayIconBuilder::with_id("main-tray")
                    .menu(&menu)
                    .tooltip("Çakma")
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "show" => {
                            if let Some(win) = app.get_webview_window("main") {
                                let _ = win.unminimize();
                                let _ = win.show();
                                let _ = win.set_focus();
                            }
                        }
                        "toggle_mute" => {
                            let _ = app.emit("tray-toggle-mute", ());
                        }
                        "toggle_deafen" => {
                            let _ = app.emit("tray-toggle-deafen", ());
                        }
                        "leave_voice" => {
                            let _ = app.emit("tray-leave-voice", ());
                        }
                        "status_online" => {
                            let _ = app.emit("tray-set-status", "online");
                        }
                        "status_idle" => {
                            let _ = app.emit("tray-set-status", "idle");
                        }
                        "status_dnd" => {
                            let _ = app.emit("tray-set-status", "dnd");
                        }
                        "quit" => {
                            remote_assist::close_remote_assist_windows(app);
                            app.exit(0);
                        }
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event
                        {
                            let app = tray.app_handle();
                            if let Some(win) = app.get_webview_window("main") {
                                let _ = win.unminimize();
                                let _ = win.show();
                                let _ = win.set_focus();
                            }
                        }
                    });

                if let Some(icon) = app.default_window_icon() {
                    tray_builder = tray_builder.icon(icon.clone());
                }

                let _tray = tray_builder.build(app)?;
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main" {
                match event {
                    WindowEvent::Resized(_) | WindowEvent::Moved(_) => {
                        if let Some(win) = window.app_handle().get_webview_window("main")
                            && !win.is_minimized().unwrap_or(false)
                        {
                            let now_ms = std::time::SystemTime::now()
                                .duration_since(std::time::UNIX_EPOCH)
                                .map(|d| d.as_millis() as u64)
                                .unwrap_or(0);
                            let prev_ms = window_state::LAST_WIN_SAVE_MS.load(Ordering::Relaxed);
                            if now_ms.saturating_sub(prev_ms) >= 350 {
                                window_state::LAST_WIN_SAVE_MS.store(now_ms, Ordering::Relaxed);
                                window_state::capture_and_persist_window_state(&win);
                            }
                        }
                    }
                    WindowEvent::CloseRequested { api, .. } => {
                        if let Some(win) = window.app_handle().get_webview_window("main") {
                            window_state::capture_and_persist_window_state(&win);
                        }
                        if window_state::CLOSE_TO_TRAY.load(Ordering::Relaxed) {
                            api.prevent_close();
                            let _ = window.hide();
                        } else {
                            window.app_handle().exit(0);
                        }
                    }
                    _ => {}
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
