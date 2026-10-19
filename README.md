# 🚀 Antigravity Companion

> **"Cloud Gaming, but for Cloud Coding"**  
> A mobile remote companion and permission gate for Google Antigravity CLI (`agy`).

---

## ⚡ What It Solves

1. **Remote Execution Blocking**: When leaving your PC to let Antigravity code, it often halts asking for permission (*Allow, Deny, Intercept*). This companion intercepts tool calls and pushes them straight to your phone with instant action buttons.
2. **Context Preservation**: Seamless session resumption and tracking across power cycles or reboots.
3. **Multi-Project Management**: Monitor multiple active repositories and switch between them from your phone.

---

## 🛠️ Quickstart

### 1. Start the Companion Daemon
From this directory, run:
```bash
npm start
```
- Your terminal will display an **ASCII QR Code** and the local URL (e.g. `http://192.168.1.37:4040/`).
- Scan the QR code with your phone camera (on the same Wi-Fi) or open the URL in your mobile browser.
- Tap **Add to Home Screen** for an instant fullscreen companion app.

### 2. Enable in Antigravity CLI
To route Antigravity's tool approvals through your phone companion:
1. Copy or link `hooks/hooks.json` to your project's `.agents/hooks.json` (or globally in `~/.gemini/config/hooks.json`).
2. Run `agy` as you normally do. When a sensitive tool executes, your phone will buzz with an actionable prompt!

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
