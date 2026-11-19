use std::sync::{
  atomic::{AtomicBool, AtomicU64, AtomicU8, Ordering},
  Mutex, OnceLock,
};
use tauri::{
  menu::{Menu, MenuItem},
  tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
  Emitter, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};

static GLOBAL_PTT_ENABLED: AtomicBool = AtomicBool::new(false);
static GLOBAL_PTT_VK: AtomicU8 = AtomicU8::new(0x11);
static GLOBAL_PTT_THREAD_STARTED: AtomicBool = AtomicBool::new(false);
static REMOTE_ASSIST_HOST_ACTIVE: AtomicBool = AtomicBool::new(false);
static REMOTE_ASSIST_KILL_THREAD_STARTED: AtomicBool = AtomicBool::new(false);
static CLOSE_TO_TRAY: AtomicBool = AtomicBool::new(true);
static LAST_WIN_SAVE_MS: AtomicU64 = AtomicU64::new(0);
static PENDING_DEEP_LINK: OnceLock<Mutex<Option<String>>> = OnceLock::new();

fn pending_deep_link_store() -> &'static Mutex<Option<String>> {
  PENDING_DEEP_LINK.get_or_init(|| Mutex::new(None))
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
struct WindowState {
  x: Option<i32>,
  y: Option<i32>,
  width: u32,
  height: u32,
  maximized: bool,
  close_to_tray: bool,
}

impl Default for WindowState {
  fn default() -> Self {
    Self {
      x: None,
      y: None,
      width: 1280,
      height: 780,
      maximized: false,
      close_to_tray: true,
    }
  }
}

fn window_state_path(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
  app.path().app_data_dir().ok().map(|dir| {
    let _ = std::fs::create_dir_all(&dir);
    dir.join("window-state.json")
  })
}

fn load_window_state(app: &tauri::AppHandle) -> WindowState {
  if let Some(p) = window_state_path(app) {
    if let Ok(raw) = std::fs::read_to_string(&p) {
      if let Ok(parsed) = serde_json::from_str::<WindowState>(&raw) {
        return parsed;
      }
    }
  }
  WindowState::default()
}

fn save_window_state(app: &tauri::AppHandle, state: &WindowState) {
  if let Some(p) = window_state_path(app) {
    if let Ok(json) = serde_json::to_string_pretty(state) {
      let _ = std::fs::write(p, json);
    }
  }
}

fn capture_and_persist_window_state(win: &tauri::WebviewWindow) {
  let app = win.app_handle();
  let mut st = load_window_state(app);
  st.close_to_tray = CLOSE_TO_TRAY.load(Ordering::Relaxed);
  if let Ok(maximized) = win.is_maximized() {
    st.maximized = maximized;
    if !maximized {
      if let Ok(size) = win.inner_size() {
        if size.width >= 940 && size.height >= 500 {
          st.width = size.width;
          st.height = size.height;
        }
      }
      if let Ok(pos) = win.outer_position() {
        if (-3200..=6400).contains(&pos.x) && (-1600..=3600).contains(&pos.y) {
          st.x = Some(pos.x);
          st.y = Some(pos.y);
        }
      }
    }
  }
  save_window_state(app, &st);
}

fn extract_deep_link_from_args<I: IntoIterator<Item = String>>(args: I) -> Option<String> {
  args
    .into_iter()
    .find(|a| a.to_ascii_lowercase().starts_with("cakma://"))
}

#[cfg(target_os = "windows")]
fn register_cakma_protocol_windows() {
  use std::os::windows::process::CommandExt;
  const CREATE_NO_WINDOW: u32 = 0x08000000;
  if let Ok(exe) = std::env::current_exe() {
    let cmd_val = format!("\"{}\" \"%1\"", exe.display());
    let _ = std::process::Command::new("reg")
      .args(["add", "HKCU\\Software\\Classes\\cakma", "/ve", "/t", "REG_SZ", "/d", "URL:Cakma Protocol", "/f"])
      .creation_flags(CREATE_NO_WINDOW)
      .output();
    let _ = std::process::Command::new("reg")
      .args(["add", "HKCU\\Software\\Classes\\cakma", "/v", "URL Protocol", "/t", "REG_SZ", "/d", "", "/f"])
      .creation_flags(CREATE_NO_WINDOW)
      .output();
    let _ = std::process::Command::new("reg")
      .args(["add", "HKCU\\Software\\Classes\\cakma\\shell\\open\\command", "/ve", "/t", "REG_SZ", "/d", &cmd_val, "/f"])
      .creation_flags(CREATE_NO_WINDOW)
      .output();
  }
}

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
      ("marvel-win64-shipping.exe", "Marvel Rivals"),
      ("pathofexilesteam.exe", "Path of Exile 2"),
      ("pathofexile_x64steam.exe", "Path of Exile"),
      ("pathofexile.exe", "Path of Exile"),
      ("wow.exe", "World of Warcraft"),
      ("wowclassic.exe", "World of Warcraft Classic"),
      ("diablo iv.exe", "Diablo IV"),
      ("cod.exe", "Call of Duty"),
      ("bf2042.exe", "Battlefield 2042"),
      ("bfv.exe", "Battlefield V"),
      ("destiny2.exe", "Destiny 2"),
      ("warframe.x64.exe", "Warframe"),
      ("forzahorizon5.exe", "Forza Horizon 5"),
      ("beamng.drive.x64.exe", "BeamNG.drive"),
      ("gmod.exe", "Garry's Mod"),
      ("hl2.exe", "Half-Life 2 / Source"),
      ("left4dead2.exe", "Left 4 Dead 2"),
      ("tf_win64.exe", "Team Fortress 2"),
      ("valheim.exe", "Valheim"),
      ("vrising.exe", "V Rising"),
      ("enshrouded.exe", "Enshrouded"),
      ("arkascended.exe", "ARK: Survival Ascended"),
      ("shootergame.exe", "ARK: Survival Evolved"),
      ("hades2.exe", "Hades II"),
      ("hollow_knight.exe", "Hollow Knight"),
      ("subnautica.exe", "Subnautica"),
      ("client-win64-shipping.exe", "Wuthering Waves"),
      ("starrail.exe", "Honkai: Star Rail"),
      ("sotgame.exe", "Sea of Thieves"),
      ("dayz_x64.exe", "DayZ"),
      ("huntgame.exe", "Hunt: Showdown"),
      ("squadgame.exe", "Squad"),
      ("arma3_x64.exe", "Arma 3"),
      ("pubg-lite-win64-shipping.exe", "PUBG Lite"),
      ("blackops6.exe", "Call of Duty: Black Ops 6"),
      ("deltaforceclient-win64-shipping.exe", "Delta Force"),
      ("thefinals.exe", "THE FINALS"),
      ("discovery.exe", "THE FINALS"),
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
async fn toggle_overlay_window(app: tauri::AppHandle) -> Result<bool, String> {
  if let Some(win) = app.get_webview_window("overlay") {
    win.close().map_err(|e| e.to_string())?;
    return Ok(false);
  }

  open_overlay_window(&app)?;
  Ok(true)
}

#[tauri::command]
async fn set_overlay_window(app: tauri::AppHandle, enabled: bool) -> Result<bool, String> {
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
  kind: String, // "move" | "mousedown" | "mouseup" | "wheel" | "keydown" | "keyup" | "text"
  x: Option<f64>,
  y: Option<f64>,
  button: Option<u8>, // 0=left, 1=middle, 2=right
  delta_x: Option<f64>,
  delta_y: Option<f64>,
  key: Option<String>,
  code: Option<String>,
  text: Option<String>,
  ctrl: Option<bool>,
  alt: Option<bool>,
  shift: Option<bool>,
  meta: Option<bool>,
  monitor_x: Option<i32>,
  monitor_y: Option<i32>,
  monitor_w: Option<i32>,
  monitor_h: Option<i32>,
}

#[derive(serde::Serialize, Clone, Debug)]
struct DisplayMonitorInfo {
  index: usize,
  name: String,
  x: i32,
  y: i32,
  width: i32,
  height: i32,
  is_primary: bool,
}

#[cfg(target_os = "windows")]
mod win_input {
  #[repr(C)]
  #[derive(Copy, Clone)]
  pub struct Rect {
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
  }

  #[repr(C)]
  #[derive(Copy, Clone)]
  pub struct MonitorInfoExW {
    pub cb_size: u32,
    pub rc_monitor: Rect,
    pub rc_work: Rect,
    pub dw_flags: u32,
    pub sz_device: [u16; 32],
  }

  #[repr(C)]
  #[derive(Copy, Clone)]
  pub struct MouseInput {
    pub dx: i32,
    pub dy: i32,
    pub mouse_data: i32,
    pub dw_flags: u32,
    pub time: u32,
    pub dw_extra_info: usize,
  }

  #[repr(C)]
  #[derive(Copy, Clone)]
  pub struct KeybdInput {
    pub w_vk: u16,
    pub w_scan: u16,
    pub dw_flags: u32,
    pub time: u32,
    pub dw_extra_info: usize,
  }

  #[repr(C)]
  #[derive(Copy, Clone)]
  pub struct HardwareInput {
    pub u_msg: u32,
    pub w_param_l: u16,
    pub w_param_h: u16,
  }

  #[repr(C)]
  #[derive(Copy, Clone)]
  pub union InputUnion {
    pub mi: MouseInput,
    pub ki: KeybdInput,
    pub hi: HardwareInput,
  }

  #[repr(C)]
  #[derive(Copy, Clone)]
  pub struct Input {
    pub r#type: u32,
    pub union_val: InputUnion,
  }

  pub type MonitorEnumProc = unsafe extern "system" fn(isize, isize, *const Rect, isize) -> i32;

  #[link(name = "user32")]
  unsafe extern "system" {
    pub fn GetSystemMetrics(nIndex: i32) -> i32;
    pub fn SetCursorPos(x: i32, y: i32) -> i32;
    pub fn SendInput(cInputs: u32, pInputs: *const Input, cbSize: i32) -> u32;
    pub fn EnumDisplayMonitors(
      hdc: isize,
      lprc_clip: *const Rect,
      lpfn_enum: MonitorEnumProc,
      dw_data: isize,
    ) -> i32;
    pub fn GetMonitorInfoW(hmonitor: isize, lpmi: *mut MonitorInfoExW) -> i32;
    pub fn VkKeyScanW(ch: u16) -> i16;
    pub fn GetAsyncKeyState(vKey: i32) -> i16;
  }

  pub const INPUT_MOUSE: u32 = 0;
  pub const INPUT_KEYBOARD: u32 = 1;
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
  pub const MOUSEEVENTF_HWHEEL: u32 = 0x01000;
  pub const MOUSEEVENTF_VIRTUALDESK: u32 = 0x4000;
  pub const MOUSEEVENTF_ABSOLUTE: u32 = 0x8000;
  pub const KEYEVENTF_EXTENDEDKEY: u32 = 0x0001;
  pub const KEYEVENTF_KEYUP: u32 = 0x0002;
  pub const KEYEVENTF_UNICODE: u32 = 0x0004;
  pub const MONITORINFOF_PRIMARY: u32 = 1;
}

#[cfg(target_os = "windows")]
unsafe extern "system" fn enum_monitors_proc(
  hmonitor: isize,
  _hdc: isize,
  _rect: *const win_input::Rect,
  dw_data: isize,
) -> i32 {
  unsafe {
    let list = &mut *(dw_data as *mut Vec<DisplayMonitorInfo>);
    let mut info = win_input::MonitorInfoExW {
      cb_size: std::mem::size_of::<win_input::MonitorInfoExW>() as u32,
      rc_monitor: win_input::Rect {
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
      },
      rc_work: win_input::Rect {
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
      },
      dw_flags: 0,
      sz_device: [0; 32],
    };
    if win_input::GetMonitorInfoW(hmonitor, &mut info as *mut win_input::MonitorInfoExW) != 0 {
      let is_primary = (info.dw_flags & win_input::MONITORINFOF_PRIMARY) != 0;
      let idx = list.len();
      let raw_len = info
        .sz_device
        .iter()
        .position(|&c| c == 0)
        .unwrap_or(info.sz_device.len());
      let dev_name = String::from_utf16_lossy(&info.sz_device[..raw_len]);
      let width = (info.rc_monitor.right - info.rc_monitor.left).max(1);
      let height = (info.rc_monitor.bottom - info.rc_monitor.top).max(1);
      let label = if is_primary {
        format!("Monitör {} (Ana) {}x{}", idx + 1, width, height)
      } else if !dev_name.is_empty() {
        format!("Monitör {} ({}) {}x{}", idx + 1, dev_name.trim_start_matches("\\\\.\\"), width, height)
      } else {
        format!("Monitör {} {}x{}", idx + 1, width, height)
      };
      list.push(DisplayMonitorInfo {
        index: idx,
        name: label,
        x: info.rc_monitor.left,
        y: info.rc_monitor.top,
        width,
        height,
        is_primary,
      });
    }
  }
  1
}

#[tauri::command]
fn get_display_monitors() -> Vec<DisplayMonitorInfo> {
  #[cfg(target_os = "windows")]
  {
    let mut list: Vec<DisplayMonitorInfo> = Vec::new();
    unsafe {
      win_input::EnumDisplayMonitors(
        0,
        std::ptr::null(),
        enum_monitors_proc,
        (&mut list as *mut Vec<DisplayMonitorInfo>) as isize,
      );
    }
    if list.is_empty() {
      let w = unsafe { win_input::GetSystemMetrics(win_input::SM_CXSCREEN).max(1) };
      let h = unsafe { win_input::GetSystemMetrics(win_input::SM_CYSCREEN).max(1) };
      list.push(DisplayMonitorInfo {
        index: 0,
        name: format!("Monitör 1 (Ana) {}x{}", w, h),
        x: 0,
        y: 0,
        width: w,
        height: h,
        is_primary: true,
      });
    }
    return list;
  }
  #[cfg(not(target_os = "windows"))]
  {
    Vec::new()
  }
}

#[cfg(target_os = "windows")]
fn map_web_key_to_vk_ext(key: &str, code: &str) -> Option<(u8, bool)> {
  match code {
    "Backspace" => Some((0x08, false)),
    "Tab" => Some((0x09, false)),
    "Enter" => Some((0x0D, false)),
    "NumpadEnter" => Some((0x0D, true)),
    "Shift" | "ShiftLeft" | "ShiftRight" => Some((0x10, false)),
    "Control" | "ControlLeft" => Some((0x11, false)),
    "ControlRight" => Some((0x11, true)),
    "Alt" | "AltLeft" => Some((0x12, false)),
    "AltRight" | "AltGraph" => Some((0x12, true)),
    "Pause" => Some((0x13, false)),
    "CapsLock" => Some((0x14, false)),
    "Escape" => Some((0x1B, false)),
    " " | "Space" | "Spacebar" => Some((0x20, false)),
    "PageUp" => Some((0x21, true)),
    "PageDown" => Some((0x22, true)),
    "End" => Some((0x23, true)),
    "Home" => Some((0x24, true)),
    "ArrowLeft" => Some((0x25, true)),
    "ArrowUp" => Some((0x26, true)),
    "ArrowRight" => Some((0x27, true)),
    "ArrowDown" => Some((0x28, true)),
    "PrintScreen" => Some((0x2C, true)),
    "Insert" => Some((0x2D, true)),
    "Delete" => Some((0x2E, true)),
    "Meta" | "MetaLeft" => Some((0x5B, true)),
    "MetaRight" => Some((0x5C, true)),
    "Backquote" | "`" | "~" => Some((0xC0, false)),
    "Minus" => Some((0xBD, false)),
    "Equal" => Some((0xBB, false)),
    "BracketLeft" => Some((0xDB, false)),
    "BracketRight" => Some((0xDD, false)),
    "Backslash" => Some((0xDC, false)),
    "Semicolon" => Some((0xBA, false)),
    "Quote" => Some((0xDE, false)),
    "Comma" => Some((0xBC, false)),
    "Period" => Some((0xBE, false)),
    "Slash" => Some((0xBF, false)),
    "F1" => Some((0x70, false)),
    "F2" => Some((0x71, false)),
    "F3" => Some((0x72, false)),
    "F4" => Some((0x73, false)),
    "F5" => Some((0x74, false)),
    "F6" => Some((0x75, false)),
    "F7" => Some((0x76, false)),
    "F8" => Some((0x77, false)),
    "F9" => Some((0x78, false)),
    "F10" => Some((0x79, false)),
    "F11" => Some((0x7A, false)),
    "F12" => Some((0x7B, false)),
    _ => {
      if let Some(rest) = code.strip_prefix("Key") {
        if rest.len() == 1 {
          if let Some(ch) = rest.chars().next() {
            if ch.is_ascii_alphabetic() {
              return Some((ch.to_ascii_uppercase() as u8, false));
            }
          }
        }
      }
      if let Some(rest) = code.strip_prefix("Digit") {
        if rest.len() == 1 {
          if let Some(ch) = rest.chars().next() {
            if ch.is_ascii_digit() {
              return Some((ch as u8, false));
            }
          }
        }
      }
      if let Some(ch) = key.chars().next() {
        if key.chars().count() == 1 {
          let vk = unsafe { win_input::VkKeyScanW(ch as u16) };
          if vk != -1 {
            return Some(((vk & 0xFF) as u8, false));
          }
          let upper = ch.to_ascii_uppercase();
          if upper.is_ascii_alphanumeric() {
            return Some((upper as u8, false));
          }
        }
      }
      None
    }
  }
}

#[cfg(target_os = "windows")]
fn map_web_key_to_vk(key: &str, code: &str) -> Option<u8> {
  map_web_key_to_vk_ext(key, code).map(|(vk, _)| vk)
}

#[cfg(target_os = "windows")]
unsafe fn send_win_mouse(dx: i32, dy: i32, mouse_data: i32, dw_flags: u32) {
  let input = win_input::Input {
    r#type: win_input::INPUT_MOUSE,
    union_val: win_input::InputUnion {
      mi: win_input::MouseInput {
        dx,
        dy,
        mouse_data,
        dw_flags,
        time: 0,
        dw_extra_info: 0,
      },
    },
  };
  unsafe {
    win_input::SendInput(1, &input as *const win_input::Input, std::mem::size_of::<win_input::Input>() as i32);
  }
}

#[cfg(target_os = "windows")]
unsafe fn send_win_key(w_vk: u16, w_scan: u16, dw_flags: u32) {
  let input = win_input::Input {
    r#type: win_input::INPUT_KEYBOARD,
    union_val: win_input::InputUnion {
      ki: win_input::KeybdInput {
        w_vk,
        w_scan,
        dw_flags,
        time: 0,
        dw_extra_info: 0,
      },
    },
  };
  unsafe {
    win_input::SendInput(1, &input as *const win_input::Input, std::mem::size_of::<win_input::Input>() as i32);
  }
}

#[cfg(target_os = "windows")]
unsafe fn send_unicode_string(text: &str) {
  let mut batch: Vec<win_input::Input> = Vec::new();
  for code_unit in text.encode_utf16() {
    if code_unit == b'\n' as u16 {
      batch.push(win_input::Input {
        r#type: win_input::INPUT_KEYBOARD,
        union_val: win_input::InputUnion {
          ki: win_input::KeybdInput { w_vk: 0x0D, w_scan: 0, dw_flags: 0, time: 0, dw_extra_info: 0 },
        },
      });
      batch.push(win_input::Input {
        r#type: win_input::INPUT_KEYBOARD,
        union_val: win_input::InputUnion {
          ki: win_input::KeybdInput { w_vk: 0x0D, w_scan: 0, dw_flags: win_input::KEYEVENTF_KEYUP, time: 0, dw_extra_info: 0 },
        },
      });
      continue;
    }
    batch.push(win_input::Input {
      r#type: win_input::INPUT_KEYBOARD,
      union_val: win_input::InputUnion {
        ki: win_input::KeybdInput {
          w_vk: 0,
          w_scan: code_unit,
          dw_flags: win_input::KEYEVENTF_UNICODE,
          time: 0,
          dw_extra_info: 0,
        },
      },
    });
    batch.push(win_input::Input {
      r#type: win_input::INPUT_KEYBOARD,
      union_val: win_input::InputUnion {
        ki: win_input::KeybdInput {
          w_vk: 0,
          w_scan: code_unit,
          dw_flags: win_input::KEYEVENTF_UNICODE | win_input::KEYEVENTF_KEYUP,
          time: 0,
          dw_extra_info: 0,
        },
      },
    });
  }
  if !batch.is_empty() {
    unsafe {
      win_input::SendInput(
        batch.len() as u32,
        batch.as_ptr(),
        std::mem::size_of::<win_input::Input>() as i32,
      );
    }
  }
}

#[tauri::command]
fn simulate_remote_input(payload: RemoteInputPayload) -> Result<(), String> {
  if !REMOTE_ASSIST_HOST_ACTIVE.load(Ordering::Relaxed) {
    return Ok(());
  }

  #[cfg(target_os = "windows")]
  {
    unsafe {
      let virt_w = win_input::GetSystemMetrics(win_input::SM_CXVIRTUALSCREEN);
      let virt_h = win_input::GetSystemMetrics(win_input::SM_CYVIRTUALSCREEN);
      let virt_x = if virt_w > 0 { win_input::GetSystemMetrics(win_input::SM_XVIRTUALSCREEN) } else { 0 };
      let virt_y = if virt_h > 0 { win_input::GetSystemMetrics(win_input::SM_YVIRTUALSCREEN) } else { 0 };
      let v_w = if virt_w > 0 { virt_w } else { win_input::GetSystemMetrics(win_input::SM_CXSCREEN).max(1) };
      let v_h = if virt_h > 0 { virt_h } else { win_input::GetSystemMetrics(win_input::SM_CYSCREEN).max(1) };

      let (mon_x, mon_y, mon_w, mon_h) = match (payload.monitor_w, payload.monitor_h) {
        (Some(mw), Some(mh)) if mw > 0 && mh > 0 => (
          payload.monitor_x.unwrap_or(0),
          payload.monitor_y.unwrap_or(0),
          mw,
          mh,
        ),
        _ => (
          0,
          0,
          win_input::GetSystemMetrics(win_input::SM_CXSCREEN).max(1),
          win_input::GetSystemMetrics(win_input::SM_CYSCREEN).max(1),
        ),
      };

      if let (Some(nx), Some(ny)) = (payload.x, payload.y) {
        let clamped_x = nx.clamp(0.0, 1.0);
        let clamped_y = ny.clamp(0.0, 1.0);
        let px = mon_x + (clamped_x * (mon_w - 1).max(1) as f64).round() as i32;
        let py = mon_y + (clamped_y * (mon_h - 1).max(1) as f64).round() as i32;
        let abs_x = (((px - virt_x) as f64 / (v_w - 1).max(1) as f64).clamp(0.0, 1.0) * 65535.0).round() as i32;
        let abs_y = (((py - virt_y) as f64 / (v_h - 1).max(1) as f64).clamp(0.0, 1.0) * 65535.0).round() as i32;
        win_input::SetCursorPos(px, py);
        send_win_mouse(
          abs_x,
          abs_y,
          0,
          win_input::MOUSEEVENTF_MOVE | win_input::MOUSEEVENTF_ABSOLUTE | win_input::MOUSEEVENTF_VIRTUALDESK,
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
          send_win_mouse(0, 0, 0, flag);
        }
        "mouseup" => {
          let flag = match payload.button.unwrap_or(0) {
            1 => win_input::MOUSEEVENTF_MIDDLEUP,
            2 => win_input::MOUSEEVENTF_RIGHTUP,
            _ => win_input::MOUSEEVENTF_LEFTUP,
          };
          send_win_mouse(0, 0, 0, flag);
        }
        "wheel" => {
          let dy = payload.delta_y.unwrap_or(0.0);
          let wheel_delta = if dy < 0.0 { 120 } else if dy > 0.0 { -120 } else { 0 };
          if wheel_delta != 0 {
            send_win_mouse(0, 0, wheel_delta, win_input::MOUSEEVENTF_WHEEL);
          }
          let dx = payload.delta_x.unwrap_or(0.0);
          let hwheel_delta = if dx > 0.0 { 120 } else if dx < 0.0 { -120 } else { 0 };
          if hwheel_delta != 0 {
            send_win_mouse(0, 0, hwheel_delta, win_input::MOUSEEVENTF_HWHEEL);
          }
        }
        "text" => {
          if let Some(ref txt) = payload.text {
            send_unicode_string(txt);
          }
        }
        "keydown" | "keyup" => {
          let key_str = payload.key.as_deref().unwrap_or("");
          let code_str = payload.code.as_deref().unwrap_or("");
          let _ = payload.shift;
          let has_cmd_mod = payload.ctrl.unwrap_or(false) || payload.alt.unwrap_or(false) || payload.meta.unwrap_or(false);
          let is_single_printable = key_str.chars().count() == 1
            && !has_cmd_mod
            && !matches!(code_str, "Space" | "Enter" | "NumpadEnter" | "Tab" | "Backspace");

          if is_single_printable {
            if payload.kind == "keydown" {
              send_unicode_string(key_str);
            }
          } else if let Some((vk, extended)) = map_web_key_to_vk_ext(key_str, code_str) {
            let mut flags = if payload.kind == "keyup" { win_input::KEYEVENTF_KEYUP } else { 0 };
            if extended {
              flags |= win_input::KEYEVENTF_EXTENDEDKEY;
            }
            send_win_key(vk as u16, 0, flags);
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

fn close_remote_assist_windows(app: &tauri::AppHandle) {
  if let Some(hud) = app.get_webview_window("remote-assist-hud") {
    let _ = hud.close();
  }
  if let Some(overlay) = app.get_webview_window("remote-assist-overlay") {
    let _ = overlay.close();
  }
}

#[tauri::command]
fn set_remote_assist_killswitch(app: tauri::AppHandle, active: bool) -> bool {
  REMOTE_ASSIST_HOST_ACTIVE.store(active, Ordering::Relaxed);
  if !active {
    close_remote_assist_windows(&app);
  }

  #[cfg(target_os = "windows")]
  {
    if active && !REMOTE_ASSIST_KILL_THREAD_STARTED.swap(true, Ordering::SeqCst) {
      let handle = app.clone();
      std::thread::spawn(move || {
        let mut was_triggered = false;
        loop {
          if !REMOTE_ASSIST_HOST_ACTIVE.load(Ordering::Relaxed) {
            was_triggered = false;
            std::thread::sleep(std::time::Duration::from_millis(250));
            continue;
          }
          let is_ctrl_down = unsafe { (win_input::GetAsyncKeyState(0x11) as u16) & 0x8000 != 0 };
          let is_alt_down = unsafe { (win_input::GetAsyncKeyState(0x12) as u16) & 0x8000 != 0 };
          let is_esc_down = unsafe { (win_input::GetAsyncKeyState(0x1B) as u16) & 0x8000 != 0 };
          let is_pause_down = unsafe { (win_input::GetAsyncKeyState(0x13) as u16) & 0x8000 != 0 };
          let combo = (is_ctrl_down && is_alt_down && is_esc_down) || is_pause_down;
          if combo && !was_triggered {
            was_triggered = true;
            REMOTE_ASSIST_HOST_ACTIVE.store(false, Ordering::Relaxed);
            close_remote_assist_windows(&handle);
            let _ = handle.emit("remote-assist-emergency-stop", ());
          } else if !combo {
            was_triggered = false;
          }
          std::thread::sleep(std::time::Duration::from_millis(35));
        }
      });
    }
  }
  #[cfg(not(target_os = "windows"))]
  {
    let _ = &app;
  }

  active
}

#[tauri::command]
async fn set_remote_assist_host_hud(
  app: tauri::AppHandle,
  active: bool,
  controller_name: Option<String>,
  paused: Option<bool>,
  monitor_x: Option<i32>,
  monitor_y: Option<i32>,
  monitor_w: Option<i32>,
  monitor_h: Option<i32>,
) -> Result<(), String> {
  if !active {
    close_remote_assist_windows(&app);
    return Ok(());
  }

  let (mx, my, mw, mh) = (
    monitor_x.unwrap_or(0),
    monitor_y.unwrap_or(0),
    monitor_w.unwrap_or(1920).max(640),
    monitor_h.unwrap_or(1080).max(480),
  );

  // 1. Click-through annotation/laser host overlay spanning target monitor
  let overlay_win = if let Some(existing) = app.get_webview_window("remote-assist-overlay") {
    let _ = existing.show();
    existing
  } else {
    WebviewWindowBuilder::new(
      &app,
      "remote-assist-overlay",
      WebviewUrl::App("remote-assist-overlay.html".into()),
    )
    .title("Çakma Uzaktan Yardım Overlay")
    .inner_size(mw as f64, mh as f64)
    .position(mx as f64, my as f64)
    .transparent(true)
    .background_color(tauri::window::Color(0, 0, 0, 0))
    .shadow(false)
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(false)
    .focused(false)
    .build()
    .map_err(|e| e.to_string())?
  };
  let _ = overlay_win.set_position(tauri::Position::Physical(tauri::PhysicalPosition::new(mx, my)));
  let _ = overlay_win.set_size(tauri::Size::Physical(tauri::PhysicalSize::new(mw as u32, mh as u32)));
  let _ = overlay_win.set_ignore_cursor_events(true);

  // 2. Always-on-top compact HUD pill centered at top of monitor
  let hud_win = if let Some(existing) = app.get_webview_window("remote-assist-hud") {
    let _ = existing.show();
    existing
  } else {
    WebviewWindowBuilder::new(
      &app,
      "remote-assist-hud",
      WebviewUrl::App("remote-assist-hud.html".into()),
    )
    .title("Çakma Uzaktan Yardım")
    .inner_size(430.0, 46.0)
    .position(mx as f64 + 120.0, my as f64 + 10.0)
    .transparent(true)
    .background_color(tauri::window::Color(0, 0, 0, 0))
    .shadow(false)
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(false)
    .focused(false)
    .build()
    .map_err(|e| e.to_string())?
  };
  let scale = hud_win.scale_factor().unwrap_or(1.0);
  let phys_hud_w = (430.0 * scale).round() as i32;
  let hud_x = mx + ((mw - phys_hud_w) / 2).max(0);
  let hud_y = my + 10;
  let _ = hud_win.set_position(tauri::Position::Physical(tauri::PhysicalPosition::new(hud_x, hud_y)));

  let _ = app.emit_to(
    "remote-assist-hud",
    "remote-assist-hud-state",
    serde_json::json!({
      "controllerName": controller_name.unwrap_or_else(|| "Uzaktan Yardımcı".to_string()),
      "paused": paused.unwrap_or(false),
    }),
  );

  Ok(())
}

#[tauri::command]
fn push_remote_assist_overlay_event(app: tauri::AppHandle, payload: serde_json::Value) -> Result<(), String> {
  if app.get_webview_window("remote-assist-overlay").is_some() {
    let _ = app.emit_to("remote-assist-overlay", "remote-assist-overlay-event", payload);
  }
  Ok(())
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
async fn position_overlay_window(app: tauri::AppHandle, corner: String) -> Result<(), String> {
  if let Some(overlay) = app.get_webview_window("overlay") {
    let margin = 16i32;
    let overlay_w = 290i32;
    let overlay_h = 260i32;
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

#[tauri::command]
async fn set_overlay_ignore_cursor(app: tauri::AppHandle, ignore: bool) -> Result<(), String> {
  if let Some(overlay) = app.get_webview_window("overlay") {
    overlay.set_ignore_cursor_events(ignore).map_err(|e| e.to_string())?;
  }
  Ok(())
}

#[tauri::command]
async fn resize_overlay_window(app: tauri::AppHandle, width: f64, height: f64) -> Result<(), String> {
  if let Some(overlay) = app.get_webview_window("overlay") {
    let w = width.clamp(220.0, 460.0);
    let h = height.clamp(140.0, 480.0);
    overlay
      .set_size(tauri::Size::Logical(tauri::LogicalSize::new(w, h)))
      .map_err(|e| e.to_string())?;
  }
  Ok(())
}

#[tauri::command]
fn focus_main_window(app: tauri::AppHandle) -> Result<(), String> {
  if let Some(win) = app.get_webview_window("main") {
    let _ = win.unminimize();
    let _ = win.show();
    let _ = win.set_focus();
  }
  Ok(())
}

#[tauri::command]
fn set_taskbar_badge(app: tauri::AppHandle, count: u32) -> Result<(), String> {
  if let Some(tray) = app.tray_by_id("main-tray") {
    let tip = if count > 0 {
      format!("Çakma ({} okunmamış)", count)
    } else {
      "Çakma".to_string()
    };
    let _ = tray.set_tooltip(Some(tip));
  }

  if let Some(win) = app.get_webview_window("main") {
    #[cfg(target_os = "windows")]
    {
      if count > 0 {
        let size: usize = 16;
        let mut rgba = vec![0u8; size * size * 4];
        let cx = 7.5_f32;
        let cy = 7.5_f32;
        for y in 0..size {
          for x in 0..size {
            let dx = x as f32 - cx;
            let dy = y as f32 - cy;
            let dist = (dx * dx + dy * dy).sqrt();
            let idx = (y * size + x) * 4;
            if dist <= 7.2 {
              // Crisp crimson notification dot with subtle white border & center dot
              if dist >= 6.0 {
                rgba[idx] = 255;
                rgba[idx + 1] = 255;
                rgba[idx + 2] = 255;
                rgba[idx + 3] = 240;
              } else if dist <= 2.4 {
                rgba[idx] = 255;
                rgba[idx + 1] = 255;
                rgba[idx + 2] = 255;
                rgba[idx + 3] = 255;
              } else {
                rgba[idx] = 239;
                rgba[idx + 1] = 68;
                rgba[idx + 2] = 68;
                rgba[idx + 3] = 255;
              }
            }
          }
        }
        let img = tauri::image::Image::new_owned(rgba, size as u32, size as u32);
        let _ = win.set_overlay_icon(Some(img));
      } else {
        let _ = win.set_overlay_icon(None);
      }
    }

    #[cfg(target_os = "macos")]
    {
      let _ = win.set_badge_count(if count > 0 { Some(count as i64) } else { None });
    }
  }
  Ok(())
}

#[tauri::command]
fn set_global_ptt(app: tauri::AppHandle, enabled: bool, key: String) -> Result<bool, String> {
  #[cfg(target_os = "windows")]
  {
    if let Some(vk) = map_web_key_to_vk(&key, &key) {
      GLOBAL_PTT_VK.store(vk, Ordering::Relaxed);
    }
    GLOBAL_PTT_ENABLED.store(enabled, Ordering::Relaxed);
    if !enabled {
      let _ = app.emit("global-ptt-state", false);
    }
    if !GLOBAL_PTT_THREAD_STARTED.swap(true, Ordering::SeqCst) {
      let handle = app.clone();
      std::thread::spawn(move || {
        let mut was_down = false;
        loop {
          if !GLOBAL_PTT_ENABLED.load(Ordering::Relaxed) {
            if was_down {
              was_down = false;
              let _ = handle.emit("global-ptt-state", false);
            }
            std::thread::sleep(std::time::Duration::from_millis(220));
            continue;
          }
          let vk = GLOBAL_PTT_VK.load(Ordering::Relaxed) as i32;
          let is_down = unsafe { (win_input::GetAsyncKeyState(vk) as u16) & 0x8000 != 0 };
          if is_down != was_down {
            was_down = is_down;
            let _ = handle.emit("global-ptt-state", is_down);
          }
          std::thread::sleep(std::time::Duration::from_millis(25));
        }
      });
    }
    return Ok(enabled);
  }
  #[cfg(not(target_os = "windows"))]
  {
    let _ = (app, enabled, key);
    Ok(false)
  }
}

#[tauri::command]
fn get_close_to_tray() -> bool {
  CLOSE_TO_TRAY.load(Ordering::Relaxed)
}

#[tauri::command]
fn set_close_to_tray(app: tauri::AppHandle, enabled: bool) -> Result<bool, String> {
  CLOSE_TO_TRAY.store(enabled, Ordering::Relaxed);
  let mut st = load_window_state(&app);
  st.close_to_tray = enabled;
  save_window_state(&app, &st);
  Ok(enabled)
}

#[tauri::command]
fn take_pending_deep_link() -> Option<String> {
  pending_deep_link_store().lock().ok().and_then(|mut g| g.take())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  if let Some(url) = extract_deep_link_from_args(std::env::args()) {
    if let Ok(mut g) = pending_deep_link_store().lock() {
      *g = Some(url);
    }
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
        if let Some(url) = extract_deep_link_from_args(argv) {
          if let Ok(mut g) = pending_deep_link_store().lock() {
            *g = Some(url.clone());
          }
          let _ = app.emit("deep-link-url", url);
        }
      }))
      .plugin(tauri_plugin_updater::Builder::new().build())
      .plugin(tauri_plugin_global_shortcut::Builder::new().build());
  }

  builder = builder
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
      position_overlay_window,
      set_overlay_ignore_cursor,
      resize_overlay_window,
      focus_main_window,
      set_taskbar_badge,
      set_global_ptt,
      get_close_to_tray,
      set_close_to_tray,
      take_pending_deep_link,
      get_display_monitors,
      set_remote_assist_killswitch,
      set_remote_assist_host_hud,
      push_remote_assist_overlay_event
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
      register_cakma_protocol_windows();

      let saved_state = load_window_state(app.handle());
      CLOSE_TO_TRAY.store(saved_state.close_to_tray, Ordering::Relaxed);
      if let Some(win) = app.get_webview_window("main") {
        let w = saved_state.width.clamp(940, 7680);
        let h = saved_state.height.clamp(500, 4320);
        let _ = win.set_size(tauri::Size::Physical(tauri::PhysicalSize::new(w, h)));
        if let (Some(x), Some(y)) = (saved_state.x, saved_state.y) {
          if (-3200..=6400).contains(&x) && (-1600..=3600).contains(&y) {
            let _ = win.set_position(tauri::Position::Physical(tauri::PhysicalPosition::new(x, y)));
          }
        }
        if saved_state.maximized {
          let _ = win.maximize();
        }
      }

      #[cfg(desktop)]
      {
        let show_item = MenuItem::with_id(app, "show", "Çakma'yı Göster", true, None::<&str>)?;
        let mute_item = MenuItem::with_id(app, "toggle_mute", "Mikrofonu Kapat / Aç", true, None::<&str>)?;
        let deafen_item = MenuItem::with_id(app, "toggle_deafen", "Kulaklığı Sağırlaştır / Aç", true, None::<&str>)?;
        let leave_voice_item = MenuItem::with_id(app, "leave_voice", "Ses Odasından Ayrıl", true, None::<&str>)?;
        let status_online_item = MenuItem::with_id(app, "status_online", "Durum: Çevrimiçi", true, None::<&str>)?;
        let status_idle_item = MenuItem::with_id(app, "status_idle", "Durum: Boşta", true, None::<&str>)?;
        let status_dnd_item = MenuItem::with_id(app, "status_dnd", "Durum: Rahatsız Etme", true, None::<&str>)?;
        let quit_item = MenuItem::with_id(app, "quit", "Tamamen Kapat", true, None::<&str>)?;
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
              close_remote_assist_windows(app);
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
            if let Some(win) = window.app_handle().get_webview_window("main") {
              if !win.is_minimized().unwrap_or(false) {
                let now_ms = std::time::SystemTime::now()
                  .duration_since(std::time::UNIX_EPOCH)
                  .map(|d| d.as_millis() as u64)
                  .unwrap_or(0);
                let prev_ms = LAST_WIN_SAVE_MS.load(Ordering::Relaxed);
                if now_ms.saturating_sub(prev_ms) >= 350 {
                  LAST_WIN_SAVE_MS.store(now_ms, Ordering::Relaxed);
                  capture_and_persist_window_state(&win);
                }
              }
            }
          }
          WindowEvent::CloseRequested { api, .. } => {
            if let Some(win) = window.app_handle().get_webview_window("main") {
              capture_and_persist_window_state(&win);
            }
            if CLOSE_TO_TRAY.load(Ordering::Relaxed) {
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
