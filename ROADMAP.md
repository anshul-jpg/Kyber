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

### Phase 2.0: Post-IDE Restart Lifecycle & Remote Autonomy (Highest Priority)
- [x] **Zero Desktop Popup Leakage in Remote Mode:**
  - Strict 3-mode interceptor doctrine in `.agents/interceptor.js`.
  - In Remote Mode, interceptor guarantees ZERO `force_ask` or `ask` leaks to IDE stdout across daemon disconnects, timeouts, or exceptions.
  - Failures in Remote Mode freeze execution safely (`decision: 'deny'`) rather than popping modals on an empty desk.
- [x] **Autonomous Auto Mode (Zero Prompts):**
  - Auto mode auto-allows tool execution without asking (`decision: 'allow'`).
  - Forced questions (`ask_question`) route to the active target device (Phone if Remote, PC if Desk).
  - Fully eliminated the flawed `getAutoModeResolution()` presence guessing heuristic.
- [x] **Daemon Detached Process Boundary & EPIPE Protection:**
  - Daemon spawned with `detached: true` and `unref()` so closing the IDE never kills the supervisor process.
  - Process stdout/stderr wrapped with `EPIPE` error suppression listeners.
- [x] **Post-Restart Extension Host Re-attachment:**
  - `DaemonManager.probeRunningDaemon()` re-attaches to the active daemon session on port 4040, registers active workspace, and drains buffered prompts from `pendingHostPrompts`.
- [x] **Paused Approval Retention Across Client Handshakes:**
  - `HookIpcServer.getPendingRequests()` in `ipc-server.ts` returns both active and paused requests (`[...pendingRequests, ...pausedRequests]`), preventing workspace managers from wiping paused cards on reconnect.
- [x] **Client-Side Mode & Policy State Persistence:**
  - Phone companion (`App.tsx`) initializes and persists `companionMode` in `localStorage` (`agy_companion_mode`), surviving mobile reboots and APK updates.

### Phase 2.1: Native App Polish & Core Gaps
- [x] **Native Audio Voice Notes (Gemini Multimodal Audio):**
  - Continuous `MediaRecorder` audio capture with live recording pulse bar and duration counter.
  - Tapping the Mic button records audio without any silence time-limit (supports multi-minute walk rambles).
  - Tapping Stop attaches a previewable audio chip `[🎙️ Voice Note (0:14) ▶️ ✕]` in the prompt dock.
  - **1-Tap Discard / Cancel:** Quick-discard `<Trash2>` controls in both the recording waveform bar and bottom dock to immediately cancel notes without cleanup.
  - Dispatches raw audio to the daemon over WebSocket/HTTP. The daemon saves it to `.user_uploaded` and attaches it directly to the Antigravity agent turn via `[Attached Media]: file:///...`, letting Gemini natively hear the audio waveform and execute tasks directly.
  - Custom dark audio player bubble rendered in mobile chat feed for playback and scrub seeking.
- [x] **Microphone Voice Dictation in Android App:** Implemented native `RecognizerIntent.ACTION_RECOGNIZE_SPEECH` via `AndroidHost.startVoiceInput()` in `MainActivity.java` with automatic transcription event feed into `PromptDock`.
- [x] **Resilient In-App Updater via Native DownloadManager:** Replaced manual `HttpURLConnection` with Android's system `DownloadManager`, featuring background system tray download notifications and automatic package installer launching.
- [x] **Queued Prompt Override, Force Send & Inline Edit:** Added `[⚡ Force Send]`, `[✎ Edit]`, and `[✕ Cancel]` pills in `PromptDock.tsx` and `ChatFeed.tsx` for immediate turn override, in-place prompt editing, and queue pruning.
- [x] **AI Model Directive Binding:** Wire the model dropdown in `PromptDock` to inject model directives into the prompt wrapper or route to IDE selection (`Gemini 3.8 Flash High/Mid/Low`, `Claude Opus/Sonnet 4.5`, `GPT-4.5`, `GPT OSS`).
- [x] **Recent Projects Hub:** Discovered host recent Antigravity projects from `storage.json` with 1-tap in-place launch on PC and auto-provisioning of `.agents/hooks.json`.
- [x] **Live Terminal Stream:** Intercept `RUN_COMMAND` IDE events in `ide-watcher.ts` and stream live console output with command banners, timestamps, and exit-code badges into `ActionModals.tsx`.
- [x] **Git Diff Inspection Cards:** Unified diff chunks inside tool approval cards and "File Changes" modal with auto-expansion on file edits, +ins/-del counts, and line-by-line syntax highlighting.
- [x] **Multi-Workspace & History Drawer:** Full multi-workspace switching and historical conversation browsing from the sidebar drawer.
- [x] **XSS Sanitization in Markdown Renderer (`CommonUI.tsx`):**
  - Sanitize markdown HTML outputs before injecting into the DOM, eliminating code execution risks from previewed files.

### Phase 2.3: Multi-Account Quota Pool & Automated Relay (Token Preservation)
- [ ] **Proactive & Reactive Quota Detection:**
  - **Status Bar & Language Server Telemetry:** Monitor remaining Gemini token allowance and weekly quota percentages directly from the IDE host.
  - **HTTP 429 / Rate-Limit Gate (Fail-Safe):** Intercept `RESOURCE_EXHAUSTED` / `429 Quota Exceeded` errors in `ide-watcher.ts` to trigger an instant emergency account relay before turns abort.
- [ ] **Automated < 10% Quota Trigger & Switching:**
  - Configurable threshold (default: 10% remaining weekly quota).
  - Automated desktop account / profile rotation via VS Code Extension Host (`workbench.profiles.actions.switchProfile` or `vscode.authentication.getSession`).
- [ ] **Zero-Context-Loss Session Handoff (The 4-Step Relay):**
  - **Step 1 (Session Snapshot):** Capture active turn history, goal, open files, and git diff in a serialized `session_handoff.json`.
  - **Step 2 (Profile / Account Swap):** Extension switches active desktop account or profile and executes soft reload (`workbench.action.restartExtensionHost`).
  - **Step 3 (Permission & Policy Re-Arming):** Re-attaches `.agents/interceptor.js` and `.agents/hooks.json` with explicit `permissionOverrides` so new user profile does not fall back to IDE desktop approval prompts.
  - **Step 4 (Context Primer Turn):** Automatically injects a continuation handover turn into the new account session (`[KYBER Handover]: Resumed from Account A (Quota < 10%). Current goal: <goal>. Last action: <step>. Continue.`).
- [ ] **Mobile Control & Mission Control Dashboard:**
  - **Real-Time Quota Gauges:** Render account pool cards in phone Settings / Drawer (`Account A: 8% [Auto-Switch Armed]`, `Account B: 95%`).
  - **Auto-Switch Toggle:** `[⚡ Auto-Switch at < 10% Quota: ON/OFF]` with custom threshold selector (5%, 10%, 15%).
  - **1-Tap Manual Account Switch:** Swap active host IDE accounts directly from your phone while away from desk.
  - **Push Notification Alerts:** Send native push notifications on Android / Web: *"⚠️ Account A dropped below 10%. Seamlessly switched to Account B. Context and approvals preserved."*

### Phase 2.4: Hardware Wake & Standby Resilience (Near-Immediate Future Scope)
- [ ] **Wake-on-LAN (WoL) Open Connector:**
  - When the host PC enters Windows Modern Standby (S0ix) or sleeps (`ide-status: dormant`), the mobile phone UI surfaces a 1-tap `[⚡ Wake PC]` action in the disconnected / dormant banner.
  - Tapping dispatches a UDP magic packet (MAC address broadcast to ports 7/9) across the local subnet and Tailscale mesh to wake the host desktop automatically.
- [ ] **Smart Plug Power Automation Connector:**
  - Expose an open connector / webhook port (Home Assistant, Tuya, Kasa, or custom webhook) to trigger smart plug power-cycling if the host OS encounters a kernel freeze.
- [ ] **Seamless Dormant-to-Active Queue Rehydration:**
  - Mobile prompt dock transitions queued offline prompts directly into the host agent the instant the machine wakes and heartbeats resume.

### Phase 2.5: Visual Identity, Brand System & Pre-Launch Rebranding
- [x] **Official Product Rebranding to KYBER:** Rebranded from working title to **KYBER** (Greek *κυβερνήτης* — helmsman, navigator, pilot; root of cybernetics).
- [x] **Official Geometric Mark ("The Kinetic Shift" / Variation A.3):** Engineered precision dual-diamond vertically offset facets with hairline tension slit (`[48.5,18 22,58 48.5,98]` and `[51.5,2 78,42 51.5,82]`). Stark monochrome obsidian palette (`#ffffff`, `#a1a1aa`, `#121213`).
- [x] **Master Brand Identity Specification (`BRAND.md`):** Complete design doctrine locked in: "The Autonomous Pocket Supervisor". Established obsidian surface tokens (`#121213`/`#181818`/`#1f1f1f`), crisp hairline borders, tactile 44px ergonomics, zero-slop anti-emoji rules, and haptic signature profiles.
- [x] **Universal Cross-Platform Asset Rollout:**
  - **Web Client:** Created `KyberLogo` SVG mark in `CommonUI.tsx` (with `AntigravityLogo` backward-compatible alias), updated `HomeScreen.tsx`, updated `index.html` title and SVG favicon. Built and synced to Android (`npx cap copy android`).
  - **Android Native App:** Updated `ic_launcher_background.xml` (`#121213`), updated `ic_launcher_foreground.xml` with A.3 vector silhouette, updated `strings.xml` (`app_name` = `KYBER`, `title_activity_main` = `KYBER`), updated `capacitor.config.ts`.
  - **VS Code Extension:** Updated `media/icon.svg`, updated `package.json` (`displayName: "KYBER"` and activity bar title), built and deployed to live extension directory.
  - **CLI Daemon:** Updated `agy-companion.ts` ASCII banner to `KYBER`.
### Phase 2.6: Security, System Hardening & Field Test Resilience
- [x] **Daemon Auth Token Verification (`ws-gateway.ts`):**
  - Enforce token verification on WebSocket connection upgrades and sensitive HTTP endpoints (`/api/prompt`, `/api/hook/approval`, `/api/workspace/files`, `/api/workspace/file/content`, `/api/stop`).
  - Reject unauthenticated requests from local network or public Cloudflare tunnels, validating against `~/.agy-companion-token`.
- [x] **Path Traversal Containment Guard (`ws-gateway.ts`):**
  - Replace naive `targetPath.startsWith(rootPath)` with canonical path relative containment (`path.relative(rootPath, targetPath)`).
  - Normalize path casing on Windows to prevent directory traversal escapes.
- [x] **Dynamic Host Dispatch for Android Lockscreen Service (`CompanionForegroundService.java`):**
  - Store the active host URL in Android `SharedPreferences` upon pairing/connecting.
  - Dynamically route 1-tap lockscreen Allow/Deny decisions to the connected host over cellular/Tailscale/tunnel instead of hardcoded dev IP.
- [x] **Non-Blocking Git Telemetry (`ipc-server.ts`):**
  - Transition synchronous `execSync('git ...')` to asynchronous non-blocking calls with a 3-second cache.
  - Guarantees the Node.js event loop never freezes during rapid tool calls, preventing mobile heartbeat drops.
- [x] **Windows Drive Casing Workspace Deduplication (`workspace-manager.ts`):**
  - Lowercase Windows paths before base64 ID hashing to eliminate duplicate ghost containers (`d:\` vs `D:\`).
- [x] **Bounded Transcript Reading for History Discovery (`ide-watcher.ts`):**
  - Stream/read only the first 2KB of session logs to extract conversation titles instead of reading 20MB files into memory synchronously.
- [x] **XSS Sanitization in Markdown Renderer (`CommonUI.tsx`):**
  - Sanitize markdown HTML outputs before injecting into the DOM, eliminating code execution risks from previewed files.

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

### Hardware Wake & Resilience Connectors (Scheduled Tomorrow)
- [ ] **Wake-on-LAN (WoL) Magic Packets:** When the companion detects the host PC is sleeping or offline (`ide-status: dormant`), provide a 1-tap `[⚡ Wake PC]` button that dispatches a UDP magic packet across the Tailscale / local subnet to boot the host machine.
- [ ] **Smart Plug Automation Connector:** Webhook/MQTT connector allowing developers to toggle a smart plug (e.g., Home Assistant, Tuya, Kasa) to remotely power cycle the desktop if the OS enters an unresponsive freeze.

---

## 8. The Four Strategic Horizons of KYBER

### Horizon 1: Multi-Model Dogfooding, Open Connectors & Hardware WoL (Immediate 24–48 Hours / Tomorrow)
*Target: Personal dogfooding, baseline rock-solid multi-provider support, zero-standby wake.*
- [x] **Host Physical RAM & CPU Telemetry Pipeline (`os.freemem()` / `os.totalmem()`):** Real-time hardware telemetry pushed to mobile settings dock; instantaneous memory reclaimed counter.
- [x] **Remote IDE Process Lifecycle Governance:** 1-tap `[Close IDE]` (terminates heavy IDE processes via `taskkill` to reclaim ~3.5GB RAM while keeping the 30MB daemon alive) and `[Restart IDE]` from phone.
- [ ] **Wake-on-LAN (WoL) UDP Magic Packet Emitter:**
  - Send UDP broadcast magic packets (ports 7 & 9) over local Wi-Fi / Tailscale subnet to boot/wake sleeping PCs from the dormant mobile banner.
- [ ] **Smart Plug Remote Automation Port:**
  - Webhook/MQTT connector allowing developers to toggle a smart plug (Home Assistant, Tuya, Kasa) to remotely power cycle frozen workstations.
- [ ] **Claude Code Adapter Prototype (`ClaudeCodeAdapter`):**
  - Stdio / PTY process wrapper around Claude Code CLI.
  - Intercept interactive tool permissions (`y` / `n` / `always`) and pipe into phone lockscreen approval loop without needing a VS Code extension.
  - Stream ANSI terminal execution into the mobile terminal sheet.
- [ ] **Universal Cockpit Provider Accents:**
  - Dynamic brand accent tokens: Antigravity Electric Blue (`#0078d4`), Claude Warm Terracotta (`#d97706`), OpenAI Mint Green (`#10b981`).
- [ ] **Multi-IDE RAM Allocation Safeguard:**
  - Interactive prompt when switching active providers: `[⚡ Close Previous IDE to Free RAM (~2GB)]` vs `[Keep Both Running]`.

### Horizon 2: Intelligence, Quota Governance & Autonomous Relays (Near Term)
*Target: Self-healing autonomy, token preservation, uninterrupted multi-day agent runs.*
- [ ] **Multi-Account Quota Pool & Automated Relay (Token Preservation):**
  - Continuous token & quota telemetry via IDE status bar / LSP monitoring.
  - Intercept HTTP `429 Too Many Requests` / `RESOURCE_EXHAUSTED` before turns abort.
  - Automated <10% weekly quota trigger to switch desktop accounts/profiles (`workbench.profiles.actions.switchProfile`).
  - **The 4-Step Zero-Context Relay:** Snapshot session (`session_handoff.json`) → swap profile → re-arm hook overrides → inject continuation handover prompt.
- [ ] **Mobile Mission Control Quota Dashboard:**
  - Real-time quota gauges in phone Settings / Drawer (`Account A: 8% [Armed]`, `Account B: 95%`).
  - 1-tap manual account rotation from phone; native push alerts on seamless handover.
- [ ] **Battery Resilience & OEM Doze Shielding:**
  - Secondary Android `AlarmManager` heartbeat revival to resurrect `CompanionForegroundService` if killed during prolonged deep sleep.

### Horizon 3: Tri-Force Team Division & Private Multi-Dev Collaboration (Mid Term)
*Target: Parallel scaling across private repository; modular multi-agent adapters.*
- **Stream 1: Core Daemon Engine & Antigravity Provider (Anshul + Antigravity)**
  - Core daemon, Tailscale mesh, Android APK / foreground service (ID 9001), Antigravity adapter, multimodal Gemini voice notes, recent project hub.
- **Stream 2: Codex Companion Provider (Collaborator 1)**
  - Build `CodexAdapter` plugging directly into daemon IPC and WebSocket gateway.
  - Route Codex sessions, approvals, and unified diff previews to the unified mobile UI.
- **Stream 3: Claude Code Companion Provider (Collaborator 2)**
  - Build `ClaudeCodeAdapter` wrapping Claude Code CLI stdio/PTY, permission prompts, and token cost tracking.
- **Strict Open-Connector Interfaces:**
  - Formalize `@agy-companion/provider-sdk` with standard `AgentAdapter` interface (`connect()`, `onPreToolUse()`, `sendPrompt()`, `stop()`, `getHistory()`).

### Horizon 4: Open-Source Public Distribution & Global Launch (December 4th Milestone)
*Target: Seamless zero-config adoption for the global developer ecosystem; 100% private until launch.*
- [ ] **The 60-Second Onboarding Experience:**
  - Zero-config `npx kyber` command printing terminal ASCII QR code with pairing ticket.
  - 30-second camera scan connection with zero cloud accounts or port-forwarding setup.
- [ ] **VS Code Marketplace Publication:**
  - Official extension listing with 1-click hook activation and status bar companion dock.
- [ ] **Android Distribution & In-App APK Self-Updater:**
  - Automated GitHub Releases APK hosting, F-Droid submission, or Google Play companion listing.
- [ ] **CI/CD Automation Pipeline:**
  - Automated GitHub Actions matrix: typecheck, lint, Vite build, headless Gradle build, and npm CLI package publishing.
- [ ] **Zero-Leakage Privacy Policy:**
  - Repository remains 100% private and offline until the public hackathon submission on December 4th.

