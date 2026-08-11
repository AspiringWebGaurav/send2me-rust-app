const fs = require('fs');

const version = process.argv[2] || '0.1.6';

const content = `Fast, 100% Private, Direct File Transfer & Sync Between Devices — Zero Cloud Required.

---

### ⚡ Quick Start Guide (3 Easy Steps)

| 1️⃣ Download | 2️⃣ Install | 3️⃣ Start Sharing |
| :---: | :---: | :---: |
| Click the download link for your computer below | Double-click the downloaded file to run setup | Pick files and send them directly to any device! |

---

### 💻 Downloads by Computer Type

#### 🪟 Windows (10 / 11)
- 👉 **Send2Me_${version}_x64-setup.exe** — **⭐ RECOMMENDED** *(Standard setup wizard with start menu shortcuts)*

<details>
<summary>🛠️ Advanced Windows Options (MSI, Portable)</summary>

- **Enterprise MSI Installer:** \`Send2Me_${version}_x64.msi\` *(For IT deployment)*
- **Portable Executable:** \`Send2Me_${version}_x64-portable.exe\` *(No install required)*
- **Portable ZIP Archive:** \`Send2Me_${version}_windows-x64.zip\`
</details>

#### 🍎 Mac (macOS)
- 🍏 **Send2Me_${version}_macOS-arm64.dmg** — **Apple Silicon (M1 / M2 / M3 / M4)**
- 💻 **Send2Me_${version}_macOS-x86_64.dmg** — **Intel Macs**

#### 🐧 Linux (Ubuntu, Debian, Fedora, Arch)
- 🚀 **Send2Me_${version}_Linux-x86_64.AppImage** — **Universal Run File** *(Double-click to run)*
- 📦 **Send2Me_${version}_Linux-x86_64.deb** — **Debian / Ubuntu Package**

---

<details>
<summary><b>🔒 Cryptographic Checksums & Technical Verification</b></summary>

Verify SHA-256 package integrity against **SHA256SUMS.txt** attached in Assets below:
- **Windows PowerShell:** \`Get-FileHash -Algorithm SHA256 .\\\\Send2Me_${version}_x64-setup.exe\`
- **Linux / macOS:** \`sha256sum Send2Me_${version}_Linux-x86_64.AppImage\`
</details>
`;

fs.writeFileSync('RELEASE_NOTES.md', content);
console.log('Successfully generated RELEASE_NOTES.md for version ' + version);
