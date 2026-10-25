# Antigravity Mobile Companion: Connectivity & Operation Guide

This guide documents the connectivity architecture, network options, and setup steps for running the Antigravity Companion across PC and mobile devices.

---

## 1. Network Topologies

You have two connection options depending on your location and security preferences:

| Method | Recommended For | Network Path | Security | Encryption |
| :--- | :--- | :--- | :--- | :--- |
| **Tailscale (Mesh VPN)** | **Best for Daily Remote Work** | Direct peer-to-peer over Tailscale IP (`100.x.x.x:4040`) | Private wireguard network; never exposed to public internet | WireGuard E2E |
| **Cloudflare Quick Tunnel** | **Zero-Config Cellular Access** | Public HTTPS tunnel (`https://<random>.trycloudflare.com`) | Public HTTPS edge proxying to local daemon | TLS 1.3 |

---

## 2. Zero-Config Pairing Ticket (Scan or 1-Tap)

When the companion daemon starts, it generates a Base64 pairing ticket containing the host, port, protocol, and persistent authentication token.

### Connecting in 1 Step
1. **Camera QR Scan (Mobile Browser / PWA)**:
   - Scan any of the QR codes displayed in your terminal (Tailscale, Cloudflare, or Local Wi-Fi).
   - Your phone immediately opens the companion with `?ticket=<base64>`.
   - The app parses the ticket, saves the credentials atomically, cleans the URL, and connects.
2. **Native Android APK**:
   - Tap **Settings** (gear icon) ➔ **Pair via Ticket**.
   - Paste the ticket string or the scanned URL and tap **Pair**.
   - The APK connects instantly without entering IP, port, or protocol.

---

## 3. Desktop Keyboard Bypass & 120s Fail-Closed Timeout

To eliminate the "desktop freeze" when you are sitting at your desk:
1. **Instant Keyboard Bypass**:
   When an approval request arrives, the daemon console displays:
   ```
   [APPROVAL NEEDED] Tool: "run_command"
      Command:   git status
      -> Pushed to mobile companion (120s timeout).
      [DESKTOP KEYBOARD]: Press [A] to Allow now, [D] to Deny.
   ```
   Pressing **`A`** or **`D`** on your desktop keyboard immediately resolves the request without touching your phone.
2. **120-Second Fail-Closed Fallback**:
   If you are away and your phone drops offline or times out, the interceptor automatically exits with `{ decision: "ask" }` after 120 seconds, safely prompting the native desktop IDE rather than hanging your agent.

---

## 4. Option A: Tailscale Direct Connection (Recommended)

### Direct Download Links
Download the latest assembled APK directly from your running daemon:
- **Over Tailscale**: `http://<your-tailscale-ip>:4040/download/app.apk`
- **Over Cloudflare**: `https://<tunnel-url>/download/app.apk`

### Android Permissions & Background Service
1. **Notifications**: When prompted, tap **Allow** for notifications so lockscreen approvals can be delivered.
2. **Battery Optimization**: Set the Antigravity Companion app battery usage to **Unrestricted** (Settings ➔ Apps ➔ Antigravity Companion ➔ Battery ➔ Unrestricted). This prevents Android from killing the WebSocket when the screen turns off.
3. **Foreground Service**: The app runs a persistent low-priority service (`CompanionForegroundService`) with a partial wake-lock to maintain WebSocket connectivity and receive tool approvals even when backgrounded.

---

## 5. Approval & Mode Mechanics

### Remote Mode vs Desk Mode
- **Remote Mode**:
  - The PC IDE silently holds tool execution (`run_command`) and pushes approval cards to your phone.
  - Tapping **Allow** on your phone (or in lockscreen notification) grants temporary `permissionOverrides: ["command(...)"]`.
  - The IDE immediately executes the command **without prompting on desktop**.
- **Desk Mode**:
  - Pushes bypass the phone; the native Antigravity desktop IDE dialog prompts you directly.
  - Toggle between modes on phone or desktop anytime via the mode switch pill.

### Tool Approvals vs "Files With Changes"
- **Tool Execution Approvals**:
  - Pushed to the chat feed and lockscreen notifications.
  - Features high-contrast monospace command preview with instant 1-tap **Allow** / **Deny** buttons.
  - Optional accordion for advanced overrides (always allow session / redirect agent).
- **Files With Changes**:
  - Strictly isolated to the workspace file review drawer.
  - Populated dynamically from real Git status changes; never hardcoded or conflated with command approvals.

---

## 6. Troubleshooting Checklist

| Symptom | Cause | Solution |
| :--- | :--- | :--- |
| **Offline status on phone** | IP/Port incorrect or firewall blocking | Verify PC Tailscale IP (`100.x.x.x`). Check firewall rule: `netsh advfirewall firewall show rule name="Antigravity Companion"`. |
| **Notification Allow doesn't resolve** | WebSocket reconnect delay | Resolved in v0.1.1: Approvals automatically use a secondary HTTP POST fallback (`/api/hook/approval`). |
| **Double prompt in PC IDE** | Missing permission grant | Resolved in v0.1.1: `interceptor.js` forwards `permissionOverrides` on allow. |
| **App asleep when phone locked** | Android OS background killing | Set App Battery to Unrestricted in Android Settings. |

---

## 7. Remote Power Management (Smart Plug & Cold Boot Blueprint)

When you are away from home, your PC is off, and you are behind an ISP CGNAT (like ACT Fibernet), software Tailscale is dead and raw WoL broadcast packets cannot cross the public cellular internet. 

The standard hardware-level solution is a smart plug using the motherboard's AC recovery policy.

### Setup Steps (When Smart Plug Arrives):

1. **BIOS / UEFI Configuration**:
   - Reboot PC, press `Del` or `F2` to enter BIOS.
   - Go to **Advanced** ➔ **Power Management Setup** (or **APM Configuration**).
   - Locate **`Restore on AC/Power Loss`** (also labeled `AC Back` / `State After G3`).
   - Change from *Power Off* to **`Power On`** (or *Always On*). Save and exit (`F10`).

2. **Windows Tailscale Service & Auto-Start**:
   - Ensure Tailscale is installed as an unattended Windows Service (`tailscale set --unattended` or default Windows installer).
   - This ensures Tailscale connects to your mesh immediately at the Windows login lockscreen before any user logs in.

3. **Remote Wake Workflow (From 50+ km away on Cellular)**:
   - In your smart plug app (Tuya / Smart Life / Tapo), toggle the plug **OFF**, then **ON**.
   - Power flows into the PC power supply.
   - The motherboard detects incoming AC power and triggers a hardware cold boot automatically.
   - Within 20-30 seconds, Windows boots, Tailscale connects, and your Companion Mobile app reconnects automatically.

