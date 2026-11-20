#[cfg(target_os = "windows")]
use winreg::enums::*;
#[cfg(target_os = "windows")]
use winreg::RegKey;

#[cfg(target_os = "windows")]
const RUN_SUBKEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
#[cfg(target_os = "windows")]
const VALUE_NAME: &str = "Send2Me";

#[cfg(target_os = "windows")]
pub fn is_autostart_registered() -> bool {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    if let Ok(run_key) = hkcu.open_subkey_with_flags(RUN_SUBKEY, KEY_READ) {
        if let Ok(raw_cmd) = run_key.get_value::<String, _>(VALUE_NAME) {
            return !raw_cmd.trim().is_empty();
        }
    }
    false
}

#[cfg(not(target_os = "windows"))]
pub fn is_autostart_registered() -> bool {
    false
}

#[cfg(target_os = "windows")]
pub fn set_autostart_registered(enable: bool) -> Result<(), String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);

    if enable {
        let exe_path = std::env::current_exe()
            .map_err(|e| format!("Failed to locate executable: {}", e))?;
        let exe_str = exe_path.to_string_lossy().to_string();
        if exe_str.is_empty() {
            return Err("Executable path is empty".to_string());
        }

        let cmd_value = format!("\"{}\" --autostart", exe_str);
        if let Ok(existing_key) = hkcu.open_subkey_with_flags(RUN_SUBKEY, KEY_READ) {
            if let Ok(existing_val) = existing_key.get_value::<String, _>(VALUE_NAME) {
                if existing_val == cmd_value {
                    return Ok(());
                }
            }
        }

        let (run_key, _) = hkcu
            .create_subkey_with_flags(RUN_SUBKEY, KEY_SET_VALUE | KEY_READ)
            .map_err(|e| format!("Failed to open startup registry key: {}", e))?;
        run_key
            .set_value(VALUE_NAME, &cmd_value)
            .map_err(|e| format!("Failed to save startup entry: {}", e))?;
        eprintln!(
            "[Send2Me Autostart] Registered Windows Startup: HKCU\\{}\\{} -> {}",
            RUN_SUBKEY, VALUE_NAME, cmd_value
        );
        Ok(())
    } else {
        let exists = hkcu
            .open_subkey_with_flags(RUN_SUBKEY, KEY_READ)
            .ok()
            .and_then(|k| k.get_value::<String, _>(VALUE_NAME).ok())
            .is_some();
        if !exists {
            return Ok(());
        }
        if let Ok(run_key) = hkcu.open_subkey_with_flags(RUN_SUBKEY, KEY_SET_VALUE) {
            let _ = run_key.delete_value(VALUE_NAME);
            eprintln!(
                "[Send2Me Autostart] Removed Windows Startup entry: HKCU\\{}\\{}",
                RUN_SUBKEY, VALUE_NAME
            );
        }
        Ok(())
    }
}

#[cfg(not(target_os = "windows"))]
pub fn set_autostart_registered(_enable: bool) -> Result<(), String> {
    Ok(())
}

pub fn sync_autostart_on_boot(enabled: bool) {
    #[cfg(target_os = "windows")]
    {
        let _ = set_autostart_registered(enabled);
    }
    #[cfg(not(target_os = "windows"))]
    let _ = enabled;
}
