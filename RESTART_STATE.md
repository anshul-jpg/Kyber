# Antigravity IDE Restart & Lifecycle State Ledger

> **Notice:** This document is automatically referenced to verify host IDE restart cycles, process IDs, and startup logs without needing to parse long chat transcripts.

---

## 1. Verified Working Executable Configuration
* **IDE Application Name:** `Antigravity IDE`
* **Native Executable Path:** `C:\Users\anshul\AppData\Local\Programs\Antigravity IDE\Antigravity IDE.exe`
* **CLI Wrapper:** `C:\Users\anshul\AppData\Local\Programs\Antigravity IDE\bin\antigravity-ide.cmd`
* **Spawn Working Directory:** Project Root (`d:\CODE\antigravity compainion`)
* **Process Image Matcher:** `Antigravity IDE.exe`, `Antigravity.exe`

---

## 2. Restart Execution Pipeline (5-Step Lifecycle)
1. **Step 1 (Kill Process Tree):** `taskkill /F /T /IM "Antigravity IDE.exe"` terminates parent and all sub-processes (GPU, crashpad, extension host, sandbox).
2. **Step 2 (Active Polling Loop):** Script polls `tasklist /NH /FI "IMAGENAME eq Antigravity IDE.exe"` up to 15 times (~15s max) until 0 instances remain.
3. **Step 3 (Lock Settlement):** 1-second delay ensures Electron's `SingletonLock` and cache handles in `%APPDATA%` are released by Windows.
4. **Step 4 (Detached Silent Spawn):** Executes `start "" /D "<project_root>" "<exe_path>" "<project_root>"` with `windowsHide: true`.
5. **Step 5 (Post-Spawn Verification):** Queries `tasklist` 3 seconds after launch to verify new Antigravity IDE PIDs and logs them to disk.

---

## 3. Persistent Log File Locations
* **Global Host Log:** `C:\Users\anshul\.agy-restart.log`
* **Workspace Log:** `d:\CODE\antigravity compainion\.agents\restart.log`
* **Latest State JSON:** `d:\CODE\antigravity compainion\.agents\restart-state.json`

---

## 4. Automated Verification Test
* **Test Script:** [scripts/test-restart-logic.mjs](file:///d:/CODE/antigravity%20compainion/scripts/test-restart-logic.mjs)
* **Test Strategy:** Spawns mock target process, runs exact batch termination, verifies polling exit, validates spawn execution, and verifies all 5 logged steps.
* **Test Status:** **PASSED (100% verified)**
