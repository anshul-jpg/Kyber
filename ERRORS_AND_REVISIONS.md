# 🛡️ Antigravity Companion: Errors & Revisions Ledger (`ERRORS_AND_REVISIONS.md`)

> **Immutable Rule:** This file is strictly **append-only**. Never delete, truncate, or overwrite previous entries. Every regression, user pain point, failed assumption, and verified fix must be recorded here so no future agent repeats past mistakes.

---

## Revision Entry #001: The "Input Needed" / Ghost Command Black Hole

* **Date:** 2026-10-22
* **Severity:** Critical (Complete breakage of Phone $\rightarrow$ IDE prompt execution)
* **Status:** Resolved & Verified

### 1. What Error Was Caused?
When the developer sent a prompt from the mobile companion (or phone browser) to Antigravity IDE:
```
[workbench.action.chat.open Failed] command 'workbench.action.chat.open' not found
[workbench.action.openChat Failed] command 'workbench.action.openChat' not found. Falling back to queue marker ...
[Prompt Queued] Delivered to active session queue a9a047f4
```
The prompt was never submitted to the active Antigravity chat panel. Instead, it was written as a dormant queue marker into an old/inactive session directory (`a9a047f4`), causing the mobile UI to hang in an infinite `[INPUT NEEDED]` / waiting state.

### 2. What Did the User Dislike About It?
* The developer walked away from their PC to lie down in bed, expecting to text and code from their phone.
* The message went into a complete black hole on PC.
* The screen showed `[INPUT NEEDED]`, requiring manual PC intervention, completely destroying the core value proposition of remote companion coding.
* This broke right after it had previously been working.

### 3. Root Cause Analysis
1. A previous agent searched `workbench.desktop.main.js` and saw raw strings referencing vanilla VS Code Copilot commands (`workbench.action.chat.open`).
2. Without verifying whether that command was actually registered in the runtime extension command registry of Antigravity IDE, the agent swapped out the working command `antigravity.sendPromptToAgentPanel` with `workbench.action.chat.open`.
3. In Antigravity IDE (Google's custom agent environment, codename `jetski`), `workbench.action.chat.open` does not exist in the command registry.
4. Calling it threw `command not found`, triggering the extension's emergency fallback to disk (`messages/undelivered/`), which guessed an inactive conversation ID because `.db-wal` was inactive.

### 4. How Was It Solved?
1. Inspected `workbench.desktop.main.js` at line 28,066,962 and confirmed the official, native Antigravity IDE command:
   ```javascript
   // Class Pvf: id: "antigravity.sendPromptToAgentPanel"
   // Implementation: async run(t, e) { t.get(AJ).sendMessageToChatPanel?.(e) }
   ```
   `sendMessageToChatPanel` automatically opens the agent panel (`this.openPanel()`) and dispatches the prompt turn directly to the agent without UI guesswork.
2. Restored `antigravity.sendPromptToAgentPanel` in `packages/vscode-extension/src/daemon-manager.ts`.
3. Rebuilt the extension bundle (`npm run build --workspace=antigravity-companion`) and deployed the updated `dist/extension.js` to `~/.antigravity-ide/extensions/antigravity.antigravity-companion-0.1.0/dist/extension.js`.
4. Verified end-to-end via automated test harness `scripts/test-flow.js`.

### 5. Prevention Rule For All Future Agents
* **NEVER** replace a working Antigravity IDE command with generic VS Code Copilot commands.
* **NEVER** assume a string in a bundle is an executable command without checking `vscode.commands.getCommands()`.
* When updating prompt dispatch, ALWAYS run `scripts/test-flow.js` before concluding the turn.

---

## Revision Entry #002: Missing Permission Approvals & The `force_ask` Hook Clause

* **Date:** 2026-10-22
* **Severity:** Medium (Loss of intended approval prompts on PC and phone)
* **Status:** Identified & Diagnosed

### 1. What Error Was Caused?
The user noticed that during long coding sessions, almost no approval popups were appearing on their phone or PC ("I just give a prompt, everything gets done... there are lot less allow or deny prompts").

### 2. What Did the User Dislike About It?
The entire premise of Antigravity Companion is to act as a security & execution gatekeeper. If the agent can execute commands and modify files without pushing approval requests to the phone, the companion is bypassed.

### 3. Root Cause Analysis
1. **Limited Hook Matcher:** In `.agents/hooks.json`, the matcher was restricted strictly to `"matcher": "run_command"`. File operations (`write_to_file`, `replace_file_content`, etc.) never triggered the hook at all.
2. **Aggressive Command Whitelist:** In `.agents/interceptor.js`, commands matching `npm run build`, `vite build`, `tsc`, `gradlew`, `git status`, `git diff`, and `git log` were silently auto-approved without notifying the phone.
3. **Desk Mode Used `ask` Instead of `force_ask`:** In Desk Mode, `interceptor.js` returned `{"decision": "ask"}`. Antigravity IDE caches "Always Allow" permissions for terminal commands. Per the Antigravity Customization Specification (`docs/hooks.md`), `"ask"` respects the "Always Allow" cache, meaning the IDE silently runs the command without prompting the user. Only `"force_ask"` ignores cached permissions and forces the prompt to appear.
4. **Malformed Duplicate Hook Block:** In `.agents/hooks.json`, an invalid secondary block `"hooks": { ... "args": [...] }` existed. Antigravity's hook schema only supports `type: "command"` and `command: "..."`, which could invalidate hook parsing.

### 4. Prescribed Solution
1. Clean `.agents/hooks.json` to match the exact single-block schema from `docs/hooks.md`.
2. Expand the `matcher` in `hooks.json` to cover file modifications or critical tools if desired, or keep it strict for commands without malformed `args`.
3. In `interceptor.js`, change Desk Mode fallback from `"decision": "ask"` to `"decision": "force_ask"` so desktop prompts are never silently swallowed by IDE caches.
4. Audit the command whitelist to ensure sensitive commands are never auto-allowed in Remote Mode.

---

## Revision Entry #003: Fixed `force_ask` in Interceptor & Cleaned Hooks Schema

* **Date:** 2026-10-22
* **Severity:** Medium (Restored reliable permission prompting)
* **Status:** Resolved & Implemented

### 1. What Was Fixed?
1. **Desk Mode Hook Fallback:** Changed `.agents/interceptor.js` and `packages/cli/src/commands/install-hook.ts` from returning `{"decision": "ask"}` to `{"decision": "force_ask"}`. Per Antigravity IDE specification, `"ask"` is silently bypassed by IDE cached "Always Allow" permissions, while `"force_ask"` strictly forces the desktop dialog.
2. **Schema Cleanup in `hooks.json`:** Removed duplicate and malformed `"hooks": { ... "args": [...] }` block from `.agents/hooks.json`. Cleaned to standard single-block schema:
   ```json
   {
     "companion-interceptor": {
       "PreToolUse": [
         {
           "matcher": "run_command",
           "hooks": [
             {
               "type": "command",
               "command": "node \"d:/CODE/antigravity compainion/.agents/interceptor.js\"",
               "timeout": 130
             }
           ]
         }
       ]
     }
   }
   ```
3. **Whitelist Pruning:** Removed builds (`npm run build`, `vite build`, `tsc`, `gradlew`) from the silent auto-allow list, leaving strictly read-only git queries (`git status`, `git diff`, `git log`). All command executions now route properly to the phone in Remote Mode or prompt on desktop in Desk Mode.

---

---

## Revision Entry #004: Duplicate User Message Bubbles During Model Thinking

* **Date:** 2026-10-22
* **Severity:** Medium (Visual glitch, confusing dual prompt display during thinking)
* **Status:** Resolved & Implemented

### 1. What Error Was Caused?
When sending a prompt from the phone, the user prompt appeared duplicated (two identical user bubbles stacked together) on the phone screen for the entire duration of the model's thinking process. The duplicate bubble only disappeared after the model finished generating its response.

### 2. Root Cause Analysis
1. On phone prompt submit, `App.tsx` added an optimistic bubble: `{ id: 'client_u_<time>', role: 'user', content }`.
2. Daemon `ws-gateway.ts` received the prompt and broadcasted `{ id: 'msg_u_<time>', role: 'user', content }`.
3. In `App.tsx`, the filter `!(m.id.startsWith('client_u_') && ...)` removed `client_u_` and replaced it with `msg_u_`.
4. As the IDE executed `antigravity.sendPromptToAgentPanel`, `ide-watcher.ts` read the newly written `USER_INPUT` entry from the transcript and broadcasted `{ id: 'ide_u_<step_index>', role: 'user', content }`.
5. In `App.tsx`, `prev.filter` only checked for `client_u_`. Because `msg_u_` did not match `client_u_`, `msg_u_` was retained, and `ide_u_` was appended.
6. The chat feed held both `msg_u_` and `ide_u_` simultaneously until the turn finished and `server:history` replaced the list.

### 3. How Was It Solved?
1. In `packages/web/src/App.tsx`, updated `case 'server:chat_message':` to deduplicate incoming user messages by matching role (`user`), content (`incomingText === m.content.trim()`), and timestamp window ($<120$ seconds).
2. Existing optimistic (`client_u_`) or gateway (`msg_u_`) bubbles are upgraded in-place to the canonical `ide_u_` entry instead of appending duplicates.

---

---

## Revision Entry #005: Background App-Switch Stale Thinking State

* **Date:** 2026-10-22
* **Severity:** Medium (UI desync when multitasking on phone)
* **Status:** Resolved & Implemented

### 1. What Error Was Caused?
When a developer submitted a prompt on mobile, middle-swiped to switch apps while the model was thinking, and returned after the answer had completed on PC: the UI continued displaying the active "Model Thinking (LIVE)" accordion and "Antigravity is processing..." working pulse even though the assistant had already answered.

### 2. Root Cause Analysis
1. When Android backgrounded the app, WebSocket packets were paused or the connection reset.
2. The agent completed the turn on the PC and delivered the assistant response.
3. Upon returning to the app, `server:hello` reloaded `msg.history` (which contained the completed response), but `server:hello` never reset `isStreaming: false` or `currentThinking: null`.
4. In `ChatFeed.tsx`, the thinking block rendered whenever `(isStreaming || currentThinking)` was truthy without verifying whether the turn had already finished.

### 3. How Was It Solved?
1. In `packages/web/src/App.tsx`, added a state-reconciliation `useEffect`: whenever `chatMessages` updates, if the last message in the feed is an `assistant` response with content and no tool approvals are pending, `isStreaming`, `currentThinking`, and `isQueued` are automatically reset to `false`/`null`.
2. In `server:hello`, checked the last message in `msg.history` on connect and cleared streaming/thinking state immediately if completed.
3. In `packages/web/src/components/ChatFeed.tsx`, added `isLastMessageAnswered` guard so live thinking boxes and processing pulses are unconditionally suppressed once the assistant response is rendered.

---

## 📌 Active Implementation Roadmap (Next Steps)

### Task 1: Dormant Host State & In-Memory Buffer (COMPLETED & VERIFIED)
* **Protocol (`index.ts`):** Added `server:ide_status` (`active` | `dormant`) and `ideStatus` field in `server:hello`.
* **Daemon Gateway (`ws-gateway.ts`):** Added `pendingHostPrompts` RAM buffer and auto-drain on Extension Host attach.
* **Mobile UI Badge (`Header.tsx`):** Linear-styled 🟢 `IDE Active` / 🟡 `IDE Dormant` badge in header.

### Task 2: Dual-Tier In-App Updater for Android APK (COMPLETED & VERIFIED)
* **Native Android Bridge (`MainActivity.java`):** Implemented `downloadAndInstallApk(url)` with live download progress events and `FileProvider` system installer launch. Declared `REQUEST_INSTALL_PACKAGES` in `AndroidManifest.xml`.
* **Daemon Endpoint & Versioning (`ws-gateway.ts`):** Exposes `/api/apk-status` and broadcasts `apkBuildTime` in `server:hello`.
* **Mobile UI (`Header.tsx`):**
  - Linear/Raycast design compliance (`DESIGN.md` zero emojis, `#181818`/`#1f1f1f` neutral tokens, hairline borders).
  - Shows `[ RefreshCw (spinning) Updating X% ]` during download or `[ DownloadIcon Update APK ]` button when new APK is detected.
  - Dropdown options button dynamically switches between "In-App Update APK" (when inside APK) and "Download Android APK" (when in browser).
* **Compiled & Built:** `packages/web/android/app/build/outputs/apk/debug/app-debug.apk` freshly assembled and verified.

---

## Revision Entry #004: Ghost Approval Accumulation & Phone/Desktop Sync Drift

* **Date:** 2026-10-22
* **Severity:** Medium-High (Accumulation of up to 39 phantom/stale approvals in extension and companion)
* **Status:** Resolved & Verified

### 1. What Error Was Caused?
When running long companion sessions (e.g. while walking or away from desk), approvals accumulated into a backlog of phantom "ghost" requests (e.g., 39 pending approvals shown in the extension and companion). Even when approvals timed out, were answered directly on desktop, or were obsolete, they never disappeared from the UI or cleared from daemon memory.

### 2. Root Cause Analysis
1. **Timeout Event Leak:** In `HookIpcServer` (`ipc-server.ts`), when a request reached its 120-second timeout, it emitted `approval_timeout`, but never emitted `approval_resolved`.
2. **Gateway Disconnect:** `WsGateway` (`ws-gateway.ts`) never registered a listener for `approval_timeout`. Thus, `workspaceManager.removePendingApproval` was never called, and `server:approval_resolved` was never broadcast to connected clients (phone, web, extension).
3. **Workspace In-Memory Desynchronization:** `WorkspaceManager` kept holding stale approvals in RAM. Whenever a phone or extension connected, `server:hello` provided the bloated list of approvals from `msg.workspaces`.
4. **Missing Client Sync:** Neither `App.tsx` nor the VS Code extension reconciled `pendingApprovals` against authoritative daemon state on reconnect or on `server:workspaces_updated`.
5. **No Universal Purge Mechanism:** No protocol command or button existed for users to dismiss or clear stale approvals in bulk.

### 3. How Was It Solved?
1. **Timeout Lifecycle Completion:** `HookIpcServer` now emits `approval_resolved` with `{ decision: 'ask', reason: 'Mobile approval timed out (120s). Desktop fallback.' }` on expiration.
2. **Gateway Timeout Listener & Broadcast:** `WsGateway` now listens for `approval_timeout`, removes the approval from `workspaceManager`, and broadcasts `server:approval_resolved` with `decision: 'timeout'` to all connected clients.
3. **Authoritative Source of Truth Reconciler:** On client connection (`server:hello`), `WsGateway` filters `workspaceManager` approvals against active `HookIpcServer` pending requests, instantly purging orphaned entries.
4. **Client State Synchronization:** Both `App.tsx` and VS Code extension's `DaemonManager` now authoritatively sync pending approvals on `server:hello` and `server:workspaces_updated`.
5. **Universal Clear Mechanism:**
   - Added `{ type: 'client:clear_approvals' }` to protocol and `/api/approvals/clear` endpoint.
   - Added "Clear All" button in VS Code sidebar approvals header and command `antigravityCompanion.clearApprovals`.
   - Added "Clear All" / "Dismiss Stale" header button in mobile `ApprovalCards.tsx`.

---

## Revision Entry #006: Brand Identity Consolidation & Universal Cross-Platform Rollout (KYBER)

* **Date:** 2026-10-23
* **Severity:** High (Brand identity evolution & elimination of generic visual tropes)
* **Status:** Resolved & Fully Deployed

### 1. What Error / Pain Point Was Addressed?
* The project was operating under a working title ("Antigravity Companion") tied to a single IDE, whereas its macro architecture is evolving into a universal supervisor for multi-agent providers (Codex, Claude Code, Antigravity).
* Early mark explorations suffered from generic "AI visual tropes": pseudo-3D crystal shards, letter "K" monograms, glowing radar rings, and Windows blue `#0078d4` overlays on black.
* The user explicitly rejected these as "doing too much" and mandated the aesthetic standard seen in modern identities (e.g., logoinspo.com and sister brand Voxora): 100% 2D vector geometry with high negative-space tension and tactile minimalism.

### 2. Root Cause Analysis
* Conceptual designs were over-indexing on literal imagery (letters, crosshairs, 3D illusions) rather than timeless, abstract navigational geometry.

### 3. How Was It Solved?
1. **Brand Identity Locked:** Name finalized as **KYBER** (Greek *κυβερνήτης* — helmsman, navigator, pilot; root of cybernetics).
2. **Mark Locked:** **Variation A.3 (The Kinetic Shift)** — two vertically offset diamond facets separated by a 3px hairline tension slit (`[48.5,18 22,58 48.5,98]` and `[51.5,2 78,42 51.5,82]`). Stark monochrome palette (`#ffffff` and `#a1a1aa` on `#121213`).
3. **Universal Cross-Platform Rollout:**
   - **Web:** Mounted `KyberLogo` SVG in `CommonUI.tsx`, updated `HomeScreen.tsx`, updated `index.html` title and favicon. Synced to Android (`npx cap copy android`).
   - **Android Native:** Updated `ic_launcher_background.xml` (`#121213`), `ic_launcher_foreground.xml` (A.3 vector silhouette), `strings.xml` (`app_name` = `KYBER`), and `capacitor.config.ts`.
   - **VS Code Extension:** Replaced `media/icon.svg` with A.3 silhouette, updated `package.json` (`displayName: "KYBER"`), built and deployed to extension runtime.
   - **CLI:** Updated daemon startup ASCII banner in `agy-companion.ts`.
4. **Specification Documented:** Codified entire brand doctrine in `BRAND.md`.

---

## Revision Entry #007: Audio Scratchpad Transcript Leak in Mobile Chat (`ide-watcher.ts`)

* **Date:** 2026-10-23
* **Severity:** Medium-High (Mobile UX pollution with unstyled transcript dumps)
* **Status:** Resolved & Verified

### 1. What Error Was Caused?
When the user recorded and dispatched a voice note, the agent called `view_file` to inspect the audio file. In that step, the LLM generated its transcription notes in the step payload (`entry.content`). In the mobile companion app, this raw text (`00:00 - 02:11: The user explicitly laid out their vision and requested...`) was dumped directly into a primary chat bubble right below the voice note player.

### 2. Root Cause Analysis
* On desktop Antigravity IDE, intermediate text emitted alongside `entry.tool_calls` is treated as internal tool pre-reasoning, folded into the tool execution box, and hidden from the chat.
* In `ide-watcher.ts`, lines 202-212 blindly emitted any `entry.content` as an `assistant` chat message, regardless of whether tool calls were active.

### 3. How Was It Solved?
1. Updated `ide-watcher.ts`: If `entry.tool_calls` is present, `entry.content` is attached as thinking metadata to the tool call rather than broadcast as an assistant message.
2. Filtered out any residual raw transcription echoes in both `ide-watcher.ts` and `App.tsx` (`server:history` and `server:chat_message`).

---

## Revision Entry #008: Synthetic Platform Stop Hook vs Human Implementation Approval (`RequestFeedback` Pitfall)

* **Date:** 2026-10-23
* **Severity:** High (Agent auto-proceeding with code edits without human review)
* **Status:** Codified in Rules & Architectural Doctrine

### 1. What Error Was Caused?
The user explicitly requested: "Let's first just get the plan right... generate a workflow or a flowchart... before we kick off". The agent wrote the blueprint artifact `kyber_ui_flowchart_and_architecture.md` with `RequestFeedback: true`. Almost immediately, the agent began modifying code and implementing Phase A without waiting for the user to view or approve the flowchart.

### 2. Root Cause Analysis
* Antigravity IDE has an automated artifact review platform hook. If `RequestFeedback: true` is passed, the system injects a synthetic message: `<SYSTEM_MESSAGE> stop hook blocked termination due to reason: The user has automatically approved the artifact through their review policy. Proceed to execution. </SYSTEM_MESSAGE>`.
* The agent mistook this synthetic system hook message as an explicit instruction from the human user and began modifying files unprompted.
* The user was confused, wondering if the companion's "Auto Mode" caused it. (Auto Mode only governs tool approvals, not plans).

### 3. Prevention Rule For All Future Agents
* **NEVER** treat `<SYSTEM_MESSAGE> stop hook blocked termination... Proceed to execution` as human confirmation to edit code.
* When the user asks for a plan or flowchart first, HALT tool execution and wait for an explicit conversational message from the user before writing implementation code.
* For informational blueprints, set `RequestFeedback: false` in `ArtifactMetadata`.

---

## Revision Entry #009: Home Screen Navigation Trap Elimination & Real Workspace Switching

* **Date:** 2026-10-23
* **Severity:** High (Navigation trap locking users on blank home screen)
* **Status:** Resolved & Deployed

### 1. What Error Was Caused?
When the user tapped the `+` icon in the mobile header, the app reset `chatMessages: []`, flipping the screen to `HomeScreen.tsx`. However, `HomeScreen.tsx` had no button to return to the active chat session, trapping the user. Tapping workspaces in the list sent `client:switch_workspace`, but the daemon did not handle the message, leaving the user permanently stuck unless they navigated through the History drawer.

### 2. How Was It Solved?
1. **Resume Active Session Card:** Added a prominent, styled card at the top of `HomeScreen.tsx`: `[ 🟢 Active Session: <Title> • Resume Chat → ]`. Tapping it immediately restores the active chat.
2. **Session Backup:** Added `activeSessionBackup` in `App.tsx` so clicking `+` never permanently destroys the current conversation in memory.
3. **Daemon Workspace Switcher:** In `ws-gateway.ts`, wired handlers for `client:switch_workspace` and `client:select_workspace` to auto-discover the active conversation transcript for that workspace, load history, and broadcast `server:history` and `server:workspaces_updated`.
4. **Live Workspace Dots:** Displayed 🟢 (active running chat) and 🟡 (approval required) status dots on each workspace card.

---

## Revision Entry #010: Single-Window RAM Conservation on 16GB Machines (Multi-Project In-Place Switch)

* **Date:** 2026-10-23
* **Severity:** High (System memory exhaustion and freeze prevention on 16GB developer machines)
* **Status:** Resolved & Verified

### 1. What Error Was Caused?
When launching a project from Recent Projects on mobile, the CLI passed `-n` and the extension manager passed `forceNewWindow = true`. This spawned an entirely new Antigravity IDE Electron window and process tree alongside the existing one. Each instance of Antigravity IDE consumes between 1.5 GB and 3.5 GB of RAM. On a 16GB RAM rig running browser tabs, dev servers, and OS processes, opening multiple IDE instances quickly starved the machine of free memory.

### 2. Root Cause Analysis
1. In `packages/cli/src/session/recent-projects.ts`, the process spawn argument list included `-n` (the VS Code flag to force a new window).
2. In `packages/vscode-extension/src/daemon-manager.ts`, the folder switch command executed `vscode.commands.executeCommand('vscode.openFolder', uri, true)` where `true` explicitly requested a new window.

### 3. How Was It Solved?
1. Reverted `forceNewWindow` to `false` in `daemon-manager.ts` (`vscode.commands.executeCommand('vscode.openFolder', uri, false)`).
2. Stripped `-n` in `recent-projects.ts`.
3. Swapping projects now re-uses the existing window in-place, swapping working directories instantly with zero incremental Electron RAM footprint.

---

## Revision Entry #011: Remote IDE Lifecycle Controls & Zero-Startup-RAM Wake Architecture

* **Date:** 2026-10-23
* **Severity:** High (Remote RAM reclamation and elimination of the "phantom closed" IDE state)
* **Status:** Resolved & Fully Deployed

### 1. What Error Was Caused?
The developer walked away to sleep and requested that Antigravity IDE be closed so their PC wouldn't stay burdened with high RAM usage overnight. Upon waking up, Antigravity IDE was still wide open on their screen holding ~3.5 GB of RAM across 18 sub-processes. The assistant had previously reloaded the extension or daemon, mistakenly assuming the application process was managed, while no remote capability existed to actually close or restart the IDE application from mobile.

### 2. Root Cause Analysis
1. **Conflated Lifecycles:** The background daemon and VS Code extension host were treated as the same lifecycle as the desktop Electron executable (`Antigravity IDE.exe`).
2. **Missing Remote Lifecycle Protocol:** No WebSocket message (`client:close_ide`, `client:restart_ide`) or REST endpoints existed to terminate or restart the host IDE application.
3. **No RAM Telemetry:** The developer on mobile had zero visibility into host physical memory consumption (`os.freemem()` / `os.totalmem()`), making it impossible to verify whether closing an app freed memory.

### 3. How Was It Solved?
1. **Modular Provider Lifecycle Engine (`provider-lifecycle.ts`):**
   - Engineered an open-connector registry (`SUPPORTED_PROVIDERS`) supporting Antigravity IDE, Claude Code, and Codex.
   - `closeProvider(providerId)`: Detects OS platform. On Windows, executes `taskkill /IM "Antigravity IDE.exe" /F`, cleanly terminating all 18 Electron/jetski subprocesses and immediately returning 1.5 – 3.5 GB of RAM to Windows in under 1 second.
   - `restartProvider(providerId, workspacePath)`: Gracefully terminates the running process, waits 1.2s for OS file and port release, and spawns the IDE with the requested workspace.
2. **Persistent Daemon Process Boundary:**
   - The lightweight Node.js daemon (~30 MB) stays active and listening on ports 4040/4041 and Tailscale, ensuring mobile commands, prompt buffering, and wake triggers remain operational even when the IDE is closed.
3. **Real-Time Host Hardware Telemetry:**
   - Real-time CPU % and RAM usage (`usedMemMb`, `totalMemMb`, `usedMemPercent`) broadcast every 6s to connected phones.
   - Header dropdown renders a live Linear-style memory gauge (`Host RAM: 9.4 / 15.9 GB (59%)`), allowing the user to visually verify the ~1.5 GB memory drop in real time.
4. **Ergonomic Mobile Controls:**
   - Header dropdown provides 1-tap `[ 🔄 Restart IDE ]` and `[ ⏹️ Close IDE (Free ~1.5 GB) ]`.
   - When closed, the header badge flips to `[ 🟡 Dormant · Launch ]`, tapping launches and reconnects the IDE in 1 tap.
5. **Decoupled Wake-on-LAN Architecture (Windows Password Reality):**
   - Added Section 6 in `SettingsModal.tsx` ("Hardware & Power Controls - Advanced / Experimental") styled with caution boundaries for MAC/broadcast configuration.
   - Clarified and decoupled the wake sequence: WoL boots hardware to Windows Lockscreen $\rightarrow$ Daemon boots as a background task before login with ZERO startup IDE RAM $\rightarrow$ Phone companion commands on-demand IDE launch when needed.

---

## Revision Entry #012: Unclosed Markdown HTML Tag UI Bleed & WebSocket Handshake Authentication Hardening

* **Date:** 2026-10-23
* **Severity:** High (UI visual corruption and critical local-network WebSocket authentication vulnerability)
* **Status:** Resolved & Fully Deployed

### 1. What Error Was Caused?
1. **The "Blue Screen" Markdown Bug:** An explanation in the companion chat containing an example `<a href="...">` tag resulted in the entire lower half of the mobile chat turn turning sky blue (`#38bdf8`) with links and underlines applied to all subsequent paragraphs, lists, and headers.
2. **Unauthenticated WebSocket Door:** Any device on local Wi-Fi or public hotspot could open `ws://<host>:4040` without credentials, automatically receive the master secret pairing token in `server:hello`, and have their IP auto-whitelisted across all daemon REST endpoints via `activeClientIps`.

### 2. Root Cause Analysis
1. **Unescaped Raw HTML in Marked:** `marked` by default passed raw HTML tokens through without entity escaping. Because the example `<a href="...">` lacked a closing `</a>`, the browser's DOM parser interpreted every subsequent DOM node as an unclosed anchor link, inheriting `.prose-antigravity a { color: #38bdf8; }`.
2. **Missing `verifyClient` Hook in WebSocketServer:** `new WebSocketServer({ server })` lacked connection upgrade validation. Anyone could complete the HTTP 101 Switching Protocols handshake before authentication checks were performed.
3. **Flawed IP-Level Auto-Authorization:** Once a WebSocket connection opened, `this.activeClientIps.add(clientIp)` gave that IP carte-blanche authorization across all REST endpoints in `isRequestAuthorized()`.

### 3. How Was It Solved?
1. **Marked Token Escaping Extension (`CommonUI.tsx`):**
   - Configured `marked.use()` with a `walkTokens` interceptor. All `token.type === 'html'` tokens are automatically escaped (`<` $\rightarrow$ `&lt;`, `>` $\rightarrow$ `&gt;`, `&` $\rightarrow$ `&amp;`), ensuring raw HTML tags render as visible code/text without executing or corrupting the DOM tree.
   - Real markdown links (`[text](url)`) are preserved and rendered with `target="_blank" rel="noopener noreferrer"` and `javascript:` pseudo-protocol sanitization.
2. **Strict WebSocket `verifyClient` Handshake (`ws-gateway.ts`):**
   - Added `verifyClient` to `WebSocketServer`. Unauthenticated upgrade requests lacking a valid Bearer token (`?token=...`, `?ticket=...`, or header) are rejected immediately with HTTP `401 Unauthorized` before the socket opens.
   - Excluded `token` from `server:hello` for all remote connections; only local loopback (`127.0.0.1` / `::1`) receives the token.
   - Completely deleted the `activeClientIps` auto-whitelist bypass: every HTTP and WebSocket request must present credentials independently.
3. **Verified & Built:**
   - Web application built (`npm run build`), synced to Android (`npx cap copy android`), CLI recompiled (`tsc`), and Android debug APK assembled cleanly via `./gradlew assembleDebug`.

---

## Revision Entry #013: Mobile QuestionCard Interception vs Hook Path Resolution Fix

* **Date:** 2026-10-23
* **Severity:** High (Hook execution path failure and premature feature ban retraction)
* **Status:** Resolved & Verified (1:1 Mobile QuestionCard Fully Operational)

### 1. What Error Was Caused?
1. **The Original Gap (Step 655):** Antigravity IDE's native `ask_question` tool originally bypassed the phone companion because `.agents/hooks.json` only matched mutating filesystem/shell tools. When the agent asked a question, a modal popped up exclusively on the desktop PC, leaving the mobile companion hanging in "Thinking..." while the developer was away from their desk.
2. **The Resolution Built (Steps 666–816):** We built a complete 1:1 mobile replica:
   - Added `ask_question` to `.agents/hooks.json` PreToolUse matcher.
   - Added question title & options parser in `ipc-server.ts:4041`.
   - Created the pixel-perfect `QuestionCard` component in `packages/web/src/components/ApprovalCards.tsx` with Antigravity dark theme fidelity, numbered badges, multi/single-select support, "Other" write-in input, tactile haptic feedback, and Skip/Submit buttons.
   - Tested live with the user on their phone: the user picked an option, tapped Submit, and the response routed directly back into the conversation.
3. **The Regression / Premature Ban:** Later in the session, an agent observed a turn freeze on PC and mistakenly assumed `ask_question` was an uninterceptable platform modal, adding a false "Strict Ban" to `AGENTS.md` and logging a flawed Entry #013.

### 2. Root Cause Analysis
1. **Hook CWD Path Fragility:** `.agents/hooks.json` contained `"command": "node ./interceptor.js"`. When Antigravity IDE executes hooks with CWD set to the workspace root (`d:\CODE\antigravity compainion`), executing `node ./interceptor.js` failed with `MODULE_NOT_FOUND` because `interceptor.js` lived inside `.agents/`. When a hook throws an error, the IDE falls back to native desktop execution (opening the desktop modal popup on PC) without sending the hook request to `HookIpcServer` (`port 4041`).
2. **Local vs Global Mode Sync:** `.agents/companion-mode` was left at `desk` while `~/.agy-companion-mode` was `remote`, risking fallback discrepancies if the global file was unreadable.
3. **Flawed Conclusion by Assistant:** Rather than inspecting why the hook failed to reach port 4041, the assistant prematurely concluded `ask_question` was desktop-only and banned a feature that was already built, tested, and loved by the user.

### 3. How Was It Solved?
1. **Root Interceptor Trampoline (`interceptor.js`):**
   - Added a fail-safe root `interceptor.js` in the workspace root that delegates directly to `.agents/interceptor.js`.
   - Ensures hook execution succeeds immediately whether the IDE runs `node ./interceptor.js` or `node .agents/interceptor.js`.
2. **Synchronized Mode State:**
   - Synchronized `.agents/companion-mode` to `remote` to match `~/.agy-companion-mode`.
3. **Retracted False Ban from `AGENTS.md`:**
   - Replaced the ban in `AGENTS.md` with explicit instructions documenting that `ask_question` is fully supported and rendered as a 1:1 `QuestionCard` on the phone.
4. **Verified End-to-End Flow:**
   - When `ask_question` is called in Remote Mode, `interceptor.js` posts to `ipc-server.ts:4041`.
   - `HookIpcServer` emits `approval_requested` with `toolCall.name === 'ask_question'`.
   - Mobile companion renders the interactive `QuestionCard`.
   - User selection resolves the pending request with `{ decision: 'deny', reason: 'User responded from mobile companion: <Answer>' }`, returning the selection directly to the agent runtime with zero desktop PC interaction needed.

---

## Revision Entry #014: Auto Mode Dynamic Presence Fragility & Remote IDE Restart Failure

* **Date:** 2026-10-23
* **Severity:** Critical (Mobile approval blackout in Auto Mode and failed remote IDE restart process spawning)
* **Status:** Resolved & Verified

### 1. What Error Was Caused?
1. **Invisible QuestionCard / Approval Blackout in Auto Mode:** While the developer was outside with their companion setting configured to `auto`, the agent invoked `ask_question` (and mutating shell tools). The interactive card never appeared on the developer's phone. After 120 seconds, the agent timed out. On desktop PC, native IDE modals were displayed, completely unreachable from mobile.
2. **Remote Restart IDE Closed But Never Reopened:** When the developer dispatched `[Restart IDE]` from their phone, Antigravity IDE terminated its processes, but failed to relaunch. The developer was forced to use Moonlight remote desktop to manually reopen the IDE.

### 2. Root Cause Analysis
1. **Auto Mode Presence Resolution Flaw (`getAutoModeResolution`):**
   - `getAutoModeResolution()` queried `http://127.0.0.1:4040/api/health` with an ultra-short 350ms timeout.
   - When a user is outside with their phone in their pocket, the mobile screen turns off and the mobile OS sleeps or drops the WebSocket connection, bringing `connectedPhoneCount` to `0`.
   - `getAutoModeResolution()` erroneously assumed `connectedPhoneCount === 0` meant the user was sitting at their desk (`desk` mode).
   - If the request timed out (>350ms) or `connectedPhoneCount === 0`, it immediately resolved to `desk`, emitting `{"decision":"force_ask"}` directly to the IDE and exiting. The hook never reached `postToDaemon` (`port 4041`), leaving `pendingApprovals` completely empty on mobile.
   - Furthermore, `ipc-server.ts` checked `rawMode === 'remote'` strictly, so if a request ever did enter the queue in `auto` mode, its 120s timeout triggered desktop fallback rather than pausing safely for mobile.
2. **Restart Provider Forwarding Hijack:**
   - In `ws-gateway.ts`, `client:restart_ide` passed an `onForwardToExtension` callback to `restartProvider(providerId, targetPath, onForwardToExtension)`.
   - After `closeProvider()` killed the IDE process with `taskkill`, `this.extensionClients` still had the dying WebSocket marked as `OPEN` while TCP sockets drained.
   - `launchRecentProject()` saw `onForwardToExtension` return `true`, assumed the project was opened in the extension host, and returned early without ever spawning the IDE executable!
   - Furthermore, `executableCandidates` only checked `Antigravity IDE.exe` in `AppData/Local/Programs/Antigravity IDE` without querying `~/.agy-ide-path` or `ANTIGRAVITY_IDE_EXEC_PATH`.

### 3. How Was It Solved?
1. **Resilient Auto Mode Presence (`getAutoModeResolution` & `lastPhoneActivity`):**
   - Increased `getAutoModeResolution()` timeout from 350ms to 2500ms to eliminate loopback timeout false positives.
   - Added `lastPhoneActivity` timestamp in `ws-gateway.ts` updated on every phone connection, ping, prompt, and approval response.
   - In `getAutoModeResolution()`, if `connectedPhoneCount === 0`, it inspects `lastPhoneActivity`. If a phone was active within the last 45 minutes, it correctly recognizes that the developer is away with their phone in pocket and resolves to `remote`.
   - In `ipc-server.ts`, updated timeout pause gating to recognize both `'remote'` and `'auto'` (`rawMode === 'remote' || rawMode === 'auto'`), guaranteeing sessions pause safely rather than popping terminal prompts on an empty desk.
2. **Clean Remote IDE Restart Execution:**
   - In `ws-gateway.ts`, `client:restart_ide` and `/api/host/restart-ide` immediately clear `this.extensionClients` and `this.extensionWorkspaces`, broadcast `ide_status: 'dormant'`, and invoke `restartProvider(providerId, targetPath)` without `onForwardToExtension`.
   - In `provider-lifecycle.ts`, `restartProvider()` terminates running instances, waits 1500ms for OS locks to release, and launches `launchRecentProject(targetPath)` directly as a fresh process.
   - Added `'Antigravity.exe'` to `windowsProcessNames`.
   - In `daemon-manager.ts`, the running IDE extension writes `process.execPath` to `~/.agy-ide-path` and injects `ANTIGRAVITY_IDE_EXEC_PATH: process.execPath` into the daemon environment.
   - In `recent-projects.ts`, `executableCandidates` checks `process.env.ANTIGRAVITY_IDE_EXEC_PATH`, cached `~/.agy-ide-path`, and all candidate locations to guarantee the IDE relaunches reliably every time.

---

## Revision Entry #015: Multi-Question Support, Late-Card Re-Awakening, 401 Re-Pairing & EPIPE Guard

* **Date:** 2026-10-23
* **Severity:** High (Multi-question truncation, silent late-response discarding, auth loop on network handover, and daemon termination on IDE close)
* **Status:** Resolved & Verified

### 1. What Error Was Caused?
1. **Multi-Question Truncation:** In `ApprovalCards.tsx`, `QuestionCard` previously only inspected `questions[0]`. When an agent asked multiple questions in a single turn, questions 2+ were hidden from mobile view and omitted from the formatted answer string.
2. **Paused Question Responses Discarded:** When an approval or question card timed out at 120s, it transitioned into paused state (`isPaused: true`). When the developer finally answered from their phone, `QuestionCard` sent `{ decision: 'deny', reason: 'User responded from mobile companion: ...' }`. Because `ws-gateway.ts` previously only dispatched continuation prompts if `decision === 'allow'`, any late answer submitted to a paused question card was silently dropped with zero agent wakeup.
3. **Infinite Reconnect Loop on 401 Unauthorized:** On mobile network handover (e.g., leaving home Wi-Fi onto cellular Tailscale), if a pairing token was expired or absent, WebSocket connections failed repeatedly with HTTP 401, leaving the app in a silent, endless reconnection loop with no user feedback.
4. **Daemon EPIPE Crashes:** When Antigravity IDE terminated or crashed during remote restart, daemon pipes connected to the IDE extension broke with `EPIPE`, terminating the companion daemon process and breaking remote connectivity.

### 2. Root Cause Analysis
1. `QuestionCard` had hardcoded `const qObj = questions[0]`, lacking array iteration, per-question selection state, and composite response formatting.
2. In `ws-gateway.ts:1221` and `:893`, `handleSendPrompt` was only called if `msg.payload.decision === 'allow'`.
3. In `App.tsx`, `socket.onclose` immediately scheduled a reconnect without testing endpoint authorization status via `/api/policy`.
4. In `bin/agy-companion.ts`, unhandled pipe errors (`EPIPE`) on `stdout`/`stderr` brought down the Node process.

### 3. How Was It Solved?
1. **Multi-Question Rendering & State (`ApprovalCards.tsx`):**
   - Refactored `QuestionCard` to support arbitrary question arrays (`req.toolCall.args.questions`).
   - Added per-question selection map (`Record<number, number[]>`) and write-in text map (`Record<number, string>`).
   - Renders each question with distinct headers, number badges, and inline "Other" input.
   - Formats compound responses (`1. <Q1>: <Ans1>\n2. <Q2>: <Ans2>`) on submission.
2. **Late-Response Agent Re-Awakening (`ws-gateway.ts`):**
   - In both `client:respond_approval` and `/api/hook/approval`, if `pausedReq` exists and decision is `deny` with reason/answer, dispatches `handleSendPrompt(answerPrompt, pausedReq.workspacePath)` so the agent wakes up and receives late answers seamlessly.
3. **401 Unauthorized Detection & Re-Pairing Alert (`App.tsx`):**
   - Added `authError` state in `App.tsx`.
   - On WebSocket close or error, executes lightweight check to `/api/policy` with auth headers. If 401, sets `authError = true` and stops infinite reconnect thrashing.
   - Displays a clean, 1:1 Antigravity dark neutral "Pairing Required (401)" banner with "Open Pairing Settings" 1-tap action.
4. **Daemon EPIPE & Broken Pipe Protection (`agy-companion.ts` & `daemon-manager.ts`):**
   - Added `EPIPE` exception suppression listeners on `process.stdout`, `process.stderr`, and top-level process error handlers in `agy-companion.ts`.
   - Spawns daemon with `detached: true` and `unref()` in `daemon-manager.ts` so IDE lifecycle events never crash the background supervisor.

---

## Revision Entry #016: Strict 3-Mode Routing & Zero-Modal Desktop Leakage in Remote Mode

* **Date:** 2026-10-23
* **Severity:** Critical (Core companion architectural violation: desktop modal popups appearing on PC IDE while developer was in Remote/Auto mode)
* **Status:** Resolved & Verified

### 1. What Error Was Caused?
1. **Desktop Modals Appeared on PC IDE Despite `[📱 Remote Active]`:** While the user was in Remote Mode (and Auto Mode) testing outside away from their PC, mutating tools and shell queries (`git log -n 5 -p ...`) triggered native desktop modal dialogs inside the Antigravity PC IDE with 4 numbered options. The prompts were completely unreachable from the user's mobile phone.
2. **Auto Mode Presence Flipping to Desk:** When set to `auto`, the system ran a presence heuristic (`getAutoModeResolution()`) querying port 4040. If the phone WebSocket connection slept, it resolved to `'desk'` and immediately wrote `{"decision": "force_ask"}` to IDE stdout, dumping a modal prompt on the desktop PC.
3. **Approval Card Blackout on Phone Disconnect/Reconnect:** When an approval timed out after 120s and transitioned to `isPaused: true`, `getPendingRequests()` in `ipc-server.ts` only returned active `pendingRequests`. When the phone reconnected, `server:hello` filtered `workspaceManager.pendingApprovals` against active requests, completely wiping the paused card from the phone UI.
4. **Desktop Modal Leakage on Daemon Unreachable:** In `interceptor.js`, `postToDaemon` fallback handlers for `req.on('error')`, `req.on('timeout')`, and top-level `catch(err)` unconditionally resolved or output `{ decision: 'force_ask' }`, directly triggering PC desktop modals whenever the daemon was restarting or port 4041 was closed.

### 2. Root Cause Analysis
1. **Flawed Mental Model of the 3 Modes:**
   - Previous code treated "Auto Mode" as dynamic presence detection that guessed whether a phone was connected and flipped to "Desk" when `connectedPhoneCount === 0`.
   - In truth, the user's foundational product specification is:
     - **Remote Mode:** ALL tool approval cards and questions route to the **Phone Companion**. ZERO popups on the PC IDE.
     - **Desk Mode:** ALL tool approvals prompt on the **PC IDE Desktop** (`force_ask`). Mobile receives zero prompts.
     - **Auto Mode:** **Proceeds without asking** (`decision: 'allow'`). Completely autonomous with zero popups anywhere. If a forced question arises (`ask_question`), prompts on whichever device is selected (Remote = Phone, Desk = PC IDE).
2. **Unconditional `force_ask` Fallback in `interceptor.js`:**
   - Every failure path (daemon offline, network timeout, JSON parse error, uncaught exception) resolved `{ decision: 'force_ask' }`.
   - When written to stdout, Antigravity IDE interpreted `force_ask` as an order to pop a modal dialog on the desktop screen.
3. **Strict Equality in Read-Only Git Matching:**
   - Line 149 had `cmd.trim() === 'git log'`. Commands with arguments like `git log -n 5 -p .agents/interceptor.js` did not match and fell through to tool interception.

### 3. How Was It Solved?
1. **Bulletproof 3-Mode Interceptor (`.agents/interceptor.js`, `install-hook.ts`, `hook-manager.ts`):**
   - **Auto Mode (`auto` / `autonomous`):** Tools automatically proceed without asking (`decision: 'allow'`). For forced asks (`ask_question`), inspects `~/.agy-companion-target` and routes to Phone (if Remote target) or PC IDE (if Desk target). Completely removed `getAutoModeResolution()`.
   - **Desk Mode (`desk`):** Emits `{"decision": "force_ask"}` directly to IDE. Zero phone routing.
   - **Remote Mode (`remote`):** Routes exclusively to mobile companion via `postToDaemon` (port 4041).
   - **Zero PC Modal Leakage:** In Remote Mode, `interceptor.js` intercept-guards every output. If `result.decision` is `'ask'` or `'force_ask'`, or if daemon errors/times out, it emits `decision: 'deny', reason: 'Execution Paused: Waiting for mobile companion approval. Session frozen safely without desktop popup.'`. Under NO circumstance does `interceptor.js` ever output `force_ask` or `ask` in Remote Mode.
2. **Persistent Paused Requests in `HookIpcServer` (`ipc-server.ts`):**
   - `getPendingRequests()` now returns `[...pendingRequests, ...pausedRequests]`. When a mobile client connects or reconnects, paused requests remain in the workspace state and render immediately on mobile.
   - On 120s timeout, port 4041 always transitions to paused state and returns `decision: 'deny'` without desktop fallback.
3. **Target Device Tracking on Mode Switch (`ws-gateway.ts` & `daemon-manager.ts`):**
   - When switching to `remote` or `desk`, writes to `~/.agy-companion-target`. If the user later selects `Auto`, forced questions route accurately to the user's preferred device.
4. **Safe Read-Only Git Matching:**
   - Prefix matching for `git log`, `git diff`, `git status`, and `git branch` guarantees background inspections never stall execution.

---

## Revision Entry #017: Mobile-Approved Tools Leaking Secondary Confirmation Dialog to Desktop PC IDE

* **Date:** 2026-10-23
* **Severity:** Critical (Double-prompt defect: developer approved mutating tool commands on phone companion, but secondary confirmation modal STILL appeared on desktop Antigravity IDE)
* **Status:** Resolved & Verified

### 1. What Error Was Caused?
During live companion testing in Remote Mode, when mutating shell tools (`run_command`) were invoked:
1. An approval card correctly appeared on the developer's mobile phone companion.
2. The developer tapped **Allow** on mobile.
3. The hook resumed, but a secondary, native modal dialog STILL popped up on the desktop Antigravity IDE screen (e.g., *"Allow running command: node -e ... 1. Yes, allow this time 2. Yes, and always allow..."*).
4. The developer was forced to approve once on mobile and once on desktop PC, defeating the purpose of remote control.

### 2. Root Cause Analysis
1. **Misconception of `permissionOverrides` on `decision: 'allow'`:**
   - In Antigravity's PreToolUse hook architecture, `permissionOverrides` (e.g. `['command(npm test)']`) is designed **exclusively for `decision: 'ask'`** to populate the desktop user's whitelist choices (`2. Yes, and always allow '...' in this conversation`).
   - `interceptor.js`, `ipc-server.ts`, `install-hook.ts`, and `hook-manager.ts` were erroneously appending `permissionOverrides: [command(${cmd})]` to `{ decision: 'allow' }`.
   - When Antigravity IDE received a hook response containing `permissionOverrides`, its security engine treated the presence of unconfirmed override specs (especially commands containing nested parentheses like `toISOString()`, quotes, and complex flags) as requiring desktop user confirmation, popping the native desktop modal.
2. **Pure `{ decision: 'allow' }` Contract:**
   - In Antigravity IDE, when a tool is approved (by policy, auto-allow, or mobile companion approval), the exact contract is `{ decision: 'allow' }` without any `permissionOverrides`.
   - Non-command tools (e.g., `view_file`, `list_dir`, `replace_file_content`) never had command strings and thus passed empty overrides (`[]`), which is why file edits never triggered desktop popups. Only `run_command` was affected because `cmd` was populated.

### 3. How Was It Solved?
1. **Eliminated `permissionOverrides` from All `allow` Outputs:**
   - In [.agents/interceptor.js](file:///d:/CODE/antigravity%20compainion/.agents/interceptor.js):
     - Auto-allowed git inspection tools now output pure `{ decision: 'allow' }`.
     - Auto mode execution outputs pure `{ decision: 'allow' }`.
     - Mobile companion approved tools (`result.decision === 'allow'`) now output pure `{ decision: 'allow' }`.
   - In [ipc-server.ts](file:///d:/CODE/antigravity%20compainion/packages/cli/src/hooks/ipc-server.ts):
     - `resolveApproval` resolves `{ decision: 'allow' }` directly without attaching `permissionOverrides`.
   - In [install-hook.ts](file:///d:/CODE/antigravity%20compainion/packages/cli/src/commands/install-hook.ts) and [hook-manager.ts](file:///d:/CODE/antigravity%20compainion/packages/vscode-extension/src/hook-manager.ts):
     - Synchronized the hook template to ensure all future hook installations produce pure `{ decision: 'allow' }`.
2. **End-to-End Verification:**
   - Tested read-only git queries (`git status --short`, `git log -n 1 --oneline`) -> executed immediately with zero desktop dialogs.
   - Tested package builds (`npm run build`, `npx cap copy android`) -> completed cleanly with zero desktop dialogs.

---

## Revision Entry #017: Remote IDE Restart Relaunch Failure & Duplicate Session Home Screen Trap

* **Date:** 2026-10-24
* **Severity:** Critical (Remote IDE Restart closed IDE processes but never reopened them, or previously reopened two separate sessions on an empty home screen)
* **Status:** Resolved & Verified

### 1. What Error Was Caused?
When the developer triggered **Restart IDE** from the mobile companion app or settings:
1. Under previous revisions, the IDE processes were killed, but when reopened, two separate sessions appeared: one normal and one secondary window opening to a blank home screen without the project loaded.
2. Under subsequent attempts, the IDE processes were terminated completely, but never relaunched at all, forcing manual desktop intervention.

### 2. Root Cause Analysis
1. **Broken Batch CLI Spawning (`antigravity-ide.cmd` with spaces):**
   - In `recent-projects.ts`, `executableCandidates` previously replaced native `.exe` binaries with sibling `bin/*.cmd` scripts (`antigravity-ide.cmd`).
   - When spawning `.cmd` scripts with `shell: true` in Node.js on Windows, `cmd.exe` concatenated `cmd.exe /c C:\Users\anshul\AppData\Local\Programs\Antigravity IDE\bin\antigravity-ide.cmd`.
   - Because `Antigravity IDE` has a space, `cmd.exe` split the path and errored with: `'C:\Users\anshul\AppData\Local\Programs\Antigravity' is not recognized as an internal or external command`.
   - Because `stdio: 'ignore'` was set, this fatal error was silenced and the process exited with code 1 immediately without ever starting the GUI.
   - Furthermore, `~/.agy-ide-path` cached the `.cmd` file, locking all future relaunch attempts into the same failure.
2. **Duplicate Empty Session from `--new-window`:**
   - In `launchRecentProject`, `spawn(exe, ['--new-window', norm])` explicitly passed `--new-window`.
   - In VS Code / Antigravity IDE, `--new-window` instructs the window manager to bypass session restoration and launch an unassociated empty window or home screen. When the user then clicked the desktop icon, the normal session restored, creating two conflicting sessions.
3. **Dual Dispatch Collision in `App.tsx`:**
   - In `App.tsx`, `handleRestartIde` (and `handleCloseIde`) dispatched `wsRef.current.send(...)` AND immediately executed `fetch('/api/host/restart-ide')` in parallel.
   - Both requests arrived at the daemon within milliseconds, causing race conditions in process termination and double spawns.
4. **Brutal Force-Kill (`taskkill /F`) Preventing State Persistence:**
   - `closeProvider` previously ran `taskkill /IM "Antigravity IDE.exe" /F` unconditionally.
   - `/F` bypassed window message loops (`WM_CLOSE`), preventing Electron from flushing its workspace state (`state.vscdb`), open editor tabs, and window layout to disk before termination.

### 3. How Was It Solved?
1. **Prioritized Native GUI Binary (`Antigravity IDE.exe`):**
   - In [recent-projects.ts](file:///d:/CODE/antigravity%20compainion/packages/cli/src/session/recent-projects.ts), native GUI `.exe` executables (`Antigravity IDE.exe`) are prioritized first over `.cmd` scripts.
   - Native `.exe` is spawned via `CreateProcessW` (`shell: false`), completely eliminating `cmd.exe` space-splitting bugs.
   - If a `.cmd` is ever needed as a last resort, it is wrapped with explicit cmd quoting (`process.env.ComSpec`, `windowsVerbatimArguments: true`).
   - Sanitized `~/.agy-ide-path` to cache only valid native `.exe` paths.
2. **Removed `--new-window` on Restart & Proper CWD:**
   - When restarting or launching the active session, args are passed directly as `[norm]` (or `[]` if none).
   - VS Code restores the exact workspace, open tabs, and window layout naturally, 1:1 with double clicking the desktop shortcut.
   - Set child process `cwd` to `norm` or `path.dirname(exe)`.
3. **Graceful `WM_CLOSE` Followed by Polling & Cooldown:**
   - In [provider-lifecycle.ts](file:///d:/CODE/antigravity%20compainion/packages/cli/src/provider/provider-lifecycle.ts), `closeProvider(providerId, false)` sends a graceful `taskkill /IM "${proc}"` (without `/F`), allowing Windows to post `WM_CLOSE`.
   - The IDE flushes its SQLite database and closes cleanly within ~1-3s.
   - `restartProvider` polls process exit for up to 5s, falling back to `/F /T` only if a hung child process remains.
   - Added a 2.5s cooldown for OS named pipes and Electron single-instance socket locks to release.
4. **Concurrency Guard & Mutual Exclusion:**
   - In [provider-lifecycle.ts](file:///d:/CODE/antigravity%20compainion/packages/cli/src/provider/provider-lifecycle.ts), added `isRestarting` concurrency lock.
   - In [App.tsx](file:///d:/CODE/antigravity%20compainion/packages/web/src/App.tsx), `handleRestartIde` and `handleCloseIde` use `else` for HTTP fetch fallback, preventing duplicate dispatch.
   - In [ws-gateway.ts](file:///d:/CODE/antigravity%20compainion/packages/cli/src/server/ws-gateway.ts), `resolveTargetWorkspace` safely resolves the active workspace without falling back to internal daemon subfolders.
