//! Native filesystem export: iroh-blobs collection → directory on disk.

use iroh_blobs::{
    api::{
        blobs::{ExportMode, ExportOptions, ExportProgressItem},
        Store,
    },
    format::collection::Collection,
};
use n0_future::{BufferedStreamExt, StreamExt};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::Mutex;

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportConflict {
    pub original: String,
    pub resolved: String,
}

/// Export a collection into `output_dir`, resolving filename conflicts when needed.
pub async fn export_to_directory(
    db: &Store,
    collection: Collection,
    output_dir: &Path,
    concurrency: usize,
) -> anyhow::Result<Vec<ExportConflict>> {
    let items: Vec<(String, iroh_blobs::Hash)> =
        collection.iter().map(|(n, h)| (n.clone(), *h)).collect();

    let conflicts: Arc<Mutex<Vec<ExportConflict>>> = Arc::new(Mutex::new(Vec::new()));

    let stream = n0_future::stream::iter(items).map(|(name, hash)| {
        let db = db.clone();
        let output_dir = output_dir.to_path_buf();
        let conflicts = conflicts.clone();
        async move {
            let desired_target = get_export_path(&output_dir, &name)?;
            if let Some(parent) = desired_target.parent() {
                tokio::fs::create_dir_all(parent).await.map_err(|e| {
                    anyhow::anyhow!("failed creating export parent {}: {}", parent.display(), e)
                })?;
            }
            let target = find_free_path(&desired_target)?;
            if target != desired_target {
                conflicts.lock().await.push(ExportConflict {
                    original: desired_target.to_string_lossy().to_string(),
                    resolved: target.to_string_lossy().to_string(),
                });
            }
            let mut stream = db
                .export_with_opts(ExportOptions {
                    hash,
                    target,
                    mode: ExportMode::Copy,
                })
                .stream()
                .await;
            while let Some(item) = stream.next().await {
                if let ExportProgressItem::Error(cause) = item {
                    anyhow::bail!("error exporting {}: {}", name, cause);
                }
            }
            anyhow::Ok(())
        }
    });

    stream
        .buffered_unordered(concurrency)
        .collect::<Vec<_>>()
        .await
        .into_iter()
        .collect::<anyhow::Result<Vec<_>>>()?;

    let conflicts = Arc::try_unwrap(conflicts)
        .map_err(|_| anyhow::anyhow!("conflicts arc leaked"))?
        .into_inner();
    Ok(conflicts)
}

/// Atomically claim a free path using `create_new`, bumping the index on conflict.
fn find_free_path(desired: &Path) -> anyhow::Result<PathBuf> {
    match std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(desired)
    {
        Ok(_) => {
            let _ = std::fs::remove_file(desired);
            return Ok(desired.to_path_buf());
        }
        Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {}
        Err(e) => {
            return Err(e)
                .map_err(|e| anyhow::anyhow!("cannot create {}: {}", desired.display(), e))
        }
    }

    let parent = desired
        .parent()
        .ok_or_else(|| anyhow::anyhow!("path has no parent: {}", desired.display()))?;
    let stem = desired
        .file_stem()
        .and_then(|x| x.to_str())
        .ok_or_else(|| anyhow::anyhow!("invalid file stem: {}", desired.display()))?;
    let ext = desired.extension().and_then(|x| x.to_str());

    for index in 1..10_000u32 {
        let name = match ext {
            Some(e) => format!("{} ({}).{}", stem, index, e),
            None => format!("{} ({})", stem, index),
        };
        let candidate = parent.join(name);
        match std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&candidate)
        {
            Ok(_) => {
                let _ = std::fs::remove_file(&candidate);
                return Ok(candidate);
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => {
                return Err(e).map_err(|e| {
                    anyhow::anyhow!("cannot create {}: {}", candidate.display(), e)
                })
            }
        }
    }
    anyhow::bail!("too many filename conflicts for {}", desired.display())
}

fn get_export_path(root: &Path, name: &str) -> anyhow::Result<PathBuf> {
    let parts = name.split('/');
    let mut path = root.to_path_buf();
    for part in parts {
        validate_path_component(part)?;
        path.push(part);
    }
    Ok(path)
}

fn validate_path_component(component: &str) -> anyhow::Result<()> {
    anyhow::ensure!(!component.is_empty(), "empty path component");
    anyhow::ensure!(!component.contains('/'), "contains /");
    anyhow::ensure!(!component.contains('\\'), "contains \\");
    anyhow::ensure!(!component.contains(':'), "contains colon");
    anyhow::ensure!(component != "..", "parent directory traversal");
    anyhow::ensure!(component != ".", "current directory reference");
    anyhow::ensure!(!component.contains('\0'), "contains null byte");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_rejects_empty() {
        assert!(validate_path_component("").is_err());
    }

    #[test]
    fn validate_rejects_slash() {
        assert!(validate_path_component("a/b").is_err());
    }

    #[test]
    fn validate_rejects_backslash() {
        assert!(validate_path_component("a\\b").is_err());
    }

    #[test]
    fn validate_rejects_parent_traversal() {
        assert!(validate_path_component("..").is_err());
    }

    #[test]
    fn validate_rejects_dot() {
        assert!(validate_path_component(".").is_err());
    }

    #[test]
    fn validate_rejects_null_byte() {
        assert!(validate_path_component("a\0b").is_err());
    }

    #[test]
    fn validate_rejects_colon() {
        assert!(validate_path_component("C:foo").is_err());
    }

    #[test]
    fn validate_accepts_normal() {
        assert!(validate_path_component("file.txt").is_ok());
        assert!(validate_path_component("my-file_v2.tar.gz").is_ok());
    }

    #[test]
    fn get_export_path_blocks_drive_prefix() {
        let root = Path::new("/tmp/test");
        assert!(get_export_path(root, "C:foo").is_err());
    }

    #[test]
    fn get_export_path_blocks_traversal() {
        let root = Path::new("/tmp/test");
        assert!(get_export_path(root, "../etc/passwd").is_err());
        assert!(get_export_path(root, "subdir/../../etc/passwd").is_err());
    }

    #[test]
    fn get_export_path_blocks_backslash() {
        assert!(get_export_path(Path::new("/tmp/test"), "file\\name").is_err());
    }

    #[test]
    fn get_export_path_allows_normal() {
        let p = get_export_path(Path::new("/tmp/test"), "subdir/file.txt").unwrap();
        assert_eq!(p, PathBuf::from("/tmp/test/subdir/file.txt"));
    }
}
