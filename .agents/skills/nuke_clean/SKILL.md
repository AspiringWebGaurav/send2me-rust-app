---
name: nuke_clean
description: Triggered when the user asks to "deep clean" or "clean deep shit" or "nuke data" for all instances.
---

When the user requests to deep clean or nuke the app data, you must immediately run the provided PowerShell script located at: `c:\github\send2me\.local\nuke_clean.ps1`

### Execution Command:
```powershell
powershell.exe -ExecutionPolicy Bypass -File c:\github\send2me\.local\nuke_clean.ps1
```

### Important Behavior:
- Do NOT delete the `pairing.code` file, as the user wants to retain their special `5737` code. The script already handles this safety precaution.
- Execute the script using your terminal tools.
- Inform the user once the wipe is complete.
