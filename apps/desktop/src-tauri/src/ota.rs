use std::path::{Path, PathBuf};
use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce, Key
};
use sha2::{Digest, Sha256};

const OTA_SEED_CANDIDATES: &[&str] = &[
    "send2me-internal-ota-key-com.send2me.app.ota.payload.v1",
    "send2me-ota-payload-seed",
];

/// Decrypts in memory an AES-256-GCM container packaged with `S2ME_OTA` format
pub fn decrypt_ota_container(data: &[u8]) -> Result<Vec<u8>, String> {
    // 1. If payload is already raw Windows PE executable (starts with MZ), return directly
    if data.len() >= 2 && data[0] == b'M' && data[1] == b'Z' {
        return Ok(data.to_vec());
    }

    // Minimum header size: 8 (magic) + 16 (ver) + 8 (size) + 12 (iv) + 16 (tag) = 60 bytes
    if data.len() < 60 {
        return Err("OTA container is too small to be valid".to_string());
    }

    if !data.starts_with(b"S2ME_OTA") {
        return Err("Unrecognized container magic header (expected S2ME_OTA)".to_string());
    }

    let _version_bytes = &data[8..24];
    let size_bytes: [u8; 8] = data[24..32].try_into().map_err(|_| "Invalid size header")?;
    let expected_size = u64::from_be_bytes(size_bytes) as usize;

    let iv = &data[32..44];
    let tag = &data[44..60];
    let ciphertext = &data[60..];

    // In aes-gcm crate, tag is appended to ciphertext for decrypt
    let mut combined = Vec::with_capacity(ciphertext.len() + tag.len());
    combined.extend_from_slice(ciphertext);
    combined.extend_from_slice(tag);

    let mut last_err = String::new();

    for seed in OTA_SEED_CANDIDATES {
        let mut hasher = Sha256::new();
        hasher.update(seed.as_bytes());
        let key_bytes = hasher.finalize();
        let key = Key::<Aes256Gcm>::from_slice(&key_bytes);
        let cipher = Aes256Gcm::new(key);
        let nonce = Nonce::from_slice(iv);

        match cipher.decrypt(nonce, combined.as_ref()) {
            Ok(plaintext) => {
                if plaintext.len() >= 2 && plaintext[0] == b'M' && plaintext[1] == b'Z' {
                    if expected_size > 0 && plaintext.len() != expected_size {
                        tracing::warn!(
                            "[Send2Me OTA] Size mismatch warning: expected {} bytes, got {}",
                            expected_size,
                            plaintext.len()
                        );
                    }
                    return Ok(plaintext);
                } else {
                    last_err = "Decrypted payload failed Windows PE MZ header verification".to_string();
                }
            }
            Err(e) => {
                last_err = format!("AES-256-GCM authentication/decryption failed: {:?}", e);
            }
        }
    }

    Err(last_err)
}

/// Fetches latest release manifest via native reqwest (bypasses browser CORS & Webview2 policies)
pub async fn fetch_manifest(url: &str) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get(url)
        .header("User-Agent", "Send2Me-Desktop-OTA/0.0.1")
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch manifest: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Manifest fetch returned HTTP {}", resp.status()));
    }

    resp.text().await.map_err(|e| e.to_string())
}

/// Downloads container, decrypts in memory, verifies PE header, performs atomic NTFS swap and detached restart
pub async fn download_and_apply_update(
    app: &tauri::AppHandle,
    url: &str,
    target_version: &str,
) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(45))
        .build()
        .map_err(|e| e.to_string())?;

    tracing::info!("[Send2Me OTA] Downloading update from {} ...", url);
    let resp = client
        .get(url)
        .header("User-Agent", "Send2Me-Desktop-OTA/0.0.1")
        .send()
        .await
        .map_err(|e| format!("Download request failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Download returned HTTP {}", resp.status()));
    }

    let bytes = resp.bytes().await.map_err(|e| format!("Failed to read stream: {}", e))?;
    tracing::info!("[Send2Me OTA] Downloaded {} bytes. Decrypting container in memory...", bytes.len());

    let payload = decrypt_ota_container(&bytes)?;
    tracing::info!("[Send2Me OTA] Container decrypted successfully ({} bytes). Verified PE MZ header.", payload.len());

    // 1. Stage verified binary in local temp
    let temp_dir = std::env::temp_dir().join("com.send2me.desktop");
    let _ = std::fs::create_dir_all(&temp_dir);
    let staged_file = temp_dir.join(format!("send2me_staged_{}.exe", target_version));
    std::fs::write(&staged_file, &payload).map_err(|e| format!("Failed to write staging file: {}", e))?;

    // 2. Perform Windows NTFS shadow swap
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;

        let current_exe = std::env::current_exe().map_err(|e| e.to_string())?;
        let exe_dir = current_exe.parent().ok_or("Cannot resolve exe parent directory")?;
        let exe_name = current_exe.file_name().ok_or("Cannot resolve exe file name")?;

        let old_exe = exe_dir.join(format!("{}.old", exe_name.to_string_lossy()));
        let tmp_exe = exe_dir.join(format!("{}.tmp", exe_name.to_string_lossy()));

        // Clean stale temporary remnants first
        if old_exe.exists() {
            let _ = std::fs::remove_file(&old_exe);
        }
        if tmp_exe.exists() {
            let _ = std::fs::remove_file(&tmp_exe);
        }

        // Copy staged binary to tmp next to running executable
        std::fs::copy(&staged_file, &tmp_exe)
            .map_err(|e| format!("Failed to stage binary adjacent to target: {}", e))?;

        // In-process atomic rename: current_exe -> old_exe
        std::fs::rename(&current_exe, &old_exe)
            .map_err(|e| format!("Failed to rename running executable to .old: {}", e))?;

        // Replace target: tmp_exe -> current_exe
        if let Err(e) = std::fs::rename(&tmp_exe, &current_exe) {
            // Rollback on failure
            let _ = std::fs::rename(&old_exe, &current_exe);
            return Err(format!("Failed to place new executable in place (rolled back): {}", e));
        }

        tracing::info!("[Send2Me OTA] Atomic shadow swap complete! Spawning detached restart process...");

        // Win32 Detached Spawn
        let mut cmd = std::process::Command::new(&current_exe);
        cmd.arg("--update-restart");
        cmd.arg("--restarted");
        cmd.arg(format!("--parent-pid={}", std::process::id()));
        cmd.arg("--show");
        cmd.stdin(std::process::Stdio::null());
        cmd.stdout(std::process::Stdio::null());
        cmd.stderr(std::process::Stdio::null());
        cmd.creation_flags(0x08000000 | 0x00000008); // CREATE_NO_WINDOW | DETACHED_PROCESS

        let _ = cmd.spawn().map_err(|e| format!("Failed to spawn restart process: {}", e))?;
    }

    app.exit(0);
    Ok(())
}

/// Cleans superseded .old executables and temporary staging files
pub fn clean_superseded_old_binaries() -> Result<bool, String> {
    let mut cleaned = false;
    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(parent) = current_exe.parent() {
            if let Some(file_name) = current_exe.file_name() {
                let old_exe = parent.join(format!("{}.old", file_name.to_string_lossy()));
                if old_exe.exists() {
                    let _ = std::fs::remove_file(old_exe);
                    cleaned = true;
                }
            }
        }
    }

    let temp_dir = std::env::temp_dir().join("com.send2me.desktop");
    if temp_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&temp_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().is_some_and(|ext| ext == "exe" || ext == "tmp") {
                    let _ = std::fs::remove_file(&path);
                    cleaned = true;
                }
            }
        }
    }

    Ok(cleaned)
}
