# Architecture & Technical Stack

Send2Me is built using a modern, deeply optimized, and highly secure architecture designed for peer-to-peer applications.

## Technical Stack

- **Frontend Core:** React 18 with TypeScript
- **Styling:** Tailwind CSS + Framer Motion (for fluid micro-animations)
- **State Management:** Zustand (for highly performant, reactive global state)
- **Backend Core:** Rust (compiled natively for maximum performance)
- **Desktop Framework:** Tauri (v2) - incredibly lightweight compared to Electron
- **Networking:** Iroh (A highly advanced, NAT-traversing peer-to-peer networking stack)
- **Database:** SQLite (embedded locally for connection history and sync logs)

## How it Works

### 1. The Tauri Bridge
Send2Me utilizes Tauri to bridge the blazing-fast Rust backend with the React frontend.
- **Frontend -> Backend:** React calls Rust using Tauri's `invoke` API. This allows the UI to trigger heavy file I/O operations and network requests asynchronously without blocking the UI thread.
- **Backend -> Frontend:** Rust pushes real-time updates (like live transfer progress, connection state, and folder sync events) directly to React using Tauri's event emitter (`emit`).

### 2. Peer-to-Peer Networking (Iroh)
Iroh is the backbone of Send2Me. It provides:
- **NAT Traversal:** Allows two computers on entirely different networks (behind routers/firewalls) to establish a direct connection using hole punching.
- **Magic Sockets:** Ensures that data paths automatically upgrade from relay servers to direct local-network connections whenever possible (e.g., if both devices are on the same WiFi).
- **Security:** All connections are authenticated and encrypted end-to-end using Noise protocols.

### 3. State Management Architecture
The React frontend leverages Zustand to manage complex P2P states:
- `useDriveStore`: Manages the live state of active guests, remote virtual files, and pending download/upload requests.
- `useSyncStore`: Manages the intense local-state mirroring logic for strict folder synchronization.
- `useTransferStore`: Tracks all live file transfers and their byte-for-byte completion status.

### 4. Background Workers
The Rust backend spawns highly efficient, asynchronous Tokio threads to handle:
- **P2P Listening:** Actively listening for inbound connection requests.
- **File System Watching:** Using native OS APIs to instantly detect when a file is modified, created, or deleted for folder syncing.
- **Chunked File Transferring:** Reading and writing massive files in manageable chunks to ensure zero memory bloat.
