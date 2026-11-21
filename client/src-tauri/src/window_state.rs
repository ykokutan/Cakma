use std::sync::{
    Mutex, OnceLock,
    atomic::{AtomicBool, AtomicU64, Ordering},
};
use tauri::Manager;

pub(crate) static CLOSE_TO_TRAY: AtomicBool = AtomicBool::new(true);
pub(crate) static LAST_WIN_SAVE_MS: AtomicU64 = AtomicU64::new(0);
static PENDING_DEEP_LINK: OnceLock<Mutex<Option<String>>> = OnceLock::new();

pub(crate) fn pending_deep_link_store() -> &'static Mutex<Option<String>> {
    PENDING_DEEP_LINK.get_or_init(|| Mutex::new(None))
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq, Eq)]
pub(crate) struct WindowState {
    pub x: Option<i32>,
    pub y: Option<i32>,
    pub width: u32,
    pub height: u32,
    pub maximized: bool,
    pub close_to_tray: bool,
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

pub(crate) fn load_window_state(app: &tauri::AppHandle) -> WindowState {
    if let Some(p) = window_state_path(app)
        && let Ok(raw) = std::fs::read_to_string(&p)
        && let Ok(parsed) = serde_json::from_str::<WindowState>(&raw)
    {
        return parsed;
    }
    WindowState::default()
}

pub(crate) fn save_window_state(app: &tauri::AppHandle, state: &WindowState) {
    if let Some(p) = window_state_path(app)
        && let Ok(json) = serde_json::to_string_pretty(state)
    {
        let _ = std::fs::write(p, json);
    }
}

pub(crate) fn capture_and_persist_window_state(win: &tauri::WebviewWindow) {
    let app = win.app_handle();
    let mut st = load_window_state(app);
    st.close_to_tray = CLOSE_TO_TRAY.load(Ordering::Relaxed);
    if let Ok(maximized) = win.is_maximized() {
        st.maximized = maximized;
        if !maximized {
            if let Ok(size) = win.inner_size()
                && size.width >= 940
                && size.height >= 500
            {
                st.width = size.width;
                st.height = size.height;
            }
            if let Ok(pos) = win.outer_position()
                && (-3200..=6400).contains(&pos.x)
                && (-1600..=3600).contains(&pos.y)
            {
                st.x = Some(pos.x);
                st.y = Some(pos.y);
            }
        }
    }
    save_window_state(app, &st);
}

pub(crate) fn extract_deep_link_from_args<I: IntoIterator<Item = String>>(
    args: I,
) -> Option<String> {
    args.into_iter()
        .find(|a| a.to_ascii_lowercase().starts_with("cakma://"))
}

#[cfg(target_os = "windows")]
pub(crate) fn register_cakma_protocol_windows() {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    if let Ok(exe) = std::env::current_exe() {
        let cmd_val = format!("\"{}\" \"%1\"", exe.display());
        let _ = std::process::Command::new("reg")
            .args([
                "add",
                "HKCU\\Software\\Classes\\cakma",
                "/ve",
                "/t",
                "REG_SZ",
                "/d",
                "URL:Cakma Protocol",
                "/f",
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
        let _ = std::process::Command::new("reg")
            .args([
                "add",
                "HKCU\\Software\\Classes\\cakma",
                "/v",
                "URL Protocol",
                "/t",
                "REG_SZ",
                "/d",
                "",
                "/f",
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
        let _ = std::process::Command::new("reg")
            .args([
                "add",
                "HKCU\\Software\\Classes\\cakma\\shell\\open\\command",
                "/ve",
                "/t",
                "REG_SZ",
                "/d",
                &cmd_val,
                "/f",
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
    }
}

#[tauri::command]
pub fn get_close_to_tray() -> bool {
    CLOSE_TO_TRAY.load(Ordering::Relaxed)
}

#[tauri::command]
pub fn set_close_to_tray(app: tauri::AppHandle, enabled: bool) -> Result<bool, String> {
    CLOSE_TO_TRAY.store(enabled, Ordering::Relaxed);
    let mut st = load_window_state(&app);
    st.close_to_tray = enabled;
    save_window_state(&app, &st);
    Ok(enabled)
}

#[tauri::command]
pub fn take_pending_deep_link() -> Option<String> {
    pending_deep_link_store()
        .lock()
        .ok()
        .and_then(|mut g| g.take())
}

#[cfg(test)]
mod tests {
    use super::{WindowState, extract_deep_link_from_args};

    #[test]
    fn extracts_cakma_deep_link_case_insensitively() {
        let found = extract_deep_link_from_args(vec![
            "cakma.exe".to_string(),
            "--flag".to_string(),
            "CAKMA://join/abc123".to_string(),
        ]);
        assert_eq!(found.as_deref(), Some("CAKMA://join/abc123"));
    }

    #[test]
    fn returns_none_when_no_deep_link_present() {
        let found = extract_deep_link_from_args(vec![
            "cakma.exe".to_string(),
            "https://example.com".to_string(),
        ]);
        assert_eq!(found, None);
    }

    #[test]
    fn provides_sane_default_window_state() {
        let st = WindowState::default();
        assert_eq!(st.width, 1280);
        assert_eq!(st.height, 780);
        assert!(!st.maximized);
        assert!(st.close_to_tray);
    }
}
