use std::path::Path;
use tokio::io::AsyncReadExt;

pub async fn compute_blake3_hash(path: &Path) -> std::io::Result<String> {
    let mut options = tokio::fs::OpenOptions::new();
    options.read(true);
    #[cfg(windows)]
    {
        options.share_mode(0x7);
    }
    let mut file = options.open(path).await?;
    let mut hasher = blake3::Hasher::new();
    let mut buffer = [0u8; 65536]; // 64KB buffer — matches sync hash functions

    loop {
        let n = file.read(&mut buffer).await?;
        if n == 0 {
            break;
        }
        hasher.update(&buffer[..n]);
    }

    Ok(hasher.finalize().to_hex().to_string())
}
