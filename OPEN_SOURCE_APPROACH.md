# Open-Source Approach: Community Distribution & Scalable Architecture

## 1. Objective
Transform the personal tool into a zero-friction, open-source project that any developer can install and use in under 60 seconds without hosting costs or cloud configuration.

---

## 2. Core Pillars of Open-Source Success

### A. The 60-Second Onboarding Rule
- No developer wants to create Firebase accounts, configure Cloudflare DNS tokens, or install Android Studio just to try a tool.
- Target experience:
  ```bash
  npx agy-companion
  ```
- The terminal displays a live ASCII QR code.
- Scanning the QR code with any smartphone camera opens the companion web client immediately, pre-paired and secured.

### B. Zero-Cost Infrastructure (P2P & Local First)
- Centralized relay servers create ongoing hosting bills for the maintainer.
- Instead, use:
  1. **Local LAN Mode (Default):** Phone and PC connect directly over local WiFi.
  2. **WebRTC DataChannels (Remote):** Peer-to-peer end-to-end encrypted connection using free public STUN servers (e.g., `stun.l.google.com:19302`) for NAT traversal.
  3. **Zero-Config Tunnels:** Optional built-in tunnel support (Pinggy, LocalTunnel, or Cloudflare Quick Tunnels) without user signup.

### C. Unified Client Architecture
- Single frontend codebase (React + Vite + Tailwind CSS):
  - **Instant Web Companion / PWA:** Hosted statically (or served directly from the PC daemon). Accessible via phone browser with "Add to Home Screen".
  - **Prebuilt Android APK:** Compiled automatically via GitHub Actions (Capacitor) and published on GitHub Releases. Users who want background push notifications simply download the APK.

---

## 3. Open-Source Monorepo Structure

```text
antigravity-companion/
├── packages/
│   ├── cli/                     # The `agy-companion` CLI package (Node.js/TS)
│   │   ├── bin/agy-companion.js # Entry point (`npx agy-companion`)
│   │   ├── src/
│   │   │   ├── bridge/          # agy process manager (stream-json driver)
│   │   │   ├── hooks/           # PreToolUse gatekeeper script
│   │   │   ├── pairing/         # Terminal QR code & crypto pairing token
│   │   │   └── server/          # Local HTTP/WS & WebRTC signaling
│   │   └── package.json
│   │
│   ├── web/                     # Mobile-first Web & PWA Client
│   │   ├── src/
│   │   │   ├── components/      # Chat, ToolApprovalModal, WorkspaceDrawer
│   │   │   ├── services/        # WebRTC & WebSocket client
│   │   │   └── App.tsx
│   │   ├── capacitor.config.ts  # Android APK export configuration
│   │   └── package.json
│   │
│   └── protocol/                # Shared TypeScript types & JSON schemas
│       ├── src/types.ts         # Message contracts (ToolCall, Approval, Turn)
│       └── package.json
│
├── .github/
│   └── workflows/
│       ├── build-apk.yml        # Automatically builds APK on git release tag
│       └── npm-publish.yml      # Publishes CLI to npm registry
│
├── LICENSE                      # Apache-2.0 or MIT
└── README.md                    # Visual demo GIF, 1-line install guide
```

---

## 4. Security & Privacy Guarantees
- **End-to-End Encryption (E2EE):** Terminal generates an ephemeral cryptographic keypair on startup. The public key is embedded inside the QR code. All WebRTC traffic is authenticated and encrypted.
- **Explicit Gating:** The companion daemon operates in a safe read-only proxy state until explicitly paired with the phone.
- **No Third-Party Cloud Data Storage:** Code, prompts, terminal outputs, and credentials never touch a remote third-party database.
