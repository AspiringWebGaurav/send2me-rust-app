# Send2Me GitHub Release Pipeline Guide

## Current Status: ⏸️ DISCONNECTED (Paused for Database & Feature Work)

As requested, the automatic release workflow has been **temporarily disconnected** so pushing commits during database integration will **not** publish any premature releases to GitHub.

---

## 📁 Pipeline Overview

All release logic, build configurations, and packaging steps are **fully preserved and tested**:
- **File Location:** [`.github/workflows/release.yml`](file:///c:/github/send2me-rust-app/.github/workflows/release.yml)
- **Supported Targets:**
  - 🪟 **Windows x64:** NSIS Setup EXE, Enterprise MSI, Portable Binary, ZIP
  - 🍎 **macOS (Universal):** Apple Silicon (`arm64`) & Intel (`x86_64`) DMG
  - 🐧 **Linux x64:** Universal AppImage, Debian `.deb`, Standalone `.tar.gz`
  - 🔒 **Verification:** Unified `SHA256SUMS.txt` cryptographic digest table

---

## 🔌 How to Reconnect Automatic Releases

When you are ready to publish official releases again (after completing database integration and testing):

### Method 1: Uncomment Push Trigger (1-step reconnect)
Open [`.github/workflows/release.yml`](file:///c:/github/send2me-rust-app/.github/workflows/release.yml) and change lines 19–26 from:

```yaml
on:
  # push:
  #   branches:
  #     - main
  #   paths-ignore:
  #     - 'docs/**'
  #     - '*.md'
  #     - '.gitignore'
  workflow_dispatch:
```

to:

```yaml
on:
  push:
    branches:
      - main
    paths-ignore:
      - 'docs/**'
      - '*.md'
      - '.gitignore'
  workflow_dispatch:
```

Then commit and push:
```bash
git add .github/workflows/release.yml
git commit -m "ci: reconnect automated release pipeline on main push"
git push
```

---

## 🚀 How to Run a Manual Release Anytime

If you want to trigger a release build manually **without** re-enabling automatic triggers:
1. Go to your repository on GitHub: `https://github.com/AspiringWebGaurav/send2me-rust-app/actions`
2. Click on the **Release** workflow in the left sidebar.
3. Click the **Run workflow** dropdown button.
4. Select `main` branch and click **Run workflow**.

---

## 🎨 Windows Installer UI/UX Enhancements

The NSIS Windows installer ([`custom_installer.nsi`](file:///c:/github/send2me-rust-app/apps/desktop/src-tauri/custom_installer.nsi)) has been refined with:
- **Clean Segoe UI 9pt Typography:** Eliminates vertical crowding and text truncation across all DPI scales.
- **Generous Vertical Margins (22u+ bottom padding):** Checkboxes and labels no longer collide with the copyright branding or divider line.
- **Full Horizontal Width (100%):** Eliminates text clipping on the right edge.
- **Polished Consent, Legal Links, and Firewall Pages:** Clean bullet points and spacious links to terms and privacy policies.
