# Antigravity Companion: Master Brand Identity & Design System (`BRAND.md`)

> **Status:** Production Ground Truth  
> **Aesthetic Archetype:** Linear / Raycast / Antigravity IDE Craftsmanship  
> **Brand Mission:** The Autonomous Pocket Supervisor — decoupling local AI agent orchestration from the desktop desk into a pocket-sized, tactile supervision loop.  
> **Governing Constraint:** Zero "AI Slop". Strict obsidian neutral elevation, hairline 1px geometry, zero emojis, zero purple/navy gradients, and thumb-zone ergonomics.

---

## 1. Brand Essence & Positioning

| Dimension | Specification |
| :--- | :--- |
| **Product Category** | Autonomous Remote Coding Companion & Tool Gatekeeper |
| **User Persona** | Senior engineers, systems architects, and technical founders pair-programming with autonomous agents while away from desk (walking, commuting, cooking, resting). |
| **Tone of Voice** | Clinical, reliable, quiet, high-density, tactile. Never conversational or chatty; it is a precision instrument like a terminal or flight computer. |
| **Multi-Provider Evolution** | Originates as the native Antigravity IDE companion; engineered with open connectors to orchestrate **Codex** and **Claude Code** under the unified companion mesh. |

---

## 2. Visual Mark & Iconography

### 2.1 The Geometric Glyph: "The Kinetic Shift" (Variation A.3)
The brand mark represents the **Helmsman Needle** (*κυβερνήτης* — the root of cybernetics) in active navigation. Two complementary diamond facets are vertically offset, breaking static symmetry to generate forward kinetic lift and guidance.

```
                    ▲ (right facet elevated)
                  / |
                 /  |
        ▲       /   |
       / \     /    |
      /   \    \    |
     /     \    \   |
     \     /     \  |
      \   /       \ |
       \ /          ▼
        ▼ (left facet anchored)
```

- **Vector Definition (100x100 viewBox):**
  - Left Staggered Facet: `<polygon points="48.5,18 22,58 48.5,98" fill="#ffffff" />`
  - Right Elevated Facet: `<polygon points="51.5,2 78,42 51.5,82" fill="#a1a1aa" />`
  - Split Channel: 3px precision negative-space hairline cut.
  - Stagger Offset: 16px vertical displacement creating forward aerodynamic momentum.
- **Coloration:** Stark White (`#ffffff`) and Platinum Titanium (`#a1a1aa` / `#b0b8b4`) on Deep Obsidian Charcoal (`#101211` / `#121213`).
- **Forbidden:** No 3D shading, no gradients, no circular crosshairs, no letters, no emojis, no AI-generated slop. Pure flat 2D vector geometry (2 polygons only).

### 2.2 System Iconography Rules
- **Pure SVGs:** Strictly Lucide outline icons (`stroke-width: 1.75px`, `size: 15px-18px`).
- **Zero Emojis Policy:** Never use emojis in UI buttons, tabs, modal headers, or notification actions. Emojis render inconsistently across Android OEMs and break the high-craft developer interface feel.
- **Language Badges:** Monospace typographic pills with native syntax colors:
  - `TS` Cyan (`#3178c6` on `rgba(49, 120, 198, 0.15)`)
  - `JS` Yellow (`#f7df1e` on `rgba(247, 223, 30, 0.15)`)
  - `{}` Gold (`#cca700` on `rgba(204, 167, 0, 0.15)`)
  - `M↓` Blue (`#38bdf8` on `rgba(56, 189, 248, 0.15)`)

---

## 3. Master Color Palette & Surface Elevation

The companion uses an **Obsidian Charcoal** neutral scale derived directly from Antigravity IDE.  
**Strict Rule:** No dark navy, no slate blue, and no indigo color casts (`#0f172a`, `#182238` are forbidden).

### 3.1 Neutral Surface Tokens
| Token | Hex | Role & Application |
| :--- | :--- | :--- |
| `--surface-canvas` | `#121212` / `#141414` | Global root viewport background, mobile safe-area backing. |
| `--surface-window` | `#181818` | Main active panel, chat stream feed, sidebar background. |
| `--surface-card` | `#1e1e1e` – `#212121` | Tool approval cards, file diff containers, pairing hub card. |
| `--surface-input` | `#262626` – `#282828` | User prompt dock, terminal monospace containers, chips. |
| `--surface-selection`| `#2d2d2d` – `#333333` | Active segmented controls, selected approval options. |
| `--border-hairline` | `rgba(255, 255, 255, 0.08)` | Crisp 1px separation on all cards, headers, and dividers. |
| `--border-focus` | `rgba(0, 122, 204, 0.5)` | Active input field focus glow and highlighted review states. |

### 3.2 Semantic & Brand Accents
| Accent | Hex | Role |
| :--- | :--- | :--- |
| **Antigravity Blue** | `#0078d4` / `#007acc` | Primary brand accent, submit buttons, pairing tabs, active indicators. |
| **Live Emerald** | `#10b981` | Online status dot, `[Allow]` approval button, `+` Git additions. |
| **Pending Amber** | `#f59e0b` / `#fbbf24` | Approval required gate, timeout warning, `M` Git modified. |
| **Destructive Rose** | `#ef4444` / `#f87171` | `[Deny]` action, emergency stop button, `-` Git deletions. |
| **Autonomous Violet**| `#a855f7` | Fully autonomous mode indicator badge and auto-run state. |

---

## 4. Typography Hierarchy

| Level | Font Family | Size | Weight | Line Height | Tracking |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Display / Home** | `Inter`, -apple-system | `18px` – `20px` | `700` | `1.3` | `-0.02em` |
| **Header Title** | `Inter`, -apple-system | `13.5px` – `14px` | `600` | `1.4` | `-0.01em` |
| **Body / Dialogue** | `Inter`, -apple-system | `13.5px` – `14.5px` | `400` | `1.6` | `normal` |
| **Captions / Meta** | `Inter`, -apple-system | `11px` – `11.5px` | `500` | `1.4` | `+0.01em` |
| **Code / Terminal** | `'Geist Mono', Consolas`| `12px` – `12.5px` | `500` | `1.5` | `normal` |
| **Micro Badges** | `'Geist Mono', Consolas`| `10px` – `10.5px` | `600` | `1.0` | `+0.04em` |

---

## 5. Motion, Physics & Loading Ergonomics

### 5.1 Touch Interaction & Physics
- **Tactile Button Press:** Every interactive button and segmented control must feel physical:
  ```css
  button:active {
    transform: scale(0.98);
    transition: transform 60ms cubic-bezier(0.2, 0, 0, 1);
  }
  ```
- **Thumb Zone Optimization:** All primary actions (Send, Mic, Allow, Deny, Mode Toggle) sit strictly within the bottom **40% of the screen** with minimum `44px` tap hitboxes.
- **Scroll Inertia:** Viewport uses native hardware acceleration:
  ```css
  overscroll-behavior-y: contain;
  -webkit-overflow-scrolling: touch;
  ```

### 5.2 Loading & Streaming States (Zero Generic Spinners)
- **Agent Thinking:** When the agent is reasoning or inspecting tools:
  - Do not render a spinning circle.
  - Render an obsidian monospace progress beam with a subtle rhythmic opacity pulse (`duration: 1.4s` ease-in-out):
    ```
    Thinking  [ █ █ █ ░ ░ ░ ]  1.8s
    ```
- **Turn Complete:** Instant snappy transition from active pulse to clean static Markdown render.
- **Audio Voice Recording:** High-frequency pulsating microphone halo (`#0078d4` glow spreading from `0px` to `8px`).

---

## 6. Haptic Feedback Signature

| Event | Vibration Pattern (ms) | Sensation |
| :--- | :--- | :--- |
| **Tool Approval Arrives** | `[100, 50, 100]` | Urgent dual-buzz; breaks through pocket fabric. |
| **Button / Radio Tap** | `[20]` | Subtle mechanical micro-click. |
| **Decision Dispatched** | `[30, 40]` | Crisp two-step confirmation. |
| **Emergency Stop** | `[80]` | Heavy physical halt thud. |
| **Agent Turn Finished** | `[40]` | Gentle completion notification. |

---

## 7. Android System Integration & Notifications

- **Foreground Notification (ID 9001):**
  - **Title:** Category badge (`[Antigravity IDE]` / `[Tool Approval]` / `[Thinking]`).
  - **Body:** Sanitize raw Markdown/JSON into clean 1-line developer sentences (max 100 chars).
  - **Action Buttons:** Direct native intent buttons `[✓ ALLOW]` and `[✕ DENY]` bypassing app unlock.
- **Android Launcher Icon:**
  - Background: Solid `#141414` charcoal disk.
  - Foreground: Centered `#0078d4` and `#ffffff` levitating apex mark with 15% safe-padding.

---

## 8. Master Brand Checklist for New Components

Before shipping any new screen, modal, or component:
- [ ] Uses obsidian `#141414` / `#181818` / `#1e1e1e` (No navy/slate casts).
- [ ] 1px hairline borders (`rgba(255, 255, 255, 0.08)`).
- [ ] Zero emojis (pure Lucide SVGs).
- [ ] 44px minimum tap targets.
- [ ] Tactile compression on tap (`active:scale-[0.98]`).
- [ ] Monospace typography for file paths, commands, and line numbers (`Geist Mono`).
- [ ] Haptic feedback hooked into user interactions.
