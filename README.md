# 🚀 Antigravity Companion

> **"Cloud Gaming, but for Cloud Coding"**  
> A mobile remote companion and permission gate for Google Antigravity CLI (`agy`).

---

## ⚡ What It Solves

1. **Remote Execution Blocking**: When leaving your PC to let Antigravity code, it often halts asking for permission (*Allow, Deny, Intercept*). This companion intercepts tool calls and pushes them straight to your phone with instant action buttons.
2. **Context Preservation**: Seamless session resumption and tracking across power cycles or reboots.
3. **Multi-Project Management**: Monitor multiple active repositories and switch between them from your phone.

---

# ⚡ Installation Channels (Zero Friction)

Choose whichever method fits your workflow:

### Channel 1: Windows 1-Liner (Chris Titus Style)
Open PowerShell and run:
```powershell
irm https://raw.githubusercontent.com/anshul/kyber/master/install.ps1 | iex
```
*(Or locally: `powershell -ExecutionPolicy Bypass -File .\install.ps1`)*  
Installs the extension into your IDE, configures the global tool interceptor, and prepares everything automatically.

### Channel 2: 1-Click Extension (Antigravity & VS Code)
1. Download the latest self-contained [antigravity-companion-0.1.0.vsix](packages/vscode-extension/antigravity-companion-0.1.0.vsix) from GitHub Releases.
2. In Antigravity / VS Code: Open Extensions (`Ctrl+Shift+X`) -> `...` -> **Install from VSIX...**
3. The bundled daemon, web client, and APK runner boot automatically inside the IDE.

### Channel 3: Terminal / Headless (`npx` runner)
For SSH dev servers, Claude Code, Codex, or headless terminal users:
```bash
npx kyber-companion start
# or install universal hook
npx kyber-companion hook install -g
```

### 3. Test the Setup (Simulator)
In a separate terminal, run:
```bash
node scripts/test-approval.js
```
Watch your terminal and phone:
- Your phone will display the tool call (`npm run test:e2e`).
- Tap **Allow**, **Deny**, or **Intercept**.
- Watch the test script instantly receive your decision!

---

## 📂 Project Structure

```text
antigravity-companion/
├── CONTEXT.md               # Master technical context & Antigravity hooks docs
├── PERSONAL_APPROACH.md     # Personal dogfooding roadmap
├── OPEN_SOURCE_APPROACH.md  # Open-source community & distribution architecture
├── hooks/
│   ├── interceptor.js       # PreToolUse hook script (blocks & queries daemon)
│   └── hooks.json           # Hook configuration definition
├── packages/
│   ├── protocol/            # Shared TypeScript contracts & schemas
│   ├── cli/                 # PC Host Daemon & terminal QR code generator
│   └── web/                 # Mobile-first Web / PWA / Capacitor client
└── scripts/
    └── test-approval.js     # End-to-end hook simulator
```
