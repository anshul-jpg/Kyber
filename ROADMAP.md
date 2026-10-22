# KYBER: Vision, Architecture & Engineering Roadmap

> **Status:** Beta 1 Operational & Beta 2 Progression in Progress  
> **Brand & Identity:** Rebranded from working title to **KYBER** (Greek *κυβερνήτης* — helmsman, pilot). Locked with **Kinetic Shift (A.3)** dual-diamond mark.  
> **Baseline Freeze:** v0.1.0-beta.1 (Baseline Frozen) — Port 4040 daemon, single persistent notification (ID 9001), IPC socket protocol, and live approval loop are frozen as stable ground truth. All additions must be backward-compatible.  
> **Next Milestone:** Beta 2 (Hardening, Battery Resilience, Multi-Agent Providers & Open-Source Distribution)  
> **Maintainers:** Pair-programmed by Anshul & Antigravity  

---

## 1. Product Vision: The Autonomous Pocket Supervisor

KYBER transforms local AI agent development from an anchor at a desk into a decoupled, pocket-sized supervision loop:

1. **Uninterrupted Flow State:** Your agent performs long-running, multi-file refactors, builds, and test runs while you step away, exercise, commute, or cook.
2. **Tactile Interruption Gating:** When an agent reaches a high-stakes fork in the road (bash execution, database mutation, file deletion, tool approval), it shouldn't stall indefinitely or blindly run unsupervised. It buzzes your phone with a clean 1-tap `[Allow]` / `[Deny]` action right on your lockscreen.
3. **Zero-Friction Distribution:** Any developer running Antigravity IDE can type `npx agy-companion` in their terminal, point their smartphone camera at the ASCII QR code, and be securely paired in under 30 seconds without cloud hosting accounts, tokens, or configuration.

---

## 2. Beta 1 Retrospective (What We Solved)

- **Single Persistent Notification Architecture:** Replaced the 48-stacked notification drawer bug with one ongoing Android foreground service (`Notification ID 9001`) that morphs in-place between `Remote Active`, `Thinking...`, `Answer Ready`, and high-priority `[Allow]/[Deny]` approval gates.
- **Dormant Host Buffer:** Automatic host heartbeat tracking (`ide-status: active | dormant`) and prompt queue buffering when the host is sleeping.
- **Fluid Scalable Mobile Typography:** Replaced rigid, word-crushing layouts with CSS `clamp()`, touch-scrollable markdown tables, and hairline obsidian elevation.
- **Double Bubble Deduplication:** Reconciled optimistic mobile chat bubbles against IDE transcript playback across attachments and media references.

---

## 3. Critical Concerns, Architectural Risks & Edge Cases

### A. Aggressive Mobile OS Doze Modes & OEM Killers
- **The Risk:** Samsung OneUI, Xiaomi MIUI, and OnePlus OxygenOS aggressively kill long-running foreground services after 30–60 minutes unless battery optimization is set to "Unrestricted".
- **Mitigation:**
  1. Add an in-app prompt on first launch invoking `Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`.
  2. Implement a secondary Android AlarmManager heartbeat to revive the `CompanionForegroundService` if killed during prolonged deep sleep.

### B. Network Dead Zones & Offline Action Queue
- **The Risk:** Walking into an elevator, basement, or subway causes WebSocket and HTTP drops right as you tap `[Allow]` or send a prompt.
- **Mitigation:**
  1. Persist pending outgoing decisions and queued prompts in client-side IndexedDB / localStorage.
  2. Implement an exponential backoff auto-flush queue that dispatches queued decisions the instant connection is re-established.
  3. Ensure idempotency keys on every approval request (`requestId` + `timestamp`) so a delayed approval packet never re-executes a dead turn.

### C. Host Sleep / Windows Modern Standby (S0ix)
- **The Risk:** Closing the laptop lid or leaving the PC idle enters Modern Standby, cutting Wi-Fi/NIC power while the phone companion continues polling.
- **Mitigation:**
  1. Detect prolonged missed ping heartbeats (>15s) and switch the phone UI badge to an amber `"Host Sleeping / Offline"`.
  2. Buffer user prompts in the phone's memory dock with an explicit `"Queued for Host Wakeup"` badge, rather than showing a red error banner.

### D. Open-Source Coffee-Shop Security Boundary
- **The Risk:** Binding the daemon HTTP/WS server to `0.0.0.0` on an untrusted public Wi-Fi network (coffee shop, airport, office) allows rogue devices on the same subnet to inject prompts or approve bash executions.
- **Mitigation:**
  1. Require the bearer pairing token (`~/.agy-companion-token` or ticket query parameter) on **ALL** HTTP API routes (`/api/hook/approval`, `/api/prompt`, `/download/app.apk`) and WebSocket handshakes.
  2. Reject unauthenticated requests from non-loopback IP addresses (`127.0.0.1` allowed without token for local CLI hooks; all remote IPs require token).

---

## 4. Prioritized Feature Backlog (Beta 2 & Beyond)

### Phase 2.1: Native App Polish & Core Gaps
- [x] **Native Audio Voice Notes (Gemini Multimodal Audio):**
  - Continuous `MediaRecorder` audio capture with live recording pulse bar and duration counter.
  - Tapping the Mic button records audio without any silence time-limit (supports multi-minute walk rambles).
  - Tapping Stop attaches a previewable audio chip `[🎙️ Voice Note (0:14) ▶️ ✕]` in the prompt dock.
  - Dispatches raw audio to the daemon over WebSocket/HTTP. The daemon saves it to `.user_uploaded` and attaches it directly to the Antigravity agent turn via `[Attached Media]: file:///...`, letting Gemini natively hear the audio waveform and execute tasks directly.
  - Custom dark audio player bubble rendered in mobile chat feed for playback and scrub seeking.
- [x] **Microphone Voice Dictation in Android App:** Implemented native `RecognizerIntent.ACTION_RECOGNIZE_SPEECH` via `AndroidHost.startVoiceInput()` in `MainActivity.java` with automatic transcription event feed into `PromptDock`.
- [x] **Resilient In-App Updater via Native DownloadManager:** Replaced manual `HttpURLConnection` with Android's system `DownloadManager`, featuring background system tray download notifications and automatic package installer launching.
- [x] **Queued Prompt Override, Force Send & Inline Edit:** Added `[⚡ Force Send]`, `[✎ Edit]`, and `[✕ Cancel]` pills in `PromptDock.tsx` and `ChatFeed.tsx` for immediate turn override, in-place prompt editing, and queue pruning.
- [ ] **AI Model Directive Binding:** Wire the model dropdown in `PromptDock` to inject model directives into the prompt wrapper or route to IDE selection.

### Phase 2.2: Deep IDE Inspection & Concurrent Workspace Management
- [x] **Concurrent Multi-Window Workspace Switcher:**
  - **Discrete Workspace Containers:** Each open IDE window is treated as an isolated container on the phone companion (`Container A: antigravity compainion`, `Container B: FIRE TV`).
  - **Dynamic File System Explorer (Killed Hardcoded Tree Mock):** Replaced static mock in `ActionModals.tsx` with live `/api/workspace/files` crawling over HTTP & WebSocket. Dynamic expansion, child scanning, and zero mocks.
  - **Header Workspace Switcher Pill (`[📁 <WorkspaceName> ▾]`):** 1-tap dropdown in the phone header displaying active container name, live status dots (`Idle` / `Busy` / `Waiting Approval`), pending approval counters, and immediate project switching.
  - **Multi-Window Approval Isolation:** Approval cards display prominent workspace badges (`[FIRE TV]` vs `[antigravity compainion]`) so you know exactly which project requires tool approval.
- [ ] **Recent Projects Hub & Auto-Companion Initialization:**
  - Tapping the active header tab / workspace dropdown displays the full list of recent Antigravity projects (1:1 with Antigravity IDE's native Home/Welcome screen).
  - Selecting any previous project switches the active session in the companion.
  - **Zero-Touch Auto-Hook:** If the selected project does not yet have the companion hook installed, the daemon automatically runs `hook install <projectPath>` on the host, provisioning `.agents/hooks.json` and `.agents/interceptor.js` on the fly so tool approvals immediately route to your phone.
- [ ] **Fail-Safe Pause & Tap-to-Resume Approval Gating:**
  - In Remote Mode, when the 120s fail-safe timeout triggers on an unapproved mutating tool call, replace the fallback to desktop auto-run (`decision: 'ask'`) with an authoritative execution freeze (`decision: 'deny'`) with reason: `Execution Paused: Waiting for mobile approval. Chat suspended.`
  - Guarantees zero unattended file mutations or shell executions while the user is away from both PC and phone.
  - Phone approval card transitions into a persistent `[ ⏸️ PAUSED • Tap Allow to Resume ]` state (and syncs cleanup of expired pending states to eliminate "ghost cards").
  - When the user returns and taps **Allow** (or texts "Approved / Proceed" in the bottom dock), the daemon detects the late approval and dispatches an automated continuation prompt (`Approved: Proceed with <toolTitle>`) through the Extension Host, seamlessly waking the agent to run the tool and continue the turn.
- [ ] **Live Terminal Stream:** Wire terminal stdout into `ActionModals.tsx` so users can inspect active build logs and script outputs directly from their phone.
- [ ] **Git Diff Inspection Cards:** Render unified diff chunks inside the "File Changes" modal so users can review exact code additions/deletions before granting tool approval.
- [ ] **Multi-Workspace & History Drawer:** Full multi-workspace switching and historical conversation browsing from the sidebar drawer.

### Phase 2.3: Hardware Wake & Standby Resilience (Near-Immediate Future Scope)
- [ ] **Wake-on-LAN (WoL) Open Connector:**
  - When the host PC enters Windows Modern Standby (S0ix) or sleeps (`ide-status: dormant`), the mobile phone UI surfaces a 1-tap `[⚡ Wake PC]` action in the disconnected / dormant banner.
  - Tapping dispatches a UDP magic packet (MAC address broadcast to ports 7/9) across the local subnet and Tailscale mesh to wake the host desktop automatically.
- [ ] **Smart Plug Power Automation Connector:**
  - Expose an open connector / webhook port (Home Assistant, Tuya, Kasa, or custom webhook) to trigger smart plug power-cycling if the host OS encounters a kernel freeze.
- [ ] **Seamless Dormant-to-Active Queue Rehydration:**
  - Mobile prompt dock transitions queued offline prompts directly into the host agent the instant the machine wakes and heartbeats resume.

### Phase 2.4: Visual Identity, Brand System & Pre-Launch Rebranding
- [x] **Official Product Rebranding to KYBER:** Rebranded from working title to **KYBER** (Greek *κυβερνήτης* — helmsman, navigator, pilot; root of cybernetics).
- [x] **Official Geometric Mark ("The Kinetic Shift" / Variation A.3):** Engineered precision dual-diamond vertically offset facets with hairline tension slit (`[48.5,18 22,58 48.5,98]` and `[51.5,2 78,42 51.5,82]`). Stark monochrome obsidian palette (`#ffffff`, `#a1a1aa`, `#121213`).
- [x] **Master Brand Identity Specification (`BRAND.md`):** Complete design doctrine locked in: "The Autonomous Pocket Supervisor". Established obsidian surface tokens (`#121213`/`#181818`/`#1f1f1f`), crisp hairline borders, tactile 44px ergonomics, zero-slop anti-emoji rules, and haptic signature profiles.
- [x] **Universal Cross-Platform Asset Rollout:**
  - **Web Client:** Created `KyberLogo` SVG mark in `CommonUI.tsx` (with `AntigravityLogo` backward-compatible alias), updated `HomeScreen.tsx`, updated `index.html` title and SVG favicon. Built and synced to Android (`npx cap copy android`).
  - **Android Native App:** Updated `ic_launcher_background.xml` (`#121213`), updated `ic_launcher_foreground.xml` with A.3 vector silhouette, updated `strings.xml` (`app_name` = `KYBER`, `title_activity_main` = `KYBER`), updated `capacitor.config.ts`.
  - **VS Code Extension:** Updated `media/icon.svg`, updated `package.json` (`displayName: "KYBER"` and activity bar title), built and deployed to live extension directory.
  - **CLI Daemon:** Updated `agy-companion.ts` ASCII banner to `KYBER`.
- [ ] **Notification Beautification:** Modernize the persistent notification using styled category headers, monospace command badges, and Linear-style status indicators.
- [ ] **Tactile Audio Feedback:** Replace generic Web Audio beeps with subtle, tactile audio cues synthesized for status changes, approval prompts, and turn completions.

---

## 5. Open-Source Release & Distribution Pipeline

### The 60-Second Onboarding Experience
```bash
# 1. Any developer runs:
npx agy-companion

# 2. Terminal outputs an ASCII QR code with secure one-time pairing ticket.
# 3. Scanning with phone camera opens pre-paired web companion immediately.
# 4. Optional: Download pre-built Android APK directly from phone header.
```

### GitHub CI/CD Automation Matrix
- **Pull Request CI (`.github/workflows/ci.yml`):**
  - Typecheck monorepo (`tsc --noEmit`).
  - Lint and style verification.
  - Web client production bundle validation (`vite build`).
- **Release Automation (`.github/workflows/release.yml`):**
  - Triggers on git tags `v*.*.*`.
  - Runs headless Gradle build (`./gradlew assembleDebug` / `assembleRelease`).
  - Publishes `AntigravityCompanion.apk` to GitHub Release Assets.
  - Publishes `@agy-companion/cli` to npm registry.
- **VS Code Extension Marketplace:**
  - One-click install from the marketplace with status bar 1-click hook activation.

---

## 6. Zero Decorative UI & Functional Control Mandate

A core design doctrine of Antigravity Companion: **Zero Fake / Decorative UI**. Every button, chip, setting toggle, and status pill visible to the user must be backed by working functional logic and real telemetry:

1. **Prompt Queue Override Controls:**
   - **`[✕ Cancel]` Pill:** Instantly discards the queued prompt from memory without requiring an app reload or daemon restart.
   - **`[⚡ Force Send]` Pill:** Triggers an immediate emergency stop interrupt on the host agent, denies active pending gates, wipes the ongoing turn, and dispatches the queued prompt ahead of everything.
2. **Settings Modal Functional Controls:**
   - **`v0.1.0-beta.1 (Baseline Frozen)` Badge:** Live verification of current release status.
   - **`[Request Unrestricted Battery]` Action:** Triggers Android's `ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` system prompt via `MainActivity.java` so users can prevent Android OEM doze killers from stopping background supervision.
3. **Header Actions Distinction:**
   - `[+]` creates a fresh clean conversation session.
   - `[✕]` invokes `AndroidHost.minimizeApp()` on native Android (moving app to background while keeping foreground service alive) or resets conversation in browser.
4. **Zero Emojis Policy:**
   - All visual glyphs across buttons, badges, and status pills must use pure Lucide SVGs (e.g. `<Zap />`, `<Clock />`, `<CheckSquare />`) and standard typographic tokens (`+`, `-`, `M`, `U`), never OS emojis.

---

## 7. The Grand Scope: Universal Remote Coding Companion & Tri-Force Team Division

> **Core Philosophy:** *"Ship it unfinished, start doing, and polish it together."*

What began as an Antigravity-specific supervisor is architecturally evolving into the **Universal Remote Coding Companion** (working title, to be rebranded before public distribution). The phone acts as an ergonomic, ultra-low-latency Supervisor Shell; all heavy compute, LLMs, tool executions, and compilers remain anchored to the host PC.

### Hierarchical Architecture: Sub-Roadmaps Feeding the Grand Scope
Every single task executed in this codebase is treated as a **sub-roadmap** that must connect seamlessly into the larger macro scope:
- **Baseline First, Polish Second:** Deliver the working baseline (v0.1 / v0.2) first. Real-world dogfooding and collaboration beat premature optimization.
- **The Open Connector Pattern:** Every module, daemon endpoint, and mobile screen must leave an open port, connector, or interface. Future additions—such as Wake-on-LAN hardware wake, smart plug power cycling, and alternate AI providers (Codex, Claude Code)—must plug in directly without altering core baseline plumbing.

### Tri-Force Team Division (Private Repo Collaboration)
Once the Beta 1/2 baseline is locked, the codebase will be shared in a private team repository to split the development into 3 parallel streams:

```
                          ┌─────────────────────────────────────┐
                          │     Unified Mobile Companion UI     │
                          │   (React + Capacitor Android APK)   │
                          └──────────────────┬──────────────────┘
                                             │ WebSocket / Tailscale
                          ┌──────────────────▼──────────────────┐
                          │    Universal Companion Daemon       │
                          │    (ws-gateway.ts + ipc-server)     │
                          └──────────────────┬──────────────────┘
                                             │
             ┌───────────────────────────────┼───────────────────────────────┐
             │                               │                               │
┌────────────▼────────────┐     ┌────────────▼────────────┐     ┌────────────▼────────────┐
│ Stream 1: Antigravity   │     │ Stream 2: Codex         │     │ Stream 3: Claude Code   │
│ (Anshul + Antigravity)  │     │ (Collaborator 1)        │     │ (Collaborator 2)        │
│ • IDE hook interception │     │ • Codex session adapter │     │ • Claude CLI wrapper    │
│ • Native audio ingestion│     │ • Tool approval routing │     │ • Stdio / PTY streams   │
│ • Recent projects hub   │     │ • Code patch previews   │     │ • Cost & token tracking │
└─────────────────────────┘     └─────────────────────────┘     └─────────────────────────┘
```

1. **Stream 1: Core Daemon & Antigravity Provider (Anshul + Antigravity)**
   - Maintain the core daemon engine, Tailscale mesh networking, Android foreground service (ID 9001), and the primary Antigravity IDE adapter.
   - Lead the native Gemini multimodal voice ingestion and recent project auto-hook provisioning.

2. **Stream 2: Codex Companion Provider (Collaborator 1)**
   - Build the `CodexAdapter` plugging directly into the existing daemon IPC and WebSocket gateway.
   - Route Codex sessions, approvals, and turns to the unified mobile UI with zero UI rewrites.

3. **Stream 3: Claude Code Companion Provider (Collaborator 2)**
   - Build the `ClaudeCodeAdapter` wrapping Claude Code CLI stdio and permission prompts.
   - Allow switching from Antigravity to Claude Code on your phone with zero reconnect friction.

### Hardware Wake & Resilience Connectors
- **Wake-on-LAN (WoL) Magic Packets:** When the companion detects the host PC is sleeping or offline (`ide-status: dormant`), provide a 1-tap `[⚡ Wake PC]` button that dispatches a UDP magic packet across the Tailscale / local subnet to boot the host machine.
- **Smart Plug Automation Connector:** Webhook/MQTT connector allowing developers to toggle a smart plug (e.g., Home Assistant, Tuya, Kasa) to remotely power cycle the desktop if the OS enters an unresponsive freeze.
