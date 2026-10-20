---
name: agy-companion
description: Universal setup and control for the Antigravity Mobile Companion daemon, hook installation, and Desk/Remote mode switching.
---

# Antigravity Companion Skill

Use this skill whenever the user asks to enable, configure, or control the Antigravity Mobile Companion in any project.

## 1. Quick Enable Command
When the user says:
- "enable companion in this project"
- "setup companion"
- "connect companion"

Run:
```powershell
node "d:\CODE\antigravity compainion\packages\cli\dist\bin\agy-companion.js" hook install .
```

This installs `.agents/hooks.json` and `.agents/interceptor.js` into the current project, connecting it to the universal Antigravity Companion system.

## 2. Global Companion Modes
The companion uses a single global mode file:
- **Location:** `~/.agy-companion-mode` (`C:\Users\anshul\.agy-companion-mode`)
- **Modes:**
  - `desk`: Tool approvals appear directly in the Antigravity IDE on the PC screen. Mobile phone does not ring or block.
  - `remote`: Tool approvals push exclusively to the phone companion (`http://<PC_IP>:4040`). Tapping **Allow** executes immediately on the PC with zero desktop clicks required.

## 3. Starting the Daemon
```powershell
node "d:\CODE\antigravity compainion\packages\cli\dist\bin\agy-companion.js"
```
Or with free worldwide Cloudflare Quick Tunnel:
```powershell
node "d:\CODE\antigravity compainion\packages\cli\dist\bin\agy-companion.js" --tunnel
```
