# 🏁 KYBER: Master Checkpoint & Session State

> **Checkpoint Updated:** 2026-10-23 (KYBER Rebrand Complete: Kinetic Shift A.3 Geometric Mark, Gemini Multimodal Voice Notes, Live Workspace Crawler)  
> **Status:** Beta 1 Operational & Beta 2 Progression in Progress. See [ROADMAP.md](file:///d:/CODE/antigravity%20compainion/ROADMAP.md) for full vision and backlog.

---

## 1. Executive Summary: Architecture & Today's State

1. **Rebranding to KYBER (Locked & Deployed):**
   - Transformed identity to **KYBER** (Greek *κυβερνήτης* — helmsman, pilot, navigator).
   - Locked geometric mark: **Variation A.3 (The Kinetic Shift)** — two vertically offset diamond facets with a 3px tension slit (`[48.5,18 22,58 48.5,98]` and `[51.5,2 78,42 51.5,82]`) in stark monochrome (`#ffffff` and `#a1a1aa` on `#121213`).
   - Synced across Web (`KyberLogo`, `HomeScreen.tsx`, `index.html`), Android native launcher (`ic_launcher_background.xml`, `ic_launcher_foreground.xml`, `strings.xml`), VS Code extension (`media/icon.svg`, `package.json`), and CLI banner (`agy-companion.ts`).
   - Documented ground truth in [BRAND.md](file:///d:/CODE/antigravity%20compainion/BRAND.md).

2. **Phase 2.1 Native Audio Voice Notes (Gemini Multimodal Audio):**
   - Native audio recording in `PromptDock.tsx` with live audio waveform pulses and duration counter.
   - Attach previewable audio chips `[🎙️ Voice Note (0:14) ▶️ ✕]`.
   - Streaming raw audio to daemon $\rightarrow$ `.user_uploaded` $\rightarrow$ Gemini agent turn via `[Attached Media]: file:///...`.
   - Native dark audio player bubble in chat feed.

3. **Phase 2.2 Live Workspace Crawler & Multi-Window Switcher:**
   - Real-time directory crawler endpoint `/api/workspace/files` in `ws-gateway.ts` replacing static mock tree.
   - Dynamic expanding folder explorer in `ActionModals.tsx`.
   - Multi-window workspace switcher pill `[📁 <WorkspaceName> ▾]` in `Header.tsx` with live status dots and pending approval badges.

4. **Inverted Control Structure (Layer 4 Extension Host Master):**
   - Extension Host (`DaemonManager`) maintains persistent WebSocket connection to daemon (`ws://127.0.0.1:4040`).
   - Phone prompts forward directly across WebSocket and submit natively via `antigravity.sendPromptToAgentPanel`.
   - Standalone verification harness: `node scripts/test-flow.js`.

---

## 2. Active Machine Ports & Daemon Topology

| Port / Channel | Service | Role |
| :--- | :--- | :--- |
| **`4040`** | `ws-gateway.ts` (HTTP + WSS) | Serves React Web UI, WebSocket feed, health check, `/download/app.apk`, `/api/workspace/files`, and direct Extension Host prompt forwarding. |
| **`4041`** | `ipc-server.ts` (TCP Server) | Listens for hook executions from `.agents/interceptor.js`. Holds agent until mobile decision. |
| **Global CLI** | `~/.gemini/antigravity-ide/companion/bin/` | Permanent global CLI path accessible from any workspace. |
| **Global Mode**| `~/.agy-companion-mode` | Shared mode file (`desk` or `remote`). |
| **Auth Token** | `~/.agy-companion-token` | Persistent 32-character hex auth token shared between CLI daemon and VS Code extension. |

---

## 3. How to Reload Window Now

1. In Antigravity IDE, press `Ctrl+Shift+P`.
2. Type and select: `Developer: Reload Window`.
3. The sidebar will immediately draw the new high-craft Linear/Raycast UI:
   - Deep neutral obsidian canvas (`#121213` / `#181818`).
   - Clean 1-Click Master Setup card.
   - Dark-mode inverted QR code.
   - Segmented mode switcher.
   - Live connected daemon status.

---

## 4. Frontend Modular Architecture & Clean Project Directory

1. **Frontend Modularization (`packages/web/src/`):**
   - **Monolithic `App.tsx` eliminated:** Clean ~440-line composition root.
   - **Domain Component Breakdown (`packages/web/src/components/`):**
     - [`Header.tsx`](file:///d:/CODE/antigravity%20compainion/packages/web/src/components/Header.tsx): Top header bar, mode switchers, emergency stop, APK download, workspace switcher dropdown pill.
     - [`HomeScreen.tsx`](file:///d:/CODE/antigravity%20compainion/packages/web/src/components/HomeScreen.tsx): Minimal KYBER Kinetic Shift mark hero, Open Folder, Clone Repo, Workspace selector.
     - [`ChatFeed.tsx`](file:///d:/CODE/antigravity%20compainion/packages/web/src/components/ChatFeed.tsx): Streaming messages, collapsible thinking process accordions, tool step badges, native audio player bubble.
     - [`ApprovalCards.tsx`](file:///d:/CODE/antigravity%20compainion/packages/web/src/components/ApprovalCards.tsx): Tool approval cards with 1-tap Allow/Deny buttons, command previews, git changes badges, 4-tier dropdowns.
     - [`PromptDock.tsx`](file:///d:/CODE/antigravity%20compainion/packages/web/src/components/PromptDock.tsx): Fixed bottom input dock, multiline autogrow textarea, audio recording & voice note chips, photo attachment preview, voice dictation, queued prompt chips.
     - [`BottomStatusBar.tsx`](file:///d:/CODE/antigravity%20compainion/packages/web/src/components/BottomStatusBar.tsx): Fixed status bar with live mode indicator, settings trigger, and notification permission actions.
     - [`HistoryDrawer.tsx`](file:///d:/CODE/antigravity%20compainion/packages/web/src/components/HistoryDrawer.tsx): Slide-over drawer for past conversation sessions.
     - [`ActionModals.tsx`](file:///d:/CODE/antigravity%20compainion/packages/web/src/components/ActionModals.tsx): Multi-sheet modals for dynamic File Explorer (live crawler), Git Diff viewer, Terminal logs, Artifacts viewer.
     - [`SettingsModal.tsx`](file:///d:/CODE/antigravity%20compainion/packages/web/src/components/SettingsModal.tsx): Host, port, Tailscale / Cloudflare / Wi-Fi presets, and zero-config Pairing Ticket decode.
     - [`CommonUI.tsx`](file:///d:/CODE/antigravity%20compainion/packages/web/src/components/CommonUI.tsx): Reusable components (`triggerHaptic`, `CopyButton`, `MarkdownContent`, `KyberLogo`, `FileTypeBadge`).
2. **Monorepo Build Status:**
   - All 4 packages compiled and verified cleanly (`npm run build`).
