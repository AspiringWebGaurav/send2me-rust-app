# Folder Synchronization (P2P Sync)

One of Send2Me's most powerful features is **Strict Folder Synchronization**. Unlike traditional cloud-based syncing (like Google Drive) which acts as a centralized bucket, Send2Me establishes a direct, 1-to-1 strict mirror between two specific devices.

## How it Works

When you bind a folder between Device A and Device B:
1. **Manifest Generation:** Both devices scan their respective folders and generate a highly optimized cryptographic manifest of every file, its size, and its modification timestamp.
2. **Delta Comparison:** The devices exchange manifests over the secure P2P Iroh connection and instantly calculate the "delta" (the differences between the two folders).
3. **Queue Execution:** A sync queue is generated to push new files, request missing files, and delete removed files.

## Strict Parity & "Zero Waste" Policy

Send2Me is designed as a **Strict Mirror**. 
- If you delete a file on Device A, it will be permanently deleted on Device B.
- Send2Me does **not** use hidden `.trash` or `.recycle` folders. When a file is removed, the disk space is immediately freed.
- This ensures that your synced folders do not suffer from "bloat" over time, making it perfect for mirroring massive media libraries or project files.

## Conflict Resolution

Because Send2Me is a strict mirror, conflicts (where the same file is edited on both devices simultaneously while offline) are handled through a deterministic "last-writer-wins" approach based on the POSIX modification timestamp. The most recently modified version of the file will overwrite the older version upon the next successful connection.

## Self-Healing Mechanism

File transfers can be interrupted if a laptop goes to sleep or drops its WiFi connection. Send2Me's sync engine is fully self-healing.
- Active transfers are checkpointed.
- Upon reconnection, the sync engine re-evaluates the manifest delta.
- Any partially transferred files will resume, and any missed events (files created while offline) will be immediately queued and processed.
