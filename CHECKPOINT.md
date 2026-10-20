# 🏁 Antigravity Companion: Master Checkpoint & Session State

> **Checkpoint Created:** 2026-10-20 (After 8–9h Intensive Dogfooding Marathon)  
> **Status:** Beta Ready, Functional Dogfooding Live, Android APK Compiled & Tested

---

## 1. Executive Summary

Over the marathon session, we took **Antigravity Companion** from conceptual design docs to a **fully functioning, end-to-end dogfooded mobile companion system**.

The companion allows developers to step away from their PC while Google Antigravity is coding:
- Tool approvals (`run_command`, file modifications) are intercepted in real time and pushed to the developer's phone.
- In **Remote Mode**, the phone has exclusive priority: approvals pop up on mobile, and tapping **Allow** instantly unblocks the PC agent with zero desk clicks.
- In **Desk Mode**, approvals appear naturally on the PC screen without disturbing the phone.
- Prompts typed or photos snapped on mobile are injected **directly into the active Antigravity IDE conversation** within sub-second latency.
- The companion runs both as a responsive **Mobile Web/PWA** and a native **Android APK** with local notifications and lockscreen action buttons.

---

## 2. Active Machine Ports & Daemon Topology

| Port / Channel | Service | Role |
| :--- | :--- | :--- |
| **`4040`** | `ws-gateway.ts` (HTTP + WSS) | Serves the React Web UI, WebSocket feed, health check, and `/download/app.apk` endpoint. |
| **`4041`** | `ipc-server.ts` (TCP Server) | Listens for hook executions from `.agents/interceptor.js`. Holds agent until mobile decision. |
| **`4049`** | `wake-listener.js` (HTTP Server) | Receives `/wake` trigger from `ide-watcher.ts` to immediately prompt Antigravity without debounce. |
| **Tunnel** | Cloudflare Quick Tunnel (`untun`) | Exposes `http://localhost:4040` over public HTTPS/WSS worldwide without port-forwarding. |
| **Global Mode**| `~/.agy-companion-mode` | File containing `desk` or `remote`. Shared across all projects on the machine. |

---

## 3. Comprehensive File-by-File Inventory & Implementation State

### Root & Configuration
* [**`package.json`**](file:///d:/CODE/antigravity%20compainion/package.json): Root monorepo workspace configuration managing `protocol`, `cli`, and `web`.
* [**`AGENTS.md`**](file:///d:/CODE/antigravity%20compainion/AGENTS.md): Universal agent rules (Ponytail senior dev doctrine, anti-AI-slop design mandate, and companion universal integration commands).
* [**`CONTEXT.md`**](file:///d:/CODE/antigravity%20compainion/CONTEXT.md): Master technical architecture specification and protocol overview.
* [**`PERSONAL_APPROACH.md`**](file:///d:/CODE/antigravity%20compainion/PERSONAL_APPROACH.md): Dogfooding execution roadmap with completed Phase 1 milestones.
* [**`OPEN_SOURCE_APPROACH.md`**](file:///d:/CODE/antigravity%20compainion/OPEN_SOURCE_APPROACH.md): Open-source vision and standalone package release strategy.
* [**`README.md`**](file:///d:/CODE/antigravity%20compainion/README.md): Quickstart instructions, architecture diagram, and usage guides.

### Package: `@agy-companion/protocol` (`packages/protocol/`)
* [**`packages/protocol/src/index.ts`**](file:///d:/CODE/antigravity%20compainion/packages/protocol/src/index.ts):
  - Defines `WsClientMessage` (`client:hello`, `client:respond_approval`, `client:send_prompt`, `client:set_mode`, `client:ping`, etc.).
  - Defines `WsServerMessage` (`server:hello`, `server:approval_requested`, `server:approval_resolved`, `server:chat_message`, `server:stream_token`, `server:mode_updated`, `server:pong`).
  - Shared data models: `ApprovalRequest`, `ApprovalDecisionPayload`, `ChatMessage`, `WorkspaceState`.

### Package: `@agy-companion/cli` (`packages/cli/`)
* [**`packages/cli/src/bin/agy-companion.ts`**](file:///d:/CODE/antigravity%20compainion/packages/cli/src/bin/agy-companion.ts):
  - CLI entry point supporting `agy-companion` (starts daemon), `--tunnel` (spawns Cloudflare tunnel), `--port <p>`, and `hook install <dir>`.
  - Displays terminal QR code and local Wi-Fi / Tunnel URLs for instant mobile camera pairing.
* [**`packages/cli/src/commands/install-hook.ts`**](file:///d:/CODE/antigravity%20compainion/packages/cli/src/commands/install-hook.ts):
  - Universal hook installer. Automatically writes `.agents/hooks.json` and `.agents/interceptor.js` into target project with zero configuration.
* [**`packages/cli/src/hooks/ipc-server.ts`**](file:///d:/CODE/antigravity%20compainion/packages/cli/src/hooks/ipc-server.ts):
  - TCP socket server on port `4041`. Manages pending approvals, matches request IDs, reads global `~/.agy-companion-mode`, and returns `allow`/`deny` decisions.
* [**`packages/cli/src/server/ws-gateway.ts`**](file:///d:/CODE/antigravity%20compainion/packages/cli/src/server/ws-gateway.ts):
  - HTTP & WebSocket server on port `4040`.
  - Serves static compiled frontend from `packages/web/dist`.
  - Serves `/download/app.apk` and `/app.apk` for instant Android APK downloads.
  - Handles `client:ping` keep-alives with `server:pong`.
  - Multiplexes mode toggles, chat broadcasts, and tool approvals across all connected mobile clients.
* [**`packages/cli/src/session/ide-watcher.ts`**](file:///d:/CODE/antigravity%20compainion/packages/cli/src/session/ide-watcher.ts):
  - Discovers active Antigravity IDE conversation by finding the most recently modified transcript in `<appDataDir>\brain\<conversationId>`.
  - Streams live conversation turns, thoughts, and tool executions to the phone.
  - Injects prompts from phone directly into Antigravity IDE's `.system_generated/messages` queue and triggers instant wake on port `4049`.
* [**`packages/cli/src/session/workspace-manager.ts`**](file:///d:/CODE/antigravity%20compainion/packages/cli/src/session/workspace-manager.ts):
  - Tracks known workspaces, pending approvals per project, and workspace status (`idle`, `busy`, `waiting_approval`).
* [**`packages/cli/src/engine/agy-engine.ts`**](file:///d:/CODE/antigravity%20compainion/packages/cli/src/engine/agy-engine.ts):
  - Spawns and manages CLI-mode `agy --input-format stream-json --output-format stream-json` child processes for standalone headless runs.

### Package: `@agy-companion/web` (`packages/web/`)
* [**`packages/web/src/App.tsx`**](file:///d:/CODE/antigravity%20compainion/packages/web/src/App.tsx):
  - Mobile-first Linear/Raycast dark theme developer interface.
  - **Desk vs Remote Mode Flip Button:** Space-efficient header toggle that switches phone priority instantly.
  - **Multi-Project Workspace Drawer:** Slide-over drawer listing all active repos with status indicators.
  - **Virtual Keyboard Fix:** Multiline auto-expanding `<textarea>` with `enterKeyHint="enter"` (Enter = newline, never accidental send; dedicated `[ ➤ ]` button submits).
  - **Connection Resilience:** 15-second heartbeat ping (`client:ping`), 2-second auto-reconnect retry loop, and wake listeners (`online`, `visibilitychange`).
  - **Camera & Multi-Photo Tray:** Pick or snap multiple photos on mobile, preview them in a horizontal chip tray, and attach directly to the prompt.
  - **Notification Test Button:** Settings modal (`⚙`) button to test phone vibration and lockscreen action buttons.
* [**`packages/web/src/utils/notifications.ts`**](file:///d:/CODE/antigravity%20compainion/packages/web/src/utils/notifications.ts):
  - Wraps `@capacitor/local-notifications` and browser Web Notifications.
  - Synthesizes 880Hz tactile alert chime via Web Audio (0 external audio dependencies).
  - Registers `PERMISSION_GATE` notification action type with `[✓ Approve]` and `[✕ Reject]` lockscreen actions.
* [**`packages/web/capacitor.config.ts`**](file:///d:/CODE/antigravity%20compainion/packages/web/capacitor.config.ts):
  - Capacitor Android configuration (`appId: com.antigravity.companion`, `appName: Antigravity Companion`).
* [**`packages/web/android/`**](file:///d:/CODE/antigravity%20compainion/packages/web/android/):
  - Complete Android Studio project.
  - Configured with `fitsSystemWindows="true"` and dark status/nav bars (`#181818`) in `styles.xml`.
  - Precompiled debug APK located at `packages/web/android/app/build/outputs/apk/debug/app-debug.apk`.

### Hooks & Skills
* [**`.agents/hooks.json`**](file:///d:/CODE/antigravity%20compainion/.agents/hooks.json): Configures the Antigravity `PreToolUse` hook.
* [**`.agents/interceptor.js`**](file:///d:/CODE/antigravity%20compainion/.agents/interceptor.js):
  - Executes before any tool runs. Checks `~/.agy-companion-mode`:
    - If `desk`: exits 0 with `{"decision": "allow"}` so the PC displays normal prompt.
    - If `remote`: connects to IPC server (port 4041) and holds Antigravity until phone responds.
* [**`.agents/skills/agy-companion/SKILL.md`**](file:///d:/CODE/antigravity%20compainion/.agents/skills/agy-companion/SKILL.md):
  - Universal skill teaching any Antigravity agent how to enable the companion hook in any repository with one command.
* [**`scripts/wake-listener.js`**](file:///d:/CODE/antigravity%20compainion/scripts/wake-listener.js):
  - Persistent lightweight HTTP server on port `4049` that triggers 0ms wake for mobile prompt delivery.

---

## 4. How to Resume After a Hard Reset / Machine Reboot

When reopening Antigravity after a system shutdown or fresh start:

### Step 1: Start the Companion Daemon (with Tunnel)
In PowerShell from `d:\CODE\antigravity compainion`:
```powershell
node packages/cli/dist/bin/agy-companion.js --tunnel
```
*(This starts ports 4040, 4041, prints the QR code, and connects the worldwide Cloudflare tunnel).*

### Step 2: Ensure the Wake Listener is Running
In a background terminal:
```powershell
node scripts/wake-listener.js
```

### Step 3: Connect Your Phone
- **On Local Wi-Fi:** Open `http://<PC_LOCAL_IP>:4040` (e.g. `http://192.168.1.37:4040`)
- **Remotely / Cellular:** Open the Cloudflare URL printed in the terminal (or saved in your mobile browser bookmarks).
- **On Android APK:** Launch the **Antigravity Companion** app. (If updated, re-download from `/download/app.apk`).

### Step 4: Enable in Any Target Project
To connect tool approvals from any project on your PC:
```powershell
node "d:\CODE\antigravity compainion\packages\cli\dist\bin\agy-companion.js" hook install <path-to-target-repo>
```

---

## 5. What Was Completed in This Marathon

- [x] **Monorepo setup:** `protocol`, `cli`, and `web` with cross-package TypeScript builds.
- [x] **PreToolUse IPC interceptor:** Zero-friction tool approval blocking and resolution.
- [x] **Desk vs Remote Mode:** Global mode file (`~/.agy-companion-mode`) switching approval routing between phone-exclusive and PC-exclusive.
- [x] **Worldwide Tunneling:** Integrated Cloudflare Quick Tunnel (`--tunnel`) with zero configuration or auth keys needed.
- [x] **Live IDE Conversation Pairing:** Automatic transcript auto-discovery syncing active Antigravity chat turns to phone.
- [x] **Sub-Second Mobile Prompt Injection:** Messages sent from phone inject directly into Antigravity session with wake trigger.
- [x] **Multi-Image Camera Tray:** Mobile photo picking/camera attachments with preview and removal chips.
- [x] **Virtual Keyboard Newline Fix:** Replaced single-line input with auto-growing textarea; Enter key inserts `\n` without premature submits.
- [x] **Connection Resilience:** 15s keep-alive heartbeat ping + 2s auto-reconnect loop to survive mobile idle sleep.
- [x] **Capacitor Android Packaging:** Gradle `assembleDebug` producing 4.5MB debug APK with safe area styling and dark status bars.
- [x] **In-App APK Download Endpoint:** Native `/download/app.apk` route directly served by the daemon.
- [x] **Local Notification Pipeline:** Notification permission request, haptic vibration, chime, and lockscreen action buttons.
- [x] **Universal Hook Installer:** `agy-companion hook install <dir>` command for 1-step integration into any project.

---

## 6. What's Left for Future Sessions (Phase 2 & Beyond)

1. **Multi-Project Session Filtering:** The workspace drawer UI is built; future work can allow the IDE watcher to filter and switch transcripts dynamically when multiple Antigravity IDE windows are running simultaneously.
2. **Persistent Foreground Service (Android):** To prevent aggressive manufacturer battery killers (e.g. Xiaomi MIUI / Oppo ColorOS) from sleeping the WebSocket during 2+ hour unattended runs, wrap the APK background receiver in a minimal Android Foreground Service with a persistent status bar notification.
3. **Voice Note Input:** Add audio recording button in the thumb zone for hands-free prompt dictation from phone.
4. **Standalone NPM Publishing:** Prepare `@agy-companion/cli` for global `npm install -g agy-companion` distribution.
