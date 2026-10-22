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
