#[cfg(target_os = "windows")]
use std::sync::atomic::{AtomicBool, AtomicU8, AtomicU64, Ordering};
#[cfg(target_os = "windows")]
use tauri::Emitter;
use tauri::Manager;

#[cfg(target_os = "windows")]
static GLOBAL_PTT_ENABLED: AtomicBool = AtomicBool::new(false);
#[cfg(target_os = "windows")]
static GLOBAL_PTT_VK: AtomicU8 = AtomicU8::new(0x11);
#[cfg(target_os = "windows")]
static GLOBAL_PTT_RELEASE_DELAY_MS: AtomicU64 = AtomicU64::new(0);
#[cfg(target_os = "windows")]
static GLOBAL_PTT_THREAD_STARTED: AtomicBool = AtomicBool::new(false);

pub(crate) fn clamp_ptt_release_delay_ms(ms: Option<u64>) -> u64 {
    ms.unwrap_or(0).min(1500)
}

pub(crate) fn map_ptt_key_to_vk(key: &str) -> Option<u8> {
    let normalized = key.trim().to_ascii_lowercase();
    match normalized.as_str() {
        "mouse4" | "xbutton1" | "mb4" | "button4" => Some(0x05),
        "mouse5" | "xbutton2" | "mb5" | "button5" => Some(0x06),
        "mousemiddle" | "middlemouse" | "mb3" | "mouse3" => Some(0x04),
        _ => {
            #[cfg(target_os = "windows")]
            {
                crate::remote_assist::map_web_key_to_vk(key, key)
            }
            #[cfg(not(target_os = "windows"))]
            {
                None
            }
        }
    }
}

#[cfg(any(target_os = "linux", test))]
pub(crate) fn format_linux_autostart_desktop_entry(exe_path: &str) -> String {
    format!(
        "[Desktop Entry]\nType=Application\nName=Cakma\nComment=Cakma Ses ve Sohbet Platformu\nExec=\"{}\"\nTerminal=false\nX-GNOME-Autostart-enabled=true\n",
        exe_path.trim()
    )
}

#[cfg(target_os = "linux")]
fn linux_autostart_file_path() -> Option<std::path::PathBuf> {
    let config_root = std::env::var_os("XDG_CONFIG_HOME")
        .filter(|v| !v.is_empty())
        .map(std::path::PathBuf::from)
        .or_else(|| {
            std::env::var_os("HOME")
                .filter(|v| !v.is_empty())
                .map(|h| std::path::PathBuf::from(h).join(".config"))
        })?;
    Some(config_root.join("autostart").join("cakma.desktop"))
}

#[derive(serde::Serialize, Clone, Debug, PartialEq, Eq)]
pub struct PlatformCapabilities {
    pub os: String,
    pub arch: String,
    pub global_ptt: bool,
    pub global_shortcuts: bool,
    pub game_detection: bool,
    pub remote_assist_input: bool,
    pub autostart: bool,
    pub deep_link_protocol: bool,
    pub taskbar_badge: bool,
}

pub(crate) fn current_platform_capabilities() -> PlatformCapabilities {
    let is_windows = cfg!(target_os = "windows");
    let is_macos = cfg!(target_os = "macos");
    let is_linux = cfg!(target_os = "linux");
    let is_desktop = cfg!(desktop);
    PlatformCapabilities {
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        global_ptt: is_windows,
        global_shortcuts: is_desktop,
        game_detection: is_windows || is_macos,
        remote_assist_input: is_windows,
        autostart: is_windows || is_linux,
        deep_link_protocol: is_windows,
        taskbar_badge: is_windows || is_macos,
    }
}

#[tauri::command]
pub fn get_platform_capabilities() -> PlatformCapabilities {
    current_platform_capabilities()
}

#[tauri::command]
pub fn detect_running_game() -> Option<String> {
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

#[tauri::command]
pub fn request_window_attention(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
        let _ = window.request_user_attention(Some(tauri::UserAttentionType::Informational));
    }
    Ok(())
}

#[tauri::command]
pub fn get_autostart() -> bool {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        if let Ok(out) = std::process::Command::new("reg")
            .args([
                "query",
                "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
                "/v",
                "Cakma",
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
        {
            return out.status.success();
        }
    }
    #[cfg(target_os = "linux")]
    {
        if let Some(path) = linux_autostart_file_path() {
            return path.exists();
        }
    }
    false
}

#[tauri::command]
pub fn set_autostart(enabled: bool) -> Result<bool, String> {
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
            Ok(true)
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
            Ok(false)
        }
    }
    #[cfg(target_os = "linux")]
    {
        let path = linux_autostart_file_path()
            .ok_or_else(|| "XDG autostart dizini çözümlenemedi.".to_string())?;
        if enabled {
            let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
            if let Some(parent) = path.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let content = format_linux_autostart_desktop_entry(&exe_path.to_string_lossy());
            std::fs::write(&path, content).map_err(|e| e.to_string())?;
            Ok(true)
        } else {
            if path.exists() {
                let _ = std::fs::remove_file(&path);
            }
            Ok(false)
        }
    }
    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        let _ = enabled;
        Ok(false)
    }
}

#[tauri::command]
pub fn focus_main_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
    }
    Ok(())
}

#[tauri::command]
pub fn set_taskbar_badge(app: tauri::AppHandle, count: u32) -> Result<(), String> {
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

        #[cfg(not(any(target_os = "windows", target_os = "macos")))]
        {
            let _ = win;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn set_global_ptt(
    app: tauri::AppHandle,
    enabled: bool,
    key: String,
    release_delay_ms: Option<u64>,
) -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        if let Some(vk) = map_ptt_key_to_vk(&key) {
            GLOBAL_PTT_VK.store(vk, Ordering::Relaxed);
        }
        GLOBAL_PTT_RELEASE_DELAY_MS.store(
            clamp_ptt_release_delay_ms(release_delay_ms),
            Ordering::Relaxed,
        );
        GLOBAL_PTT_ENABLED.store(enabled, Ordering::Relaxed);
        if !enabled {
            let _ = app.emit("global-ptt-state", false);
        }
        if !GLOBAL_PTT_THREAD_STARTED.swap(true, Ordering::SeqCst) {
            let handle = app.clone();
            std::thread::spawn(move || {
                let mut active_emitted = false;
                let mut release_deadline: Option<std::time::Instant> = None;
                loop {
                    if !GLOBAL_PTT_ENABLED.load(Ordering::Relaxed) {
                        if active_emitted {
                            active_emitted = false;
                            release_deadline = None;
                            let _ = handle.emit("global-ptt-state", false);
                        }
                        std::thread::sleep(std::time::Duration::from_millis(220));
                        continue;
                    }
                    let vk = GLOBAL_PTT_VK.load(Ordering::Relaxed) as i32;
                    let is_down = unsafe {
                        (crate::remote_assist::win_input::GetAsyncKeyState(vk) as u16) & 0x8000 != 0
                    };
                    if is_down {
                        release_deadline = None;
                        if !active_emitted {
                            active_emitted = true;
                            let _ = handle.emit("global-ptt-state", true);
                        }
                    } else if active_emitted {
                        let delay_ms = GLOBAL_PTT_RELEASE_DELAY_MS.load(Ordering::Relaxed);
                        if delay_ms == 0 {
                            active_emitted = false;
                            release_deadline = None;
                            let _ = handle.emit("global-ptt-state", false);
                        } else {
                            let now = std::time::Instant::now();
                            let deadline = release_deadline.get_or_insert_with(|| {
                                now + std::time::Duration::from_millis(delay_ms)
                            });
                            if now >= *deadline {
                                active_emitted = false;
                                release_deadline = None;
                                let _ = handle.emit("global-ptt-state", false);
                            }
                        }
                    }
                    std::thread::sleep(std::time::Duration::from_millis(25));
                }
            });
        }
        Ok(enabled)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (app, enabled, key, release_delay_ms);
        Ok(false)
    }
}

pub(crate) fn format_tray_tooltip(
    in_voice: bool,
    is_muted: bool,
    is_deafened: bool,
    status: &str,
    channel_name: Option<&str>,
) -> String {
    if in_voice {
        let ch = channel_name
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or("Ses Odası");
        let audio_state = if is_deafened {
            "Sağırlaştırıldı"
        } else if is_muted {
            "Mikrofon Kapalı"
        } else {
            "Ses Aktif"
        };
        return format!("Çakma — #{} ({})", ch, audio_state);
    }

    let status_label = match status.trim().to_ascii_lowercase().as_str() {
        "idle" => "Boşta",
        "dnd" => "Rahatsız Etme",
        "offline" => "Çevrimdışı",
        _ => "Çevrimiçi",
    };
    format!("Çakma ({})", status_label)
}

pub(crate) fn render_tray_badge_rgba(
    base_rgba: &[u8],
    width: u32,
    height: u32,
    dot_rgba: [u8; 4],
) -> Vec<u8> {
    let expected_len = (width as usize)
        .saturating_mul(height as usize)
        .saturating_mul(4);
    let mut out = base_rgba.to_vec();
    if out.len() < expected_len || width < 8 || height < 8 {
        return out;
    }

    let w = width as f32;
    let h = height as f32;
    let r = (w.min(h) * 0.24).max(3.0);
    let cx = w - r - 1.0;
    let cy = h - r - 1.0;

    for y in 0..height {
        for x in 0..width {
            let dx = x as f32 - cx;
            let dy = y as f32 - cy;
            let dist = (dx * dx + dy * dy).sqrt();
            if dist <= r + 1.1 {
                let idx = ((y * width + x) * 4) as usize;
                if dist >= r - 0.8 {
                    // Crisp dark outline ring around the status badge
                    out[idx] = 15;
                    out[idx + 1] = 18;
                    out[idx + 2] = 28;
                    out[idx + 3] = 255;
                } else {
                    out[idx] = dot_rgba[0];
                    out[idx + 1] = dot_rgba[1];
                    out[idx + 2] = dot_rgba[2];
                    out[idx + 3] = dot_rgba[3];
                }
            }
        }
    }

    out
}

#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
pub(crate) fn render_taskbar_voice_overlay_rgba(dot_rgba: [u8; 4]) -> Vec<u8> {
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
                if dist >= 5.6 {
                    // Crisp dark halo border so badge stands out on light/dark taskbars
                    rgba[idx] = 15;
                    rgba[idx + 1] = 18;
                    rgba[idx + 2] = 28;
                    rgba[idx + 3] = 255;
                } else {
                    rgba[idx] = dot_rgba[0];
                    rgba[idx + 1] = dot_rgba[1];
                    rgba[idx + 2] = dot_rgba[2];
                    rgba[idx + 3] = dot_rgba[3];
                }
            }
        }
    }
    rgba
}

#[derive(serde::Serialize, Clone, Debug, PartialEq, Eq)]
pub struct CapturableWindowInfo {
    pub hwnd: isize,
    pub title: String,
    pub is_minimized: bool,
}

pub(crate) fn is_capturable_window_title(title: &str) -> bool {
    let trimmed = title.trim();
    if trimmed.is_empty() {
        return false;
    }
    let lower = trimmed.to_ascii_lowercase();
    if matches!(
        lower.as_str(),
        "program manager"
            | "settings"
            | "microsoft text input application"
            | "windows input experience"
            | "task switching"
            | "start"
            | "search"
    ) || trimmed.eq_ignore_ascii_case("çakma")
        || trimmed.eq_ignore_ascii_case("cakma")
        || trimmed.to_lowercase() == "çakma"
    {
        return false;
    }
    true
}

#[cfg(target_os = "windows")]
mod win_windows {
    pub type WndEnumProc = unsafe extern "system" fn(isize, isize) -> i32;

    #[link(name = "user32")]
    unsafe extern "system" {
        pub fn EnumWindows(lp_enum_func: WndEnumProc, l_param: isize) -> i32;
        pub fn IsWindowVisible(h_wnd: isize) -> i32;
        pub fn IsIconic(h_wnd: isize) -> i32;
        pub fn GetWindowTextLengthW(h_wnd: isize) -> i32;
        pub fn GetWindowTextW(h_wnd: isize, lp_string: *mut u16, n_max_count: i32) -> i32;
    }
}

#[cfg(target_os = "windows")]
unsafe extern "system" fn enum_capturable_windows_proc(hwnd: isize, l_param: isize) -> i32 {
    unsafe {
        if win_windows::IsWindowVisible(hwnd) == 0 {
            return 1;
        }
        let len = win_windows::GetWindowTextLengthW(hwnd);
        if len <= 0 {
            return 1;
        }
        let list = &mut *(l_param as *mut Vec<CapturableWindowInfo>);
        if list.len() >= 24 {
            return 0;
        }
        let buf_len = (len as usize).min(255) + 1;
        let mut buf = vec![0u16; buf_len];
        let copied = win_windows::GetWindowTextW(hwnd, buf.as_mut_ptr(), buf_len as i32);
        if copied > 0 {
            let title = String::from_utf16_lossy(&buf[..copied as usize]).trim().to_string();
            if is_capturable_window_title(&title) {
                let is_minimized = win_windows::IsIconic(hwnd) != 0;
                list.push(CapturableWindowInfo {
                    hwnd,
                    title,
                    is_minimized,
                });
            }
        }
    }
    1
}

#[tauri::command]
pub fn list_capturable_windows() -> Vec<CapturableWindowInfo> {
    #[cfg(target_os = "windows")]
    {
        let mut list: Vec<CapturableWindowInfo> = Vec::new();
        unsafe {
            win_windows::EnumWindows(
                enum_capturable_windows_proc,
                (&mut list as *mut Vec<CapturableWindowInfo>) as isize,
            );
        }
        list
    }
    #[cfg(not(target_os = "windows"))]
    {
        Vec::new()
    }
}

#[tauri::command]
pub fn update_tray_state(
    app: tauri::AppHandle,
    in_voice: bool,
    is_muted: bool,
    is_deafened: bool,
    status: String,
    channel_name: Option<String>,
) -> Result<(), String> {
    let voice_dot = if is_deafened {
        [245, 158, 11, 255] // Amber: deafened
    } else if is_muted {
        [239, 68, 68, 255] // Rose/Red: muted
    } else {
        [16, 185, 129, 255] // Emerald: active mic
    };

    if let Some(tray) = app.tray_by_id("main-tray") {
        let tip = format_tray_tooltip(
            in_voice,
            is_muted,
            is_deafened,
            &status,
            channel_name.as_deref(),
        );
        let _ = tray.set_tooltip(Some(tip));

        if in_voice {
            if let Some(base) = app.default_window_icon() {
                let badged = render_tray_badge_rgba(base.rgba(), base.width(), base.height(), voice_dot);
                let img = tauri::image::Image::new_owned(badged, base.width(), base.height());
                let _ = tray.set_icon(Some(img));
            }
        } else if let Some(base) = app.default_window_icon() {
            let _ = tray.set_icon(Some(base.clone()));
        }
    }

    #[cfg(target_os = "windows")]
    if let Some(win) = app.get_webview_window("main") {
        if in_voice {
            let overlay_rgba = render_taskbar_voice_overlay_rgba(voice_dot);
            let overlay_img = tauri::image::Image::new_owned(overlay_rgba, 16, 16);
            let _ = win.set_overlay_icon(Some(overlay_img));
        } else {
            let _ = win.set_overlay_icon(None);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        clamp_ptt_release_delay_ms, current_platform_capabilities,
        format_linux_autostart_desktop_entry, format_tray_tooltip, is_capturable_window_title,
        map_ptt_key_to_vk, render_taskbar_voice_overlay_rgba, render_tray_badge_rgba,
    };

    #[test]
    fn reports_consistent_platform_capabilities() {
        let caps = current_platform_capabilities();
        assert!(!caps.os.is_empty());
        assert!(!caps.arch.is_empty());
        assert_eq!(caps.global_ptt, cfg!(target_os = "windows"));
        assert_eq!(caps.global_shortcuts, cfg!(desktop));
        assert_eq!(caps.remote_assist_input, cfg!(target_os = "windows"));
        assert_eq!(
            caps.autostart,
            cfg!(target_os = "windows") || cfg!(target_os = "linux")
        );
        assert_eq!(
            caps.game_detection,
            cfg!(target_os = "windows") || cfg!(target_os = "macos")
        );
    }

    #[test]
    fn maps_mouse_buttons_and_clamps_ptt_release_delay() {
        assert_eq!(map_ptt_key_to_vk("Mouse4"), Some(0x05));
        assert_eq!(map_ptt_key_to_vk("XButton1"), Some(0x05));
        assert_eq!(map_ptt_key_to_vk("mouse5"), Some(0x06));
        assert_eq!(map_ptt_key_to_vk("XButton2"), Some(0x06));
        assert_eq!(map_ptt_key_to_vk("MouseMiddle"), Some(0x04));

        assert_eq!(clamp_ptt_release_delay_ms(None), 0);
        assert_eq!(clamp_ptt_release_delay_ms(Some(250)), 250);
        assert_eq!(clamp_ptt_release_delay_ms(Some(9000)), 1500);
    }

    #[test]
    fn formats_linux_autostart_desktop_entry() {
        let entry = format_linux_autostart_desktop_entry("/usr/bin/cakma");
        assert!(entry.contains("[Desktop Entry]"));
        assert!(entry.contains("Type=Application"));
        assert!(entry.contains("Exec=\"/usr/bin/cakma\""));
        assert!(entry.contains("X-GNOME-Autostart-enabled=true"));
    }

    #[test]
    fn formats_tray_tooltip_states() {
        assert_eq!(
            format_tray_tooltip(true, false, false, "online", Some("Lobi")),
            "Çakma — #Lobi (Ses Aktif)"
        );
        assert_eq!(
            format_tray_tooltip(true, true, false, "online", Some("Lobi")),
            "Çakma — #Lobi (Mikrofon Kapalı)"
        );
        assert_eq!(
            format_tray_tooltip(true, true, true, "online", None),
            "Çakma — #Ses Odası (Sağırlaştırıldı)"
        );
        assert_eq!(
            format_tray_tooltip(false, false, false, "dnd", None),
            "Çakma (Rahatsız Etme)"
        );
    }

    #[test]
    fn renders_tray_badge_dot_in_corner() {
        let base = vec![0u8; 32 * 32 * 4];
        let dot = [16, 185, 129, 255];
        let out = render_tray_badge_rgba(&base, 32, 32, dot);
        assert_eq!(out.len(), base.len());
        // Corner badge center area (~x=23, y=23) should receive the emerald dot pixels
        let mut found_dot = false;
        for chunk in out.chunks_exact(4) {
            if chunk == dot {
                found_dot = true;
                break;
            }
        }
        assert!(found_dot);
    }

    #[test]
    fn renders_taskbar_voice_overlay_icon_with_badge() {
        let dot = [239, 68, 68, 255];
        let rgba = render_taskbar_voice_overlay_rgba(dot);
        assert_eq!(rgba.len(), 16 * 16 * 4);
        assert!(rgba.chunks_exact(4).any(|px| px == dot));
    }

    #[test]
    fn filters_capturable_window_titles() {
        assert!(!is_capturable_window_title(""));
        assert!(!is_capturable_window_title("   "));
        assert!(!is_capturable_window_title("Program Manager"));
        assert!(!is_capturable_window_title("Settings"));
        assert!(!is_capturable_window_title("Çakma"));
        assert!(is_capturable_window_title("Visual Studio Code"));
        assert!(is_capturable_window_title("VALORANT"));
    }
}
