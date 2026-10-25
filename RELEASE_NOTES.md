# 🌌 Kyber v0.1.0 — Initial Release

> **"Your AI agent should keep coding while you walk away."**  
> Autonomous Pocket Supervisor & Real-Time Tool Gatekeeper for Antigravity, Codex & Claude Code.

---

### 📦 Downloads & Artifacts

| Artifact | Target | Description |
| :--- | :--- | :--- |
| **`kyber-companion.apk`** | Android 8.0+ | Native mobile companion with background push notifications (Foreground Service ID 9001) & haptic vibration alerts. |
| **`kyber-0.1.0.vsix`** | Antigravity IDE / VS Code | Self-contained extension with bundled companion daemon, web companion PWA, and tool interceptor. |

---

### ⚡ 60-Second Quickstart

#### Windows 1-Liner (PowerShell):
```powershell
irm https://raw.githubusercontent.com/anshul-jpg/Kyber/main/install.ps1 | iex
```

#### Antigravity / VS Code Extension:
1. Download `kyber-0.1.0.vsix` below.
2. Open IDE $\rightarrow$ Extensions (`Ctrl+Shift+X`) $\rightarrow$ Click `...` $\rightarrow$ **Install from VSIX...**
3. Scan the pairing QR code from the left Activity Bar with your phone.

---

### ✨ What's New in v0.1.0

* **Dual-Mode Supervision:**
  * **Desk Mode:** Standard desktop IDE confirmation dialogs when you're sitting at your computer.
  * **Remote Mode:** Suppresses PC interruptions; routes every tool approval (`run_command`, `write_to_file`) to your phone with tactile haptic buttons (`[ ALLOW ]` / `[ DENY ]`).
* **Full `ask_question` Support via Mobile QuestionCard:**
  * Numbered chip selectors, custom write-in input, and instant resolve back to Antigravity without touching your PC.
* **Instant Web Companion (PWA):**
  * Zero-install web client served directly by the background daemon over local Wi-Fi or encrypted Tailscale mesh.
* **Remote Directives & Emergency Killswitch:**
  * Instant emergency abort button to freeze runaway agent shell execution.
  * Multimodal voice notes and model directive injection.
* **Local-First & End-to-End Encrypted:**
  * Zero third-party cloud data storage. Ephemeral cryptographic token pairing handshake.

---

### 🔒 Checksums (SHA-256)
* Run `Get-FileHash -Algorithm SHA256 <filename>` in PowerShell to verify integrity.
