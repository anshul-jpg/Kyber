# Personal Project Approach: Fast Dogfooding & Daily Utility

## 1. Objective
Solve the developer's immediate daily pain point within 48 to 72 hours:
- Enable the developer to step away from their desk while Antigravity is coding.
- Allow the developer to review and approve/deny/intercept tool permission requests from an Android mobile device.
- Keep sessions alive and resumable without keeping the PC running unnecessarily.

---

## 2. Guiding Philosophy
- **Zero Premature Generalization:** Do not build multi-platform packaging (e.g., iOS Safari quirks, desktop Electron) until the Android + Windows pipeline is buttery smooth.
- **Fastest Path to High-Value Interaction:** Get the hook interceptor working first. The moment the phone vibrates and an "Allow" tap continues the PC run, 80% of the value is realized.
- **Local-First & Frictionless:** Use local WiFi / Tailscale / Cloudflare quick tunnel. No credit cards, no complex Firebase push certificates needed initially.

---

## 3. Architecture for Personal Use

```
Android Phone (Browser / Prebuilt APK)
   │  ▲
   │  │ WebSockets (via Local WiFi or Tailscale IP)
   ▼  │
PC Bridge Daemon (Node.js/TypeScript on Windows)
   │  ▲
   │  │ IPC (Named Pipe / Local HTTP)
   ▼  │
PreToolUse Hook Script
   │  ▲
   │  │ stdin/stdout
   ▼  │
Antigravity CLI (agy running on PC)
```

---

## 4. Phase 1 Implementation Checklist

### Step 1: Daemon Foundation
- [x] Initialize `daemon/` with TypeScript, `ws` (WebSockets), and `express` (local API).
- [x] Implement `AgySession` process runner using `agy --input-format stream-json --output-format stream-json`.
- [x] Handle NDJSON streaming parsing for tokens, tool calls, and completion signals.

### Step 2: Permission Interception Hook
- [x] Create `hooks/interceptor.js` implementing the Antigravity `PreToolUse` contract.
- [x] When Antigravity requests a tool call, the hook queries the local Daemon:
  - If auto-approved by policy (or Desk Mode) -> return `{"decision": "allow"}`.
  - If requires approval (Remote Mode) -> register a pending approval request with a unique ID and hold execution.
- [x] Real-time WebSocket notify and hold until the phone approves or denies.

### Step 3: Mobile Web/PWA Client (Immediate Dogfooding)
- [x] Mobile-first UI (Vite + React + Linear/Raycast dark theme).
- [x] Connects to PC daemon WebSocket (`ws://<PC_LOCAL_IP>:4040` or worldwide Cloudflare tunnel).
- [x] Screens & Features:
  - **Live Chat Stream:** Markdown rendering of model responses, thoughts, and tool executions.
  - **Permission Card Banner:** Prominent sticky modal with action buttons (*Allow*, *Deny*, *Intercept*).
  - **Desk vs Remote Mode:** Space-efficient header toggle for phone-exclusive approval routing.
  - **Multi-Photo Tray:** Camera capture and multiple photo attachments.
  - **Virtual Keyboard Fix:** Multi-line textarea with Return key inserting `\n`.
  - **Connection Resilience:** 15s keep-alive heartbeat ping and 2s auto-reconnect loop.

### Step 4: Native Android Wrap
- [x] Package web app with Capacitor into an installable `.apk` for Android (`assembleDebug`).
- [x] Native local notifications with vibration, chime, and lockscreen action buttons (`@capacitor/local-notifications`).
- [x] Dark status/navigation bars and safe-area inset handling.
- [x] Built-in `/download/app.apk` endpoint for instant direct-to-phone installation.
