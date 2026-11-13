use tauri::{
  menu::{Menu, MenuItem},
  tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
  Emitter, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};

#[tauri::command]
fn detect_running_game() -> Option<String> {
  #[cfg(target_os = "windows")]
  {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    let output = std::process::Command::new("tasklist")
      .args(["/FO", "CSV", "/NH"])
      .creation_flags(CREATE_NO_WINDOW)
      .output()
      .ok()?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_lowercase();
    let known_apps: &[(&str, &str)] = &[
      ("valorant-win64-shipping.exe", "VALORANT"),
      ("cs2.exe", "Counter-Strike 2"),
      ("league of legends.exe", "League of Legends"),
      ("leagueclient.exe", "League of Legends"),
      ("gta5.exe", "Grand Theft Auto V"),
      ("fivem.exe", "FiveM (GTA RP)"),
      ("minecraft.exe", "Minecraft"),
      ("javaw.exe", "Minecraft"),
      ("fortniteclient-win64-shipping.exe", "Fortnite"),
      ("r5apex.exe", "Apex Legends"),
      ("rocketleague.exe", "Rocket League"),
      ("dota2.exe", "Dota 2"),
      ("overwatch.exe", "Overwatch 2"),
      ("cyberpunk2077.exe", "Cyberpunk 2077"),
      ("eldenring.exe", "Elden Ring"),
      ("rustclient.exe", "Rust"),
      ("tslgame.exe", "PUBG: Battlegrounds"),
      ("obs64.exe", "OBS Studio"),
      ("spotify.exe", "Spotify"),
      ("code.exe", "Visual Studio Code"),
    ];

    for (proc_name, display_name) in known_apps {
      if stdout.contains(proc_name) {
        return Some((*display_name).to_string());
      }
    }
  }
  None
}

#[tauri::command]
fn toggle_overlay_window(app: tauri::AppHandle) -> Result<bool, String> {
  if let Some(win) = app.get_webview_window("overlay") {
    win.close().map_err(|e| e.to_string())?;
    return Ok(false);
  }

  WebviewWindowBuilder::new(&app, "overlay", WebviewUrl::App("index.html?overlay=1".into()))
    .title("Çakma Overlay")
    .inner_size(270.0, 220.0)
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(true)
    .build()
    .map_err(|e| e.to_string())?;

  Ok(true)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let mut builder = tauri::Builder::default()
    .plugin(tauri_plugin_process::init())
    .invoke_handler(tauri::generate_handler![
      detect_running_game,
      toggle_overlay_window
    ]);

  #[cfg(desktop)]
  {
    builder = builder
      .plugin(tauri_plugin_updater::Builder::new().build())
      .plugin(tauri_plugin_global_shortcut::Builder::new().build());
  }

  builder
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      #[cfg(desktop)]
      {
        let show_item = MenuItem::with_id(app, "show", "Çakma'yı Göster", true, None::<&str>)?;
        let mute_item = MenuItem::with_id(app, "toggle_mute", "Mikrofonu Kapat / Aç", true, None::<&str>)?;
        let quit_item = MenuItem::with_id(app, "quit", "Tamamen Kapat", true, None::<&str>)?;
        let menu = Menu::with_items(app, &[&show_item, &mute_item, &quit_item])?;

        let mut tray_builder = TrayIconBuilder::new()
          .menu(&menu)
          .tooltip("Çakma")
          .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
              if let Some(win) = app.get_webview_window("main") {
                let _ = win.show();
                let _ = win.set_focus();
              }
            }
            "toggle_mute" => {
              let _ = app.emit("tray-toggle-mute", ());
            }
            "quit" => {
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
        if let WindowEvent::CloseRequested { api, .. } = event {
          api.prevent_close();
          let _ = window.hide();
        }
      }
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
