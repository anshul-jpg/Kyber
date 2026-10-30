# Kyber v1.0.0 Release Notes

Autonomous pocket supervisor and tool gatekeeper for Google Antigravity IDE.

---

## Artifacts

| File | Target | Description |
| :--- | :--- | :--- |
| `kyber-companion.apk` | Android 8.0+ | Native Android APK with persistent foreground service (ID 9001), camera QR scanner, and haptic tool approvals. |
| `antigravity-companion-1.0.0.vsix` | Antigravity IDE / VS Code | Extension package including bundled daemon, tool interceptor, and pairing hub. |

---

## Installation

### PowerShell (Windows)

```powershell
irm https://raw.githubusercontent.com/anshul-jpg/Kyber/main/install.ps1 | iex
```

### Manual Extension Install

1. Download `antigravity-companion-1.0.0.vsix` from the release assets below.
2. In Antigravity IDE or VS Code: Extensions (`Ctrl+Shift+X`) &rarr; Views Menu (`...`) &rarr; **Install from VSIX...**
3. Open the **KYBER** view in the Activity Bar and scan the pairing QR code.

---

## Technical Highlights

### 1. Tool Interception & Approval Gate
* Local IPC hook on port 4041 intercepting sensitive tool actions (`run_command`, `write_to_file`, file mutations).
* Dual-mode routing:
  * **Desk Mode:** Standard desktop IDE confirmation dialogs.
  * **Remote Mode:** Suppresses PC popups; routes all approvals silently to mobile with tactile vibration feedback (`[ALLOW]` / `[DENY]`).
* Full `ask_question` resolution via interactive option chips and custom write-in field.

### 2. Mobile Companion Engine (Android APK & Standalone PWA)
* Persistent background supervisor via Android Foreground Service (ID 9001).
* In-app camera QR code scanner for 5-second initial pairing.
* In-app APK updater using Android native `DownloadManager`.
* Low-latency peer-to-peer connectivity over local Wi-Fi or authenticated Tailscale WireGuard mesh.

### 3. Developer Triage & Telemetry
* Headless Git working tree viewer: status, line-by-line syntax-highlighted diffs, file staging, and direct commit authoring.
* Language server quota tracking: real-time token quotas and reset countdowns for Claude 3.5 Sonnet, Claude Opus, and Gemini Flash.
* Framebuffer screen capture fallback (`GET /api/host/screen.jpg`) for unhandled desktop dialogs or compiler errors.
* Live terminal output streaming (`stdout`/`stderr`) during agent shell execution.

### 4. Privacy & Security
* Zero external telemetry, tracking beacons, or third-party cloud relays.
* Interceptor loopback boundary (`127.0.0.1`) with cryptographically random hex token pairing.

---

## Verification

To verify artifact integrity after downloading:

```powershell
Get-FileHash -Algorithm SHA256 kyber-companion.apk
Get-FileHash -Algorithm SHA256 antigravity-companion-1.0.0.vsix
```
