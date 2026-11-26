use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use tauri::Emitter;
#[cfg(desktop)]
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

static REMOTE_ASSIST_HOST_ACTIVE: AtomicBool = AtomicBool::new(false);
static REMOTE_ASSIST_SAFE_MODE: AtomicBool = AtomicBool::new(true);
static REMOTE_INPUT_WINDOW_SEC: AtomicU64 = AtomicU64::new(0);
static REMOTE_INPUT_WINDOW_COUNT: AtomicU32 = AtomicU32::new(0);
static REMOTE_ASSIST_KILL_THREAD_STARTED: AtomicBool = AtomicBool::new(false);

#[derive(serde::Deserialize)]
pub struct RemoteInputPayload {
    kind: String,
    x: Option<f64>,
    y: Option<f64>,
    button: Option<u8>,
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
pub struct DisplayMonitorInfo {
    index: usize,
    name: String,
    x: i32,
    y: i32,
    width: i32,
    height: i32,
    is_primary: bool,
}

#[cfg(target_os = "windows")]
pub(crate) mod win_input {
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
                format!(
                    "Monitör {} ({}) {}x{}",
                    idx + 1,
                    dev_name.trim_start_matches("\\\\.\\"),
                    width,
                    height
                )
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
pub fn get_display_monitors() -> Vec<DisplayMonitorInfo> {
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
        list
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
            if let Some(rest) = code.strip_prefix("Key")
                && rest.len() == 1
                && let Some(ch) = rest.chars().next()
                && ch.is_ascii_alphabetic()
            {
                return Some((ch.to_ascii_uppercase() as u8, false));
            }
            if let Some(rest) = code.strip_prefix("Digit")
                && rest.len() == 1
                && let Some(ch) = rest.chars().next()
                && ch.is_ascii_digit()
            {
                return Some((ch as u8, false));
            }
            if let Some(ch) = key.chars().next()
                && key.chars().count() == 1
            {
                let vk = unsafe { win_input::VkKeyScanW(ch as u16) };
                if vk != -1 {
                    return Some(((vk & 0xFF) as u8, false));
                }
                let upper = ch.to_ascii_uppercase();
                if upper.is_ascii_alphanumeric() {
                    return Some((upper as u8, false));
                }
            }
            None
        }
    }
}

#[cfg(target_os = "windows")]
pub(crate) fn map_web_key_to_vk(key: &str, code: &str) -> Option<u8> {
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
        win_input::SendInput(
            1,
            &input as *const win_input::Input,
            std::mem::size_of::<win_input::Input>() as i32,
        );
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
        win_input::SendInput(
            1,
            &input as *const win_input::Input,
            std::mem::size_of::<win_input::Input>() as i32,
        );
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
                    ki: win_input::KeybdInput {
                        w_vk: 0x0D,
                        w_scan: 0,
                        dw_flags: 0,
                        time: 0,
                        dw_extra_info: 0,
                    },
                },
            });
            batch.push(win_input::Input {
                r#type: win_input::INPUT_KEYBOARD,
                union_val: win_input::InputUnion {
                    ki: win_input::KeybdInput {
                        w_vk: 0x0D,
                        w_scan: 0,
                        dw_flags: win_input::KEYEVENTF_KEYUP,
                        time: 0,
                        dw_extra_info: 0,
                    },
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

fn allow_remote_input_event() -> bool {
    let now_sec = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let prev_sec = REMOTE_INPUT_WINDOW_SEC.load(Ordering::Relaxed);
    if now_sec != prev_sec {
        REMOTE_INPUT_WINDOW_SEC.store(now_sec, Ordering::Relaxed);
        REMOTE_INPUT_WINDOW_COUNT.store(1, Ordering::Relaxed);
        return true;
    }
    let count = REMOTE_INPUT_WINDOW_COUNT.fetch_add(1, Ordering::Relaxed);
    count < 240
}

pub(crate) fn is_blocked_remote_shortcut(
    key: &str,
    code: &str,
    ctrl: bool,
    alt: bool,
    shift: bool,
    meta: bool,
) -> bool {
    let k = key.trim().to_ascii_lowercase();
    let c = code.trim().to_ascii_lowercase();
    if alt && (k == "f4" || c == "f4") {
        return true;
    }
    if meta && matches!(k.as_str(), "r" | "x" | "l" | "e") {
        return true;
    }
    if meta && matches!(c.as_str(), "keyr" | "keyx" | "keyl" | "keye") {
        return true;
    }
    if ctrl && shift && (k == "escape" || c == "escape") {
        return true;
    }
    if ctrl && alt && (k == "delete" || k == "del" || c == "delete") {
        return true;
    }
    false
}

#[tauri::command]
pub fn set_remote_assist_safe_mode(enabled: bool) -> bool {
    REMOTE_ASSIST_SAFE_MODE.store(enabled, Ordering::Relaxed);
    enabled
}

#[tauri::command]
pub fn get_remote_assist_safe_mode() -> bool {
    REMOTE_ASSIST_SAFE_MODE.load(Ordering::Relaxed)
}

#[tauri::command]
pub fn simulate_remote_input(payload: RemoteInputPayload) -> Result<(), String> {
    if !REMOTE_ASSIST_HOST_ACTIVE.load(Ordering::Relaxed) {
        return Ok(());
    }
    if !allow_remote_input_event() {
        return Ok(());
    }

    let ctrl = payload.ctrl.unwrap_or(false);
    let alt = payload.alt.unwrap_or(false);
    let shift = payload.shift.unwrap_or(false);
    let meta = payload.meta.unwrap_or(false);
    if REMOTE_ASSIST_SAFE_MODE.load(Ordering::Relaxed) && payload.kind == "keydown" {
        let key_str = payload.key.as_deref().unwrap_or("");
        let code_str = payload.code.as_deref().unwrap_or("");
        if is_blocked_remote_shortcut(key_str, code_str, ctrl, alt, shift, meta) {
            return Ok(());
        }
    }

    #[cfg(target_os = "windows")]
    {
        unsafe {
            let virt_w = win_input::GetSystemMetrics(win_input::SM_CXVIRTUALSCREEN);
            let virt_h = win_input::GetSystemMetrics(win_input::SM_CYVIRTUALSCREEN);
            let virt_x = if virt_w > 0 {
                win_input::GetSystemMetrics(win_input::SM_XVIRTUALSCREEN)
            } else {
                0
            };
            let virt_y = if virt_h > 0 {
                win_input::GetSystemMetrics(win_input::SM_YVIRTUALSCREEN)
            } else {
                0
            };
            let v_w = if virt_w > 0 {
                virt_w
            } else {
                win_input::GetSystemMetrics(win_input::SM_CXSCREEN).max(1)
            };
            let v_h = if virt_h > 0 {
                virt_h
            } else {
                win_input::GetSystemMetrics(win_input::SM_CYSCREEN).max(1)
            };

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
                let abs_x = (((px - virt_x) as f64 / (v_w - 1).max(1) as f64).clamp(0.0, 1.0)
                    * 65535.0)
                    .round() as i32;
                let abs_y = (((py - virt_y) as f64 / (v_h - 1).max(1) as f64).clamp(0.0, 1.0)
                    * 65535.0)
                    .round() as i32;
                win_input::SetCursorPos(px, py);
                send_win_mouse(
                    abs_x,
                    abs_y,
                    0,
                    win_input::MOUSEEVENTF_MOVE
                        | win_input::MOUSEEVENTF_ABSOLUTE
                        | win_input::MOUSEEVENTF_VIRTUALDESK,
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
                    let wheel_delta = if dy < 0.0 {
                        120
                    } else if dy > 0.0 {
                        -120
                    } else {
                        0
                    };
                    if wheel_delta != 0 {
                        send_win_mouse(0, 0, wheel_delta, win_input::MOUSEEVENTF_WHEEL);
                    }
                    let dx = payload.delta_x.unwrap_or(0.0);
                    let hwheel_delta = if dx > 0.0 {
                        120
                    } else if dx < 0.0 {
                        -120
                    } else {
                        0
                    };
                    if hwheel_delta != 0 {
                        send_win_mouse(0, 0, hwheel_delta, win_input::MOUSEEVENTF_HWHEEL);
                    }
                }
                "text" => {
                    if let Some(ref txt) = payload.text {
                        let clamped: String = txt.chars().take(2000).collect();
                        send_unicode_string(&clamped);
                    }
                }
                "keydown" | "keyup" => {
                    let key_str = payload.key.as_deref().unwrap_or("");
                    let code_str = payload.code.as_deref().unwrap_or("");
                    let has_cmd_mod = ctrl || alt || meta;
                    let is_single_printable = key_str.chars().count() == 1
                        && !has_cmd_mod
                        && !matches!(
                            code_str,
                            "Space" | "Enter" | "NumpadEnter" | "Tab" | "Backspace"
                        );

                    if is_single_printable {
                        if payload.kind == "keydown" {
                            send_unicode_string(key_str);
                        }
                    } else if let Some((vk, extended)) = map_web_key_to_vk_ext(key_str, code_str) {
                        let mut flags = if payload.kind == "keyup" {
                            win_input::KEYEVENTF_KEYUP
                        } else {
                            0
                        };
                        if extended {
                            flags |= win_input::KEYEVENTF_EXTENDEDKEY;
                        }
                        send_win_key(vk as u16, 0, flags);
                    }
                }
                _ => {}
            }
        }
        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = payload;
        Err("Uzaktan fare/klavye kontrolü şu anda yalnızca Windows masaüstü uygulamasında desteklenmektedir.".to_string())
    }
}

pub(crate) fn close_remote_assist_windows(app: &tauri::AppHandle) {
    #[cfg(desktop)]
    {
        if let Some(hud) = app.get_webview_window("remote-assist-hud") {
            let _ = hud.close();
        }
        if let Some(overlay) = app.get_webview_window("remote-assist-overlay") {
            let _ = overlay.close();
        }
    }
    #[cfg(not(desktop))]
    let _ = app;
}

#[tauri::command]
pub fn set_remote_assist_killswitch(app: tauri::AppHandle, active: bool) -> bool {
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
                    let is_ctrl_down =
                        unsafe { (win_input::GetAsyncKeyState(0x11) as u16) & 0x8000 != 0 };
                    let is_alt_down =
                        unsafe { (win_input::GetAsyncKeyState(0x12) as u16) & 0x8000 != 0 };
                    let is_esc_down =
                        unsafe { (win_input::GetAsyncKeyState(0x1B) as u16) & 0x8000 != 0 };
                    let is_pause_down =
                        unsafe { (win_input::GetAsyncKeyState(0x13) as u16) & 0x8000 != 0 };
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
#[allow(clippy::too_many_arguments)]
pub async fn set_remote_assist_host_hud(
    app: tauri::AppHandle,
    active: bool,
    controller_name: Option<String>,
    paused: Option<bool>,
    monitor_x: Option<i32>,
    monitor_y: Option<i32>,
    monitor_w: Option<i32>,
    monitor_h: Option<i32>,
) -> Result<(), String> {
    #[cfg(desktop)]
    {
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
        let _ = overlay_win.set_position(tauri::Position::Physical(tauri::PhysicalPosition::new(
            mx, my,
        )));
        let _ = overlay_win.set_size(tauri::Size::Physical(tauri::PhysicalSize::new(
            mw as u32, mh as u32,
        )));
        let _ = overlay_win.set_ignore_cursor_events(true);

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
        let _ = hud_win.set_position(tauri::Position::Physical(tauri::PhysicalPosition::new(
            hud_x, hud_y,
        )));

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
    #[cfg(not(desktop))]
    {
        let _ = (
            app,
            active,
            controller_name,
            paused,
            monitor_x,
            monitor_y,
            monitor_w,
            monitor_h,
        );
        Ok(())
    }
}

#[tauri::command]
pub fn push_remote_assist_overlay_event(
    app: tauri::AppHandle,
    payload: serde_json::Value,
) -> Result<(), String> {
    #[cfg(desktop)]
    if app.get_webview_window("remote-assist-overlay").is_some() {
        let _ = app.emit_to(
            "remote-assist-overlay",
            "remote-assist-overlay-event",
            payload,
        );
    }
    #[cfg(not(desktop))]
    let _ = (app, payload);
    Ok(())
}

#[cfg(test)]
mod remote_assist_tests {
    use super::is_blocked_remote_shortcut;

    #[test]
    fn blocks_critical_system_shortcuts() {
        assert!(is_blocked_remote_shortcut(
            "F4", "F4", false, true, false, false
        ));
        assert!(is_blocked_remote_shortcut(
            "r", "KeyR", false, false, false, true
        ));
        assert!(is_blocked_remote_shortcut(
            "X", "KeyX", false, false, false, true
        ));
        assert!(is_blocked_remote_shortcut(
            "l", "KeyL", false, false, false, true
        ));
        assert!(is_blocked_remote_shortcut(
            "Escape", "Escape", true, false, true, false
        ));
        assert!(is_blocked_remote_shortcut(
            "Delete", "Delete", true, true, false, false
        ));
    }

    #[test]
    fn allows_regular_editing_shortcuts() {
        assert!(!is_blocked_remote_shortcut(
            "c", "KeyC", true, false, false, false
        ));
        assert!(!is_blocked_remote_shortcut(
            "v", "KeyV", true, false, false, false
        ));
        assert!(!is_blocked_remote_shortcut(
            "Tab", "Tab", false, true, false, false
        ));
        assert!(!is_blocked_remote_shortcut(
            "a", "KeyA", false, false, false, false
        ));
    }
}
