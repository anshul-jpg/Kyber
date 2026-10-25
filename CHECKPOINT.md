# 🏁 KYBER: Master Checkpoint & Session State

> **Checkpoint Updated:** 2026-10-25 (Release Candidate: Multi-Drive Code Roots, Level 3 Workspace View, VS Code Activity Bar Icon Fix, Android Launcher & Notification Mark, GitHub Actions CI/CD Pipeline Locked)  
> **Status:** Pre-Release / Private Testing Ready.

---

## 1. Executive Summary: What Was Accomplished & Current State

1. **Brand & Identity Fidelity (Zero AI-Slop & 1:1 Antigravity Aesthetics):**
   - **VS Code Activity Bar Icon:** Fixed alpha-mask grey square bug. Created `packages/vscode-extension/media/activitybar-icon.svg` (pure transparent silhouette with `currentColor`). Updated `packages/vscode-extension/package.json` to link it in activity bar and view containers.
   - **VS Code Extension Sidebar Header:** Updated `sidebar-template.ts` with crisp Kyber twin-crystal SVG logo mark.
   - **Android App Launcher Icon:** Replaced generic Capacitor icon with native vector drawable `ic_launcher_foreground.xml` in adaptive icon mipmaps (`ic_launcher.xml` and `ic_launcher_round.xml`).
   - **Android Foreground Service Notification:** Updated `CompanionForegroundService.java` to use `R.drawable.ic_launcher_foreground` as small icon.

2. **Automated External APK Distribution (GitHub Actions CI/CD):**
   - Configured `.github/workflows/build-apk.yml`.
   - On tag push (`v*`) or manual workflow dispatch:
     - Builds monorepo (`npm ci && npm run build`)
     - Syncs web bundle to Capacitor (`npx cap copy android`)
     - Compiles Android Debug APK (`./gradlew assembleDebug`)
     - Renames to `kyber-companion.apk`
     - Publishes as a downloadable GitHub Release asset so external testers can download directly without building locally.

3. **Multi-Drive Code Roots & Workspace Management:**
   - Implemented `CodeRootsManager` in `packages/cli/src/session/code-roots.ts`:
     - Allows registering multiple root directories across drives (e.g. `C:\`, `D:\`).
     - Dynamic project creation and discovery under allowed roots (`/api/workspace/roots`, `/api/workspace/create`).
     - Strict path containment checks preventing path traversal attacks.
     - Added comprehensive unit tests in `packages/cli/src/hooks/code-roots.test.ts` (passing 100%).

4. **Level 3 Unified Workspace View & Mobile Experience:**
   - Combined editor tabs and directory explorer into `packages/web/src/components/WorkspaceView.tsx`.
   - Live open editor tabs synchronized from VS Code extension host (`vscode.window.tabGroups.all`).
   - Tap-to-switch tabs directly focuses the file in desktop Antigravity IDE.
   - Directory explorer with file preview modal and syntax highlighting.
   - Added mobile screen wake lock utility in `packages/web/src/utils/screenLock.ts`.
   - Handled IDE interactive system questions (`ask_question`) in `packages/web/src/components/IdeSystemDialogModal.tsx`.

5. **Cleaned Git Hygiene & Test Verification:**
   - Updated `.gitignore` to prevent committing runtime mode states (`.agy-companion-mode`, `.agy-companion-roots.json`, local `*.apk` binaries).
   - Removed temporary scratch files.
   - All tests passing: 12/12 passing across protocol and cli packages (`npm test`).
   - Monorepo build 100% clean across all 4 workspaces (`npm run build`).

---

## 2. Active Machine Ports & Topology

| Port / Channel | Service | Role |
| :--- | :--- | :--- |
| **`4040`** | `ws-gateway.ts` + `http-api.ts` (HTTP + WSS) | Serves React Web UI, WebSocket feed, health check, `/download/app.apk`, `/api/workspace/files`, `/api/workspace/file/content`, `/api/session/artifacts`, `/api/workspace/roots`, `/api/workspace/create`, and extension prompt forwarding. |
| **`4041`** | `ipc-server.ts` (TCP Server) | Listens for hook executions from `.agents/interceptor.js`. Holds agent PreToolUse until mobile or desk decision. |
| **Global CLI** | `~/.gemini/antigravity-ide/companion/bin/` | Permanent global CLI path accessible from any workspace. |
| **Global Mode**| `~/.agy-companion-mode` | Shared mode authority file (`desk` or `remote`). |
| **Auth Token** | `~/.agy-companion-token` | Persistent 32-character hex auth token shared between CLI daemon and VS Code extension. |

---

## 3. Friends & Multi-PC Setup Checklist

When setting up on another developer's PC:
1. `git clone <private-repo-url>`
2. `npm install`
3. `npm run build`
4. Copy `packages/vscode-extension` to `$HOME/.antigravity-ide/extensions/antigravity.antigravity-companion-0.1.0`
5. In project: `node packages/cli/dist/bin/agy-companion.js hook install .`
6. Click "Start Daemon" in Antigravity IDE sidebar. Scan QR code from mobile web or install `kyber-companion.apk` from GitHub Releases.
