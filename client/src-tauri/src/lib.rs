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
      ("valorant.exe", "VALORANT"),
      ("cs2.exe", "Counter-Strike 2"),
      ("csgo.exe", "Counter-Strike"),
      ("league of legends.exe", "League of Legends"),
      ("leagueclientux.exe", "League of Legends"),
      ("gta5.exe", "Grand Theft Auto V"),
      ("gtav_enhanced.exe", "Grand Theft Auto V"),
      ("gtaprocess.exe", "FiveM (GTA RP)"),
      ("fivem.exe", "FiveM (GTA RP)"),
      ("rdr2.exe", "Red Dead Redemption 2"),
      ("minecraft.windows.exe", "Minecraft"),
      ("minecraft.exe", "Minecraft"),
      ("javaw.exe", "Minecraft"),
      ("fortniteclient-win64-shipping.exe", "Fortnite"),
      ("r5apex.exe", "Apex Legends"),
      ("r5apex_dx12.exe", "Apex Legends"),
      ("rocketleague.exe", "Rocket League"),
      ("dota2.exe", "Dota 2"),
      ("overwatch.exe", "Overwatch 2"),
      ("cyberpunk2077.exe", "Cyberpunk 2077"),
      ("eldenring.exe", "Elden Ring"),
      ("rustclient.exe", "Rust"),
      ("tslgame.exe", "PUBG: Battlegrounds"),
      ("robloxplayerbeta.exe", "Roblox"),
      ("fc25.exe", "EA SPORTS FC 25"),
      ("fc24.exe", "EA SPORTS FC 24"),
      ("fifa23.exe", "FIFA 23"),
      ("helldivers2.exe", "Helldivers 2"),
      ("palworld-win64-shipping.exe", "Palworld"),
      ("bg3.exe", "Baldur's Gate 3"),
      ("bg3_dx11.exe", "Baldur's Gate 3"),
      ("witcher3.exe", "The Witcher 3"),
      ("escapefromtarkov.exe", "Escape from Tarkov"),
      ("rainbowsix.exe", "Rainbow Six Siege"),
      ("rainbowsix_vulkan.exe", "Rainbow Six Siege"),
      ("deadbydaylight-win64-shipping.exe", "Dead by Daylight"),
      ("phasmophobia.exe", "Phasmophobia"),
      ("lethal company.exe", "Lethal Company"),
      ("among us.exe", "Among Us"),
      ("eurotrucks2.exe", "Euro Truck Simulator 2"),
      ("amtrucks.exe", "American Truck Simulator"),
      ("genshinimpact.exe", "Genshin Impact"),
      ("zenlesszonezero.exe", "Zenless Zone Zero"),
      ("terraria.exe", "Terraria"),
      ("stardew valley.exe", "Stardew Valley"),
      ("metin2client.exe", "Metin2"),
      ("knightonline.exe", "Knight Online"),
      ("obs64.exe", "OBS Studio"),
      ("spotify.exe", "Spotify"),
      ("vlc.exe", "VLC Media Player"),
      ("code.exe", "Visual Studio Code"),
    ];

    for (proc_name, display_name) in known_apps {
      if stdout.contains(proc_name) {
        return Some((*display_name).to_string());
      }
    }
  }

  #[cfg(target_os = "macos")]
  {
    let output = std::process::Command::new("ps")
      .args(["-eo", "comm"])
      .output()
      .ok()?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_lowercase();
    let known_apps: &[(&str, &str)] = &[
      ("league of legends", "League of Legends"),
      ("cs2", "Counter-Strike 2"),
      ("dota2", "Dota 2"),
      ("minecraft", "Minecraft"),
      ("obs", "OBS Studio"),
      ("spotify", "Spotify"),
      ("visual studio code", "Visual Studio Code"),
      ("code helper", "Visual Studio Code"),
    ];

    for (proc_name, display_name) in known_apps {
      if stdout.contains(proc_name) {
        return Some((*display_name).to_string());
      }
    }
  }
  None
}

fn open_overlay_window(app: &tauri::AppHandle) -> Result<(), String> {
  if app.get_webview_window("overlay").is_some() {
    return Ok(());
  }

  WebviewWindowBuilder::new(app, "overlay", WebviewUrl::App("index.html?overlay=1".into()))
    .title("Çakma Overlay")
    .inner_size(290.0, 260.0)
    .min_inner_size(220.0, 150.0)
    .position(24.0, 24.0)
    .background_color(tauri::window::Color(11, 13, 20, 255))
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(true)
    .build()
    .map_err(|e| e.to_string())?;

  Ok(())
}

#[tauri::command]
fn toggle_overlay_window(app: tauri::AppHandle) -> Result<bool, String> {
  if let Some(win) = app.get_webview_window("overlay") {
    win.close().map_err(|e| e.to_string())?;
    return Ok(false);
  }

  open_overlay_window(&app)?;
  Ok(true)
}

#[tauri::command]
fn set_overlay_window(app: tauri::AppHandle, enabled: bool) -> Result<bool, String> {
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

#[tauri::command]
fn get_overlay_window_state(app: tauri::AppHandle) -> bool {
  app.get_webview_window("overlay").is_some()
}

#[derive(serde::Deserialize)]
struct RemoteInputPayload {
  kind: String, // "move" | "mousedown" | "mouseup" | "wheel" | "keydown" | "keyup"
  x: Option<f64>,
  y: Option<f64>,
  button: Option<u8>, // 0=left, 1=middle, 2=right
  delta_y: Option<f64>,
  key: Option<String>,
  code: Option<String>,
}

#[cfg(target_os = "windows")]
mod win_input {
  #[link(name = "user32")]
  unsafe extern "system" {
    pub fn GetSystemMetrics(nIndex: i32) -> i32;
    pub fn SetCursorPos(x: i32, y: i32) -> i32;
    pub fn mouse_event(dwFlags: u32, dx: i32, dy: i32, dwData: i32, dwExtraInfo: usize);
    pub fn keybd_event(bVk: u8, bScan: u8, dwFlags: u32, dwExtraInfo: usize);
    pub fn VkKeyScanW(ch: u16) -> i16;
  }

  pub const SM_CXSCREEN: i32 = 0;
  pub const SM_CYSCREEN: i32 = 1;
  pub const SM_XVIRTUALSCREEN: i32 = 76;
  pub const SM_YVIRTUALSCREEN: i32 = 77;
  pub const SM_CXVIRTUALSCREEN: i32 = 78;
  pub const SM_CYVIRTUALSCREEN: i32 = 79;
  pub const MOUSEEVENTF_MOVE: u32 = 0x0001;
  pub const MOUSEEVENTF_LEFTDOWN: u32 = 0x0002;
  pub const MOUSEEVENTF_LEFTUP: u32 = 0x0004;
  pub const MOUSEEVENTF_RIGHTDOWN: u32 = 0x0008;
  pub const MOUSEEVENTF_RIGHTUP: u32 = 0x0010;
  pub const MOUSEEVENTF_MIDDLEDOWN: u32 = 0x0020;
  pub const MOUSEEVENTF_MIDDLEUP: u32 = 0x0040;
  pub const MOUSEEVENTF_WHEEL: u32 = 0x0800;
  pub const MOUSEEVENTF_ABSOLUTE: u32 = 0x8000;
  pub const KEYEVENTF_KEYUP: u32 = 0x0002;
}

#[cfg(target_os = "windows")]
fn map_web_key_to_vk(key: &str, code: &str) -> Option<u8> {
  match code {
    "Backspace" => Some(0x08),
    "Tab" => Some(0x09),
    "Enter" | "NumpadEnter" => Some(0x0D),
    "ShiftLeft" | "ShiftRight" => Some(0x10),
    "ControlLeft" | "ControlRight" => Some(0x11),
    "AltLeft" | "AltRight" => Some(0x12),
    "Pause" => Some(0x13),
    "CapsLock" => Some(0x14),
    "Escape" => Some(0x1B),
    "Space" => Some(0x20),
    "PageUp" => Some(0x21),
    "PageDown" => Some(0x22),
    "End" => Some(0x23),
    "Home" => Some(0x24),
    "ArrowLeft" => Some(0x25),
    "ArrowUp" => Some(0x26),
    "ArrowRight" => Some(0x27),
    "ArrowDown" => Some(0x28),
    "Insert" => Some(0x2D),
    "Delete" => Some(0x2E),
    "MetaLeft" | "MetaRight" => Some(0x5B),
    "F1" => Some(0x70),
    "F2" => Some(0x71),
    "F3" => Some(0x72),
    "F4" => Some(0x73),
    "F5" => Some(0x74),
    "F6" => Some(0x75),
    "F7" => Some(0x76),
    "F8" => Some(0x77),
    "F9" => Some(0x78),
    "F10" => Some(0x79),
    "F11" => Some(0x7A),
    "F12" => Some(0x7B),
    _ => {
      if let Some(ch) = key.chars().next() {
        if key.chars().count() == 1 {
          let vk = unsafe { win_input::VkKeyScanW(ch as u16) };
          if vk != -1 {
            return Some((vk & 0xFF) as u8);
          }
        }
      }
      None
    }
  }
}

#[tauri::command]
fn simulate_remote_input(payload: RemoteInputPayload) -> Result<(), String> {
  #[cfg(target_os = "windows")]
  {
    unsafe {
      let virt_w = win_input::GetSystemMetrics(win_input::SM_CXVIRTUALSCREEN);
      let virt_h = win_input::GetSystemMetrics(win_input::SM_CYVIRTUALSCREEN);
      let virt_x = if virt_w > 0 { win_input::GetSystemMetrics(win_input::SM_XVIRTUALSCREEN) } else { 0 };
      let virt_y = if virt_h > 0 { win_input::GetSystemMetrics(win_input::SM_YVIRTUALSCREEN) } else { 0 };
      let screen_w = if virt_w > 0 { virt_w } else { win_input::GetSystemMetrics(win_input::SM_CXSCREEN).max(1) };
      let screen_h = if virt_h > 0 { virt_h } else { win_input::GetSystemMetrics(win_input::SM_CYSCREEN).max(1) };

      if let (Some(nx), Some(ny)) = (payload.x, payload.y) {
        let clamped_x = nx.clamp(0.0, 1.0);
        let clamped_y = ny.clamp(0.0, 1.0);
        let px = virt_x + (clamped_x * (screen_w - 1) as f64).round() as i32;
        let py = virt_y + (clamped_y * (screen_h - 1) as f64).round() as i32;
        let abs_x = (clamped_x * 65535.0).round() as i32;
        let abs_y = (clamped_y * 65535.0).round() as i32;
        win_input::SetCursorPos(px, py);
        win_input::mouse_event(
          win_input::MOUSEEVENTF_MOVE | win_input::MOUSEEVENTF_ABSOLUTE,
          abs_x,
          abs_y,
          0,
          0,
        );
      }

      match payload.kind.as_str() {
        "move" => {}
        "mousedown" => {
          let flag = match payload.button.unwrap_or(0) {
            1 => win_input::MOUSEEVENTF_MIDDLEDOWN,
            2 => win_input::MOUSEEVENTF_RIGHTDOWN,
            _ => win_input::MOUSEEVENTF_LEFTDOWN,
          };
          win_input::mouse_event(flag, 0, 0, 0, 0);
        }
        "mouseup" => {
          let flag = match payload.button.unwrap_or(0) {
            1 => win_input::MOUSEEVENTF_MIDDLEUP,
            2 => win_input::MOUSEEVENTF_RIGHTUP,
            _ => win_input::MOUSEEVENTF_LEFTUP,
          };
          win_input::mouse_event(flag, 0, 0, 0, 0);
        }
        "wheel" => {
          let dy = payload.delta_y.unwrap_or(0.0);
          let wheel_delta = if dy < 0.0 { 120 } else if dy > 0.0 { -120 } else { 0 };
          if wheel_delta != 0 {
            win_input::mouse_event(win_input::MOUSEEVENTF_WHEEL, 0, 0, wheel_delta, 0);
          }
        }
        "keydown" | "keyup" => {
          let key_str = payload.key.as_deref().unwrap_or("");
          let code_str = payload.code.as_deref().unwrap_or("");
          if let Some(vk) = map_web_key_to_vk(key_str, code_str) {
            let flags = if payload.kind == "keyup" { win_input::KEYEVENTF_KEYUP } else { 0 };
            win_input::keybd_event(vk, 0, flags, 0);
          }
        }
        _ => {}
      }
    }
    return Ok(());
  }

  #[cfg(not(target_os = "windows"))]
  {
    let _ = payload;
    Err("Uzaktan fare/klavye kontrolü şu anda yalnızca Windows masaüstü uygulamasında desteklenmektedir.".to_string())
  }
}

#[tauri::command]
fn request_window_attention(app: tauri::AppHandle) -> Result<(), String> {
  if let Some(window) = app.get_webview_window("main") {
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
    let _ = window.request_user_attention(Some(tauri::UserAttentionType::Informational));
  }
  Ok(())
}

#[tauri::command]
fn get_autostart() -> bool {
  #[cfg(target_os = "windows")]
  {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    if let Ok(out) = std::process::Command::new("reg")
      .args(["query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run", "/v", "Cakma"])
      .creation_flags(CREATE_NO_WINDOW)
      .output()
    {
      return out.status.success();
    }
  }
  false
}

#[tauri::command]
fn set_autostart(enabled: bool) -> Result<bool, String> {
  #[cfg(target_os = "windows")]
  {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    if enabled {
      let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
      let exe_str = format!("\"{}\"", exe_path.display());
      let out = std::process::Command::new("reg")
        .args([
          "add",
          "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
          "/v",
          "Cakma",
          "/t",
          "REG_SZ",
          "/d",
          &exe_str,
          "/f",
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| e.to_string())?;
      if !out.status.success() {
        return Err("Otomatik başlatma kaydı oluşturulamadı.".to_string());
      }
      return Ok(true);
    } else {
      let _ = std::process::Command::new("reg")
        .args([
          "delete",
          "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
          "/v",
          "Cakma",
          "/f",
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output();
      return Ok(false);
    }
  }
  #[cfg(not(target_os = "windows"))]
  {
    let _ = enabled;
    Ok(false)
  }
}

#[tauri::command]
fn position_overlay_window(app: tauri::AppHandle, corner: String) -> Result<(), String> {
  if let Some(overlay) = app.get_webview_window("overlay") {
    let margin = 16i32;
    let overlay_w = 270i32;
    let overlay_h = 340i32;
    let (sw, sh) = if let Ok(Some(mon)) = overlay.primary_monitor() {
      let size = mon.size();
      let scale = mon.scale_factor();
      ((size.width as f64 / scale) as i32, (size.height as f64 / scale) as i32)
    } else {
      (1920, 1080)
    };
    let (x, y) = match corner.as_str() {
      "top-right" => ((sw - overlay_w - margin).max(0), margin),
      "bottom-left" => (margin, (sh - overlay_h - 48).max(0)),
      "bottom-right" => ((sw - overlay_w - margin).max(0), (sh - overlay_h - 48).max(0)),
      _ => (margin, margin), // top-left default
    };
    let _ = overlay.set_position(tauri::Position::Logical(tauri::LogicalPosition::new(x as f64, y as f64)));
  }
  Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let mut builder = tauri::Builder::default()
    .plugin(tauri_plugin_process::init())
    .invoke_handler(tauri::generate_handler![
      detect_running_game,
      toggle_overlay_window,
      set_overlay_window,
      get_overlay_window_state,
      simulate_remote_input,
      request_window_attention,
      get_autostart,
      set_autostart,
      position_overlay_window
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
