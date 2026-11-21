#[cfg(target_os = "windows")]
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
#[cfg(target_os = "windows")]
use tauri::Emitter;
use tauri::Manager;

#[cfg(target_os = "windows")]
static GLOBAL_PTT_ENABLED: AtomicBool = AtomicBool::new(false);
#[cfg(target_os = "windows")]
static GLOBAL_PTT_VK: AtomicU8 = AtomicU8::new(0x11);
#[cfg(target_os = "windows")]
static GLOBAL_PTT_THREAD_STARTED: AtomicBool = AtomicBool::new(false);

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
    let is_desktop = cfg!(desktop);
    PlatformCapabilities {
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        global_ptt: is_windows,
        global_shortcuts: is_desktop,
        game_detection: is_windows || is_macos,
        remote_assist_input: is_windows,
        autostart: is_windows,
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
    #[cfg(not(target_os = "windows"))]
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
pub fn set_global_ptt(app: tauri::AppHandle, enabled: bool, key: String) -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        if let Some(vk) = crate::remote_assist::map_web_key_to_vk(&key, &key) {
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
                    let is_down = unsafe {
                        (crate::remote_assist::win_input::GetAsyncKeyState(vk) as u16) & 0x8000 != 0
                    };
                    if is_down != was_down {
                        was_down = is_down;
                        let _ = handle.emit("global-ptt-state", is_down);
                    }
                    std::thread::sleep(std::time::Duration::from_millis(25));
                }
            });
        }
        Ok(enabled)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (app, enabled, key);
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

#[tauri::command]
pub fn update_tray_state(
    app: tauri::AppHandle,
    in_voice: bool,
    is_muted: bool,
    is_deafened: bool,
    status: String,
    channel_name: Option<String>,
) -> Result<(), String> {
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
            let dot = if is_deafened {
                [245, 158, 11, 255] // Amber: deafened
            } else if is_muted {
                [239, 68, 68, 255] // Rose/Red: muted
            } else {
                [16, 185, 129, 255] // Emerald: active mic
            };
            if let Some(base) = app.default_window_icon() {
                let badged = render_tray_badge_rgba(base.rgba(), base.width(), base.height(), dot);
                let img = tauri::image::Image::new_owned(badged, base.width(), base.height());
                let _ = tray.set_icon(Some(img));
            }
        } else if let Some(base) = app.default_window_icon() {
            let _ = tray.set_icon(Some(base.clone()));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{current_platform_capabilities, format_tray_tooltip, render_tray_badge_rgba};

    #[test]
    fn reports_consistent_platform_capabilities() {
        let caps = current_platform_capabilities();
        assert!(!caps.os.is_empty());
        assert!(!caps.arch.is_empty());
        assert_eq!(caps.global_ptt, cfg!(target_os = "windows"));
        assert_eq!(caps.global_shortcuts, cfg!(desktop));
        assert_eq!(caps.remote_assist_input, cfg!(target_os = "windows"));
        assert_eq!(caps.autostart, cfg!(target_os = "windows"));
        assert_eq!(
            caps.game_detection,
            cfg!(target_os = "windows") || cfg!(target_os = "macos")
        );
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
}
