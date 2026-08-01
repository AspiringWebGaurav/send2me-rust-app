$commits = @(
    @{ m = "chore: project initialization and rust toolchain setup"; files = ".rustfmt.toml", "Cargo.toml", "Cargo.lock", "rust-toolchain.toml", "package-lock.json" },
    @{ m = "feat(core): implement core types and utility functions"; files = "crates/core/*" },
    @{ m = "feat(platform): implement platform-specific APIs"; files = "crates/platform/*" },
    @{ m = "feat(storage): implement secure local storage engine"; files = "crates/storage/*" },
    @{ m = "feat(network): setup discovery, pairing, and noise handshake"; files = "crates/network/src/discovery.rs", "crates/network/src/handshake.rs", "crates/network/src/pairing.rs", "crates/network/Cargo.toml", "crates/network/src/lib.rs" },
    @{ m = "feat(network): implement network manager and dummy relay"; files = "crates/network/src/network_manager.rs", "crates/network/src/dummy.rs" },
    @{ m = "feat(protocol): define sendme protocol identity and types"; files = "crates/sendme_protocol/src/identity.rs", "crates/sendme_protocol/src/types.rs", "crates/sendme_protocol/Cargo.toml", "crates/sendme_protocol/src/lib.rs" },
    @{ m = "feat(protocol): implement send/receive streaming logic"; files = "crates/sendme_protocol/src/send.rs", "crates/sendme_protocol/src/receive.rs", "crates/sendme_protocol/src/pairing*.rs", "crates/sendme_protocol/src/control.rs", "crates/sendme_protocol/src/relay.rs", "crates/sendme_protocol/src/time_compat.rs" },
    @{ m = "feat(transfer): implement chunked streaming and transfer manager"; files = "crates/transfer/*" },
    @{ m = "feat(engine): core engine runtime and identity store"; files = "crates/engine/src/runtime.rs", "crates/engine/src/identity_store.rs", "crates/engine/src/secret_store.rs", "crates/engine/Cargo.toml", "crates/engine/src/lib.rs" },
    @{ m = "feat(engine): implement node, pairing, and connections"; files = "crates/engine/src/node.rs", "crates/engine/src/paired_connections.rs", "crates/engine/src/pairing_util.rs", "crates/engine/src/device_identity.rs" },
    @{ m = "feat(engine): implement export, import, send, receive"; files = "crates/engine/src/export.rs", "crates/engine/src/import.rs", "crates/engine/src/send.rs", "crates/engine/src/receive.rs", "crates/engine/src/storage.rs", "crates/engine/src/types.rs" },
    @{ m = "feat(sync): implement folder watcher and manifest generation"; files = "crates/sync/src/watcher.rs", "crates/sync/src/manifest.rs", "crates/sync/src/hash.rs", "crates/sync/Cargo.toml", "crates/sync/src/lib.rs" },
    @{ m = "feat(sync): implement sync recovery and logger"; files = "crates/sync/src/recovery.rs", "crates/sync/src/logger.rs", "crates/sync/src/queue.rs", "crates/sync/src/manager.rs", "crates/sync/src/boot_sweeper.rs" },
    @{ m = "feat(p2p_drive): implement drive engine and protocol state"; files = "crates/p2p_drive/*" },
    @{ m = "feat(tauri): setup tauri bridge and services"; files = "apps/desktop/src-tauri/*" },
    @{ m = "feat(frontend): setup vite, tailwind, and react app shell"; files = "apps/desktop/vite.config.ts", "apps/desktop/tailwind.config.js", "apps/desktop/tsconfig*.json", "apps/desktop/src/index.css", "apps/desktop/src/main.tsx", "apps/desktop/src/App.tsx", "apps/desktop/src/layouts/*", "apps/desktop/src/assets/*", "apps/desktop/src/lib/*" },
    @{ m = "feat(frontend): implement core store models (zustand)"; files = "apps/desktop/src/stores/*", "apps/desktop/src/models/*", "apps/desktop/src/utils/*", "apps/desktop/src/hooks/*" },
    @{ m = "feat(frontend): build reusable UI components"; files = "apps/desktop/src/components/ui/*" },
    @{ m = "feat(frontend): implement dashboard and device management"; files = "apps/desktop/src/pages/Dashboard.tsx", "apps/desktop/src/pages/Devices.tsx", "apps/desktop/src/pages/History.tsx", "apps/desktop/src/pages/Settings.tsx", "apps/desktop/src/pages/Transfers.tsx", "apps/desktop/src/components/Navbar.tsx", "apps/desktop/src/components/Footer.tsx", "apps/desktop/src/components/Logo.tsx", "apps/desktop/src/components/HardwareStatusBadge.tsx" },
    @{ m = "feat(frontend): implement folder sync UI and modals"; files = "apps/desktop/src/pages/FolderSync.tsx", "apps/desktop/src/components/FolderSync*.tsx", "apps/desktop/src/components/PairDeviceModal.tsx", "apps/desktop/src/components/ReceiveModal.tsx", "apps/desktop/src/components/SendModal.tsx", "apps/desktop/src/components/BindTermsModal.tsx", "apps/desktop/src/components/PermissionOverlay.tsx" },
    @{ m = "feat(frontend): implement dynamic p2p drive ui with active transfers"; files = "apps/desktop/src/pages/DriveRoom.tsx", "apps/desktop/src/pages/DriveGuest.tsx", "apps/desktop/src/components/P2PDriveCard.tsx" },
    @{ m = "docs: add comprehensive architecture and getting started documentation"; files = "docs/*", "README.md", "LICENSE", ".gitignore" },
    @{ m = "chore: finalize remaining loose files"; files = "." }
)

foreach ($c in $commits) {
    foreach ($file in $c.files) {
        git add $file
    }
    git commit -m $c.m
}
