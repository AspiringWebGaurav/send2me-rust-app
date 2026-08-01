<div align="center">
  <img src="https://raw.githubusercontent.com/tauri-apps/tauri/HEAD/app-icon.png" width="128" height="128" alt="Send2Me Logo">
  
  # Send2Me
  
  **Secure, Blazing-Fast, Peer-to-Peer File Transfer & Synchronization Desktop Application.**
  
  [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
  [![Built with Tauri](https://img.shields.io/badge/Built%20with-Tauri-FFC131.svg?logo=tauri)](https://tauri.app/)
  [![Rust](https://img.shields.io/badge/Rust-000000.svg?logo=rust&logoColor=white)](https://www.rust-lang.org/)
  [![React](https://img.shields.io/badge/React-20232A?logo=react&logoColor=61DAFB)](https://reactjs.org/)
</div>

<br/>

Send2Me is a next-generation desktop application designed to make local network and peer-to-peer file sharing effortless and strictly private. Built with a deeply optimized Rust backend and a beautiful React frontend, Send2Me operates entirely peer-to-peer without relying on centralized servers or third-party cloud providers.

## ✨ Key Features

- 🚀 **Direct File Transfers:** Send massive files instantly across the room or the world with zero bottlenecks.
- 🔒 **End-to-End Encryption:** All data in transit is fully encrypted and secured. Nobody but you can access your files.
- 📂 **Strict Folder Synchronization:** Bind two devices together and keep a designated folder in absolute, strict parity (P2P Sync).
- 🎨 **Beautiful UI:** A stunning, modern, and highly responsive user interface designed with dynamic animations and premium aesthetics.
- 🌐 **No Cloud Limits:** Your files never touch a cloud server. Transfer sizes are limited only by your hard drive space.

For a comprehensive dive into all features, please see the [Features Documentation](docs/Features.md).

## 🏗️ Architecture

Send2Me leverages a highly performant and modern technology stack:

- **Frontend:** [React 18](https://reactjs.org/) + [TypeScript](https://www.typescriptlang.org/) + [Tailwind CSS](https://tailwindcss.com/) + [Framer Motion](https://www.framer.com/motion/)
- **Backend:** [Rust](https://www.rust-lang.org/) powering [Tauri](https://tauri.app/)
- **Networking Core:** [Iroh](https://iroh.computer/) for NAT-traversing, high-speed, secure P2P connections.

## 🛠️ Getting Started (Development)

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://www.rust-lang.org/tools/install)
- Relevant C++ Build Tools depending on your OS (See [Tauri Prerequisites](https://v2.tauri.app/start/prerequisites/))

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/send2me.git
   cd send2me
   ```

2. Install frontend dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run tauri dev
   ```
   *This command will compile the Rust backend and launch the React frontend with hot-module reloading.*

## 📦 Building for Production

To build an optimized, release-ready executable for your OS:

```bash
npm run tauri build
```
The compiled binaries will be located in `apps/desktop/src-tauri/target/release/bundle/`.

## 📄 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

---
<div align="center">
  <i>Crafted with passion for secure and open-source data ownership.</i>
</div>
