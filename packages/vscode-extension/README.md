<p align="center">
  <img src="https://raw.githubusercontent.com/anshul-jpg/Kyber/main/packages/vscode-extension/media/icon.png" width="80" height="80" alt="KYBER" />
</p>

<h1 align="center">KYBER</h1>

<p align="center">
  <strong>Autonomous Pocket Supervisor & Tool Gatekeeper for Google Antigravity IDE</strong>
</p>

<p align="center">
  <a href="https://github.com/anshul-jpg/Kyber/releases"><img src="https://img.shields.io/badge/version-0.1.0-0078d4?style=flat-square" alt="Version 0.1.0" /></a>
  <a href="https://github.com/anshul-jpg/Kyber/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-262626?style=flat-square" alt="License Apache-2.0" /></a>
  <img src="https://img.shields.io/badge/network-Local--First%20%2F%20WireGuard-0078d4?style=flat-square" alt="Local-First" />
  <img src="https://img.shields.io/badge/telemetry-zero-262626?style=flat-square" alt="Zero Telemetry" />
</p>

---

## What is KYBER?

When autonomous coding agents execute complex refactors, they inevitably hit tool boundaries requiring confirmation: shell execution confirmations (`run_command`), destructive file modifications (`write_to_file`), or interactive clarification prompts (`ask_question`). 

Without a supervisor at the desk, the agent idles at the permission gate, blocking progress.

**KYBER eliminates this bottleneck.** It intercepts agent lifecycle hooks at the IDE process boundary and projects actionable decisions, real-time telemetry, and git diffs directly to your mobile device (Android APK or standalone PWA) over an encrypted local mesh.

Step away from your workstation with confidence — cook, commute, exercise, or rest while your agent works.

---

## Features

* **Unattended Background Supervision:** Persistent Android Foreground Service (`ID 9001`) maintains the supervision loop during deep phone sleep, keeping multi-hour refactors moving without spamming the notification tray.
* **Tactile Approval Gate with Live Diffs:** Sensitive operations (`run_command`, `write_to_file`, file deletions) trigger immediate lockscreen notifications with 1-tap `[Allow]` / `[Deny]` actions and syntax-highlighted line-by-line diff previews.
* **Multimodal Voice Notes:** Record and dispatch raw voice notes directly from mobile into the IDE session, allowing Gemini to natively parse speech and execute complex directives.
* **Live Terminal Stream:** Real-time console output streaming (`stdout`/`stderr`) with exit codes and execution timestamps for long-running compilers and test suites.
* **Headless Git Triage & Commits:** Review porcelain working-tree status, inspect full unified diffs, stage or unstage files, and author atomic commits directly from your phone.
* **Language Server Model Quotas:** Live token telemetry, weekly quota percentages, and rate-limit reset countdowns for Claude 3.5 Sonnet, Claude Opus, and Gemini Flash.
* **Remote Project & Workspace Switching:** Browse host recent IDE projects and hot-swap active agent contexts directly from the mobile drawer.
* **Local-First & Zero-Trust Mesh:** 100% peer-to-peer over local Wi-Fi or encrypted Tailscale WireGuard. Prompts, diffs, and source code never transit third-party relay servers.

---

## 30-Second Quickstart

1. Open the **KYBER** tab in the Activity Bar (`Ctrl+Shift+X` &rarr; **KYBER**).
2. Scan the displayed pairing QR code with your phone camera, or visit the local URL (`http://<lan-ip>:4040`) on your mobile browser.
3. Tap **Add to Home Screen** for the instant PWA, or download the companion Android APK directly from the pairing dashboard.
4. Switch to **Remote Mode** on your phone whenever you step away from your workstation.

---

## Extension Commands

| Command | Title | Description |
| :--- | :--- | :--- |
| `antigravityCompanion.startDaemon` | **Start Companion Daemon** | Boots the local supervisor background daemon on port 4040. |
| `antigravityCompanion.stopDaemon` | **Stop Companion Daemon** | Gracefully terminates the running background daemon. |
| `antigravityCompanion.restartDaemon` | **Restart Companion Daemon** | Restarts daemon and re-attaches active workspace connections. |
| `antigravityCompanion.toggleMode` | **Toggle Desk/Remote Mode** | Switches global approval routing between PC dialogs and mobile. |
| `antigravityCompanion.showPairing` | **Show Pairing QR Code & Ticket** | Displays connection credentials, QR code, and mobile URLs. |
| `antigravityCompanion.enableInWorkspace` | **Enable Companion in Current Workspace** | Injects `.agents/hooks.json` and connects the active folder. |
| `antigravityCompanion.disableInWorkspace` | **Disable Companion in Current Workspace** | Removes workspace hook interception. |
| `antigravityCompanion.clearApprovals` | **Clear All Pending Approvals** | Flushes any stale or blocked tool requests. |

---

## Configuration Settings

Settings can be customized under `Settings` &rarr; `Extensions` &rarr; `KYBER`:

| Setting | Default | Description |
| :--- | :--- | :--- |
| `antigravityCompanion.autoStart` | `"always"` | Launch daemon automatically (`"always"`, `"workspace"`, or `"manual"`). |
| `antigravityCompanion.defaultMode` | `"remote"` | Priority connection mode (`"remote"`, `"desk"`, or `"auto"`). |
| `antigravityCompanion.gatewayPort` | `4040` | Port for the Web/PWA companion and WebSocket server. |
| `antigravityCompanion.ipcPort` | `4041` | Port for the PreToolUse Hook IPC TCP server. |
| `antigravityCompanion.tunnelProvider` | `"none"` | Remote network provider (`"none"`, `"tailscale"`, or `"cloudflare"`). |
| `antigravityCompanion.failClosedTimeout`| `120` | Seconds to wait for mobile approval before desktop fallback. |
| `antigravityCompanion.soundAlerts` | `true` | Play audible alert sound on incoming tool requests. |
| `antigravityCompanion.quickActions` | `[...]` | Custom terminal buttons pushed to the mobile dock. |

---

## Security Model

* **Token-Based Handshake:** Pairings require a cryptographically random hex token generated at daemon initialization. Unauthorized HTTP or WebSocket probes receive `401 Unauthorized`.
* **Zero Telemetry Collection:** KYBER contains no analytic trackers, telemetry beacons, or external reporting endpoints.
* **Loopback Boundary:** Interceptor sockets bind exclusively to loopback addresses (`127.0.0.1`), ensuring process-to-process isolation on multi-user hosts.

---

## License

Apache-2.0. Copyright &copy; 2026 Anshul.
