# 🌌 Antigravity Companion: Project Context & Master Architecture

> **Notice:** This document is the **cumulative architectural chronicle** of Antigravity Companion from Day 1 to present. It preserves all design decisions, technical pivots, component topologies, and runtime contracts so context is never lost across sessions.

---

## 1. Vision & Core Value Proposition

**"Cloud Gaming, but for Cloud Coding."**  
A remote companion system for the Google Antigravity IDE / CLI (`agy`) running on a local desktop PC, operated remotely from a mobile phone (Android APK / Mobile Web / PWA) or any external device.

The goal is to allow the developer to step away from their desk, lie down, or travel while retaining 100% control over Antigravity's autonomous agent execution:
- Authorizing or denying critical tool permissions from lockscreen notifications or mobile UI.
- Directing conversational turns from the phone with zero manual typing on PC.
- Streaming tokens, thought processes, terminal actions, and diffs live over low-latency WebSockets.

---

## 2. Complete Architectural Evolution (Phases 1 — 4)

### Phase 1: Headless CLI Engine (`agy-engine.ts`)
* **How it worked:** The daemon ran `agy.exe` headless with `shell: false`, streaming NDJSON over `stdout`.
* **The Failure Mode:** Headless runs did not share the UI context of the open Antigravity IDE window. When Antigravity halted for tool permissions, child processes hung invisibly. Invisible turns created disconnected conversation transcripts.
* **Outcome:** Deprecated and completely removed in Phase 3.

### Phase 2: In-Editor HTTP Wake Server (Port `4049`) & Disk Queue Markers
* **How it worked:** The VS Code extension ran a local HTTP server on port `4049`. When prompts arrived from mobile, the daemon wrote a queue marker to `brain/<convId>/.system_generated/messages/undelivered/` and fired a GET request to `http://127.0.0.1:4049/wake`.
* **The Failure Mode:** 
  1. Port `4049` suffered from `EADDRINUSE` zombie collisions when the IDE restarted or the PC woke from sleep.
  2. If the IDE was closed or dormant, prompts dumped into disk markers would latch onto stale conversation directories, creating the dreaded `[INPUT NEEDED]` hanging state.
* **Outcome:** Port `4049` and disk queue markers were completely eliminated in favor of deterministic WebSocket channels.

### Phase 3: Inverted Layer 4 Architecture (VS Code Extension Host as Master)
* **The Architecture:** Inverted control so that the VS Code Extension Host (`DaemonManager`) is the master:
  1. The Extension Host maintains a persistent WebSocket connection to the Daemon (`ws://127.0.0.1:4040`).
  2. When the phone sends `client:send_prompt`, the daemon forwards it directly across WebSocket via `server:forward_prompt`.
  3. The Extension Host natively submits the prompt into Antigravity Agent Chat using the official native command:
     ```javascript
     // Verified in Antigravity binary (workbench.desktop.main.js line 28,066,962):
     await vscode.commands.executeCommand('antigravity.sendPromptToAgentPanel', prompt);
     ```
     This opens the agent panel and starts the agent turn directly with zero UI guesswork.

### Phase 4: Dormant Host Detection & Memory Buffer (Current Phase)
* **The Problem:** If the IDE window is closed or sleeping, prompts sent from mobile must not fall into a black hole or corrupt old session queues on disk.
* **The Solution:**
  1. **Status Broadcasting:** Daemon broadcasts `server:ide_status` (`active` when Extension Host is connected, `dormant` when detached) to all mobile clients.
  2. **Phone UI Badge:** Mobile Header displays `IDE: Active` (green) vs `IDE: Dormant` (amber).
  3. **Deterministic Memory Buffer:** When dormant, prompts buffer in daemon memory. The instant the IDE wakes and attaches, the buffer drains directly into `antigravity.sendPromptToAgentPanel`.

---

## 3. Subsystem Breakdown & Directory Topology

```
antigravity-companion/
├── packages/
│   ├── protocol/          # Shared TypeScript interfaces, WS message schemas & ticket auth
│   ├── cli/               # Node.js Companion Daemon, port cleaner, IPC server & WS gateway
│   │   ├── src/server/    # ws-gateway.ts (Port 4040), port-cleaner.ts
│   │   ├── src/hooks/     # ipc-server.ts (Port 4041 - holds agent PreToolUse)
│   │   └── src/session/   # ide-watcher.ts, workspace-manager.ts
│   ├── vscode-extension/  # Antigravity IDE Extension (daemon-manager.ts, sidebar-provider.ts)
│   └── web/               # React 19 + Vite + Tailwind mobile client (Capacitor Android APK)
├── .agents/
│   ├── hooks.json         # PreToolUse hook configuration
│   ├── interceptor.js     # Lifecycle script that routes approvals to Daemon (4041) or forces desktop prompt
│   └── companion-mode     # Local mode fallback
├── ERRORS_AND_REVISIONS.md # Immutable append-only regression and revisions ledger
└── CHECKPOINT.md          # Session checkpoint and state summary
```

---

## 4. Security & Permission Interception Model

Antigravity agent tool calls are governed by `.agents/hooks.json` $\rightarrow$ `.agents/interceptor.js`:

### A. Remote Mode (`~/.agy-companion-mode` = `remote`)
1. Agent proposes a tool execution (e.g. `run_command`).
2. Antigravity invokes `.agents/interceptor.js` via stdin.
3. `interceptor.js` sends the payload over HTTP to the daemon on port `4041` (`/api/hook/pre-tool-use`).
4. Daemon pushes an actionable notification / card to the developer's phone over WebSocket.
5. Developer taps **Allow** or **Deny** on their phone.
6. Daemon unblocks `interceptor.js` with `{ "decision": "allow" }` or `{ "decision": "deny" }`.

### B. Desk Mode (`~/.agy-companion-mode` = `desk`)
1. `interceptor.js` immediately outputs `{ "decision": "force_ask" }`.
2. Antigravity IDE is forced to display the native desktop confirmation prompt, ignoring cached permissions.
3. The phone does not ring or block.

---

## 5. Machine & Network Port Matrix

| Port / Path | Protocol | Role |
| :--- | :--- | :--- |
| **`4040`** | HTTP / WebSocket | Main Gateway: serves Web UI, mobile WS connection, health check, prompt forwarding. |
| **`4041`** | HTTP (Internal) | PreToolUse Hook IPC: holds agent tool execution until mobile or desk decision. |
| **`~/.agy-companion-mode`** | File (`desk`\|`remote`) | Global authority governing approval routing. |
| **`~/.agy-companion-token`**| File (Hex Token) | Persistent authentication token shared between daemon and extension. |
| **Global CLI** | `~/.gemini/antigravity-ide/companion/bin/agy-companion.js` | Globally deployed CLI accessible from any workspace. |
