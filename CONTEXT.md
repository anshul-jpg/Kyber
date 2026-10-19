# Antigravity Companion: Project Context & Master Architecture

## 1. Vision & Core Value Proposition
**"Cloud Gaming, but for Cloud Coding."**
A remote companion system for the Google Antigravity CLI (`agy`) running on a local PC, operated remotely from a mobile phone (Android APK / Mobile Web).

---

## 2. Core Problems Being Solved

### A. Remote Execution Blocking
- **The Problem:** When Antigravity runs autonomously on a PC, it periodically halts to request permissions (e.g., `run_command`, file modifications) with prompts such as *Allow*, *Always Allow*, *Deny*, or *Intercept*. If the developer is away from their desk, the entire agent run blocks indefinitely.
- **The Solution:** An active interception layer catches pending permissions in real time and pushes them to the developer's mobile device with actionable buttons (*Allow*, *Deny*, *Intercept*). Responding on the phone immediately unblocks the PC.

### B. Context Preservation & Energy Waste
- **The Problem:** Developers leave high-power desktop rigs running 24/7 simply to keep active context windows and conversational state in memory.
- **The Solution:** Persistent state tracking using Antigravity's conversation identifiers and transcript ledgers (`transcript.jsonl`). Sessions can be frozen, persisted, and resumed across power outages, system sleep, or reboots using `agy --conversation <id>` or `--continue`.

### C. Multi-Project & Workspace Management
- **The Problem:** Modern developers juggle multiple repositories simultaneously.
- **The Solution:** A daemon-level workspace pool where each project operates as an isolated session. The mobile companion allows instant switching between projects from a unified drawer.

---

## 3. Native Antigravity Integration Primitives

Instead of brittle pseudo-terminal (PTY) emulation or ANSI text scraping, the system leverages native Antigravity CLI v1.3+ capabilities:

1. **Structured Streaming I/O (`stream-json`):**
   - Launched via `agy --input-format stream-json --output-format stream-json`.
   - Communication happens via newline-delimited JSON (NDJSON) over standard `stdin`/`stdout`.
   - Provides clean token streams, thought events, and tool execution lifecycles.

2. **Lifecycle Hooks (`hooks.json` - `PreToolUse`):**
   - Injected into `.agents/hooks.json` or global `~/.gemini/config/hooks.json`.
   - Whenever a tool is about to execute, the agent executes an external hook script.
   - The hook receives the `toolCall` payload on `stdin` and holds execution until receiving a permission decision (`allow` or `deny`) on `stdout`.

3. **Session Rehydration:**
   - Conversation resumption using `agy --conversation <id>` or `--continue`.
   - Conversation history parsed from `transcript.jsonl` located in `<appDataDir>\brain\<conversationId>\.system_generated\logs`.

---

## 4. System Components

```
┌─────────────────────────────────────────────────────────────┐
│                      Mobile Companion                       │
│    (Mobile-first React / Capacitor APK / PWA Client)        │
└──────────────┬──────────────────────────────▲───────────────┘
               │ Actions (Allow/Deny/Prompt)  │ State & Tokens
               ▼                              │
┌─────────────────────────────────────────────────────────────┐
│                 Remote Transport Gateway                    │
│        (Local LAN / WebSockets / Cloudflare Tunnel)         │
└──────────────┬──────────────────────────────▲───────────────┘
               │ Secure RPC & Events          │
               ▼                              │
┌─────────────────────────────────────────────────────────────┐
│                  PC Bridge Daemon (Node/TS)                 │
│  - Workspace Manager (tracks active directories)            │
│  - Session Engine (manages agy stream-json processes)       │
│  - Hook IPC Coordinator (holds & resolves PreToolUse)       │
│  - Local WebSocket Server                                   │
└──────────────▲──────────────────────────────▲───────────────┘
               │ NDJSON (stdin/stdout)        │ Hooks IPC
┌──────────────▼──────────────┐ ┌─────────────▼───────────────┐
│     Antigravity CLI (agy)   │ │      .agents/hooks.json     │
└─────────────────────────────┘ └─────────────────────────────┘
```

---

## 5. Machine Environment Snapshot (Host PC)
- **OS:** Windows 11 (PowerShell environment)
- **Node.js:** v24.16.0
- **npm:** 11.13.0
- **Python:** 3.12.10
- **Git:** 2.54.0.windows.1
- **Antigravity CLI (`agy`):** v1.3.0
- **Workspace Root:** `d:\CODE\antigravity compainion`
