# Developer Getting Started Guide

Welcome to the Send2Me project! Follow these instructions to set up your local development environment.

## 1. Prerequisites

Because Send2Me is built with Tauri, it requires native build tools in addition to Node.js.

### Windows
1. Install [Node.js](https://nodejs.org/) (v18 or higher)
2. Install [Rust](https://www.rust-lang.org/tools/install)
3. Install **Visual Studio C++ Build Tools**. You can download the Build Tools for Visual Studio 2022. During installation, select the "Desktop development with C++" workload.

### macOS
1. Install [Node.js](https://nodejs.org/)
2. Install [Rust](https://www.rust-lang.org/tools/install)
3. Install Xcode Command Line Tools: `xcode-select --install`

### Linux
1. Install [Node.js](https://nodejs.org/)
2. Install [Rust](https://www.rust-lang.org/tools/install)
3. Install system dependencies (Ubuntu/Debian):
   `sudo apt update && sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev`

## 2. Setup the Repository

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/send2me.git
   cd send2me
   ```

2. Install Node dependencies. The workspace root and the `apps/desktop` folder require installation.
   ```bash
   npm install
   cd apps/desktop
   npm install
   cd ../..
   ```

## 3. Running the App in Development Mode

To start the application with hot-module replacement (HMR) for React, and hot-reloading for Rust:

```bash
npm run tauri dev
```

*Note: The first time you run this command, Cargo will download and compile all Rust crates. This might take several minutes depending on your hardware. Subsequent builds will be significantly faster.*

## 4. Building for Production

When you are ready to distribute the app, run:

```bash
npm run tauri build
```

This command produces highly optimized, natively compiled executable installers (`.msi` / `.exe` on Windows, `.app` / `.dmg` on macOS, `.deb` / `.AppImage` on Linux) inside of `apps/desktop/src-tauri/target/release/bundle`.

## 5. Troubleshooting

- **Cargo Build Fails on Windows:** Ensure the "Desktop development with C++" workload is fully installed in Visual Studio Installer.
- **Node out of memory:** If the vite build fails, ensure you are running an updated version of Node (v18+).
- **Tauri Cannot Find WebView2:** On older Windows machines, you may need to install the Microsoft Edge WebView2 Runtime.
