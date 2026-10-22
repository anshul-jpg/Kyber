# Antigravity Companion: Master Design Specification (DESIGN.md)

> **Status:** Active Baseline  
> **Source of Truth:** 1:1 Antigravity IDE UI/UX Fidelity for Mobile Touch Ergonomics  
> **Design Doctrine:** Linear / Raycast / Antigravity Dark Theme Craftsmanship  
> **Core Constraint:** **Zero Emojis Policy.** No emojis for UI icons or actions. Use pure SVGs (Lucide) and VS Code typographic badges.

---

## 1. Core Visual Tokens & Palette

Derived directly from the official Antigravity IDE dark theme (VS Code / Antigravity base):

> **Strict Color Rule:** Antigravity IDE uses neutral dark obsidian/charcoal surfaces, **NOT** dark navy or slate blue (`#090d16`, `#0f172a`, `#182238` are forbidden). All companion interfaces (mobile app, VS Code extension sidebar, notifications) must adhere strictly to these native IDE tokens.

| Token | Hex / Value | Usage |
| :--- | :--- | :--- |
| **Canvas / Window Base** | `#181818` | Native Antigravity IDE window, chat background, sidebar background. |
| **Surface / Card Container** | `#1f1f1f` - `#212121` | Approval cards, file diff containers, panels, status cards. |
| **Elevated / Input Container** | `#262626` - `#282828` | User prompt bubble, terminal command blocks, code boxes. |
| **Hover / Active State** | `#2d2d2d` - `#333333` | Selected radio options (e.g. `1 Yes, allow this time`), button hover. |
| **Border Hairline** | `rgba(255, 255, 255, 0.08)` / `#2e2e2e` | 1px crisp separation on all cards, dividers, and headers. |
| **Border Focus / Glow** | `rgba(0, 122, 204, 0.4)` | Active focus on input box and interactive fields. |
| **Primary Accent** | `#0078d4` / `#007acc` | Antigravity IDE signature blue. Used for `Submit` button, `Accept all`, and primary actions. |
| **Primary Accent Hover** | `#0062a3` / `#0284c7` | Pressed/hover state for primary blue buttons. |
| **Notification Dot** | `#0098ff` | Solid blue dot on artifact / media icon when active. |
| **Text Primary** | `#cccccc` / `#ffffff` | High-contrast readable typography. |
| **Text Secondary / Muted** | `#858585` / `#9e9e9e` | File paths, line counts, timestamps, empty state captions. |
| **Git Additions / Success** | `#4ade80` / `#89d185` | Additions badge `+`, additions count (`+685`), live indicator. |
| **Git Modified / Warning** | `#f59e0b` / `#cca700` | Modified status `M`, modified icon `[•]`, approval notices. |
| **Git Deletions / Danger** | `#f87171` / `#f14c4c` | Deletions `-`, line removals (`-134`), emergency stop, reject buttons. |

---

## 2. Typography & Density

- **UI Sans:** `Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
  - Header Titles: `13.5px` - `14px`, weight `600`
  - Body / Prompts: `13px` / `13.5px`, line-height `1.55`, letter-spacing `-0.01em`
  - File Paths / Meta: `11px`, weight `400`, color `#858585`
- **Code & Monospace:** `'Geist Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace`
  - File Badges: `11px`, padding `1px 4px`, font-weight `600`
  - Additions/Deletions: `11px`, green `+184`, red `-0`

---

## 3. Screen & Component Architecture (1:1 with Screenshots)

### 3.1 Home Screen (1:1 with Screenshot 3)

When starting or when no chat is open:

```
                            [ Stylized A Glyph ]
                              Antigravity IDE

                         [ FolderIcon  Open Folder ]
                        [ CopyIcon  Clone Repository ]

Workspaces
  ┌────────────────────────────────────────────────────────────┐
  │ Lorem Ipsum Project                                        │
  │ C:\Projects\User\Workspace                                 │
  ├────────────────────────────────────────────────────────────┤
  │ Consectetur Elit                                           │
  │ C:\Projects\User\Codebase                                  │
  └────────────────────────────────────────────────────────────┘

Core Extensions
  ┌────────────────────────────────────────────────────────────┐
  │ [G]  Lorem Ipsum Extension Service              [Download] │
  │      Lorem ipsum dolor sit amet for IDE functions.         │
  └────────────────────────────────────────────────────────────┘
```

- **Branding:** Stylized white Antigravity `A` glyph + `Antigravity IDE` title.
- **Primary Action:** `[ Open Folder ]` solid blue `#007acc`, white text.
- **Secondary Action:** `[ Clone Repository ]` dark button `#252525`, border `#383838`.
- **Workspaces Section:** Muted section label `Workspaces`. Clean list of known repos with bold title and monospace path. Tapping opens that workspace directly.

---

### 3.2 File Explorer Tree (1:1 with Screenshot 2)

Collapsible VS Code / Antigravity hierarchical file tree:

```
Explorer                                                     [...]
⌄ antigravity companion
  ⌄ .agents
    > skills
      companion-mode
      hook_debug.log
      {} hooks.json                                [gold braces]
      JS interceptor.js                            [yellow badge]
  > hooks
  > node_modules
  ⌄ packages
    ⌄ cli
      > dist
      ⌄ src
        ⌄ server
          TS ws-gateway.ts                            M [orange]
        TS index.ts
        {} package.json
  M↓ AGENTS.md                                     [blue badge]
  M↓ DESIGN.md                                     U [green]
```

- **File Badges (No Emojis):**
  - `TS` (Cyan blue `#3178c6`) for TypeScript files.
  - `JS` (Yellow `#f7df1e`) for JavaScript files.
  - `{}` (Gold `#cca700`) for JSON configurations.
  - `M↓` (Blue `#38bdf8`) for Markdown files.
- **Git Status Markers (Right Aligned):**
  - `M` in orange for Modified files.
  - `U` in green for Untracked / New files.
  - `D` in red for Deleted files.
- **Active Row Highlight:** Deep blue-slate `#283548`.

---

### 3.3 "Files With Changes" & Accept/Reject All (1:1 with Screenshot 1)

Displayed above the input dock or in the changes modal:

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [←] [FileIcon] 5 Files With Changes        Reject all   [ Accept all ⌵ ] │
├──────────────────────────────────────────────────────────────────────────┤
│ [+]  +184 -0   DESIGN.md     d:\CODE\antigravity companion\DESIGN.md     │
│ [•]  +12 -2    index.ts      d:\CODE\antigravity companion\packages\...  │
│ [•]  +66 -0    ide-watcher   d:\CODE\antigravity companion\packages\...  │
│ [•]  +48 -0    ws-gateway    d:\CODE\antigravity companion\packages\...  │
│ [•]  +1405 -1016 App.tsx     d:\CODE\antigravity companion\packages\...  │
└──────────────────────────────────────────────────────────────────────────┘
```

- **Header Controls:**
  - Back arrow `←` + File Document icon + `5 Files With Changes`.
  - Right: `Reject all` (text button, muted `#858585`), `Accept all ⌵` (high-contrast pill button `#ffffff` text on `#282828`).
- **File Row Breakdown:**
  - Status badge:
    - `[+]` green square icon for new files.
    - `[•]` orange square icon for modified files.
  - Line delta: `+184` in green, `-0` in red.
  - File name: bold white `13px`.
  - Full file path: dimmed `#858585` `11px`.

---

### 3.4 The 4 Quick-Action Icons

Underneath agent turns and tool runs:

```
    [ FileText ]    [ Terminal ]    [ Image • ]    [ Globe ]
        Diff          Terminal       Artifact       Browser
```

- **No Emojis:** Strictly SVG outline icons (`FileText`, `Terminal`, `Image`, `Globe` from Lucide).
- **Blue Dot:** `#0098ff` solid dot on the `Image` icon when new artifacts/media were produced in the active turn.

---

### 3.5 Prompt Input Dock ("Just Like Home")

```
┌──────────────────────────────────────────────────────────────┐
│ Ask anything. @ to mention, / for actions                    │
│                                                              │
│ [+] [ Gemini 3.8 Flash Medium ⌃ ]  [⚠ MCP Error]     [Mic] [➔]│
└──────────────────────────────────────────────────────────────┘
```

- **Context Menu:** Triggered by `[+]`. Elevated `#252526` card with `Media`, `Mentions`, `Actions`.
- **Model Selector:** Pill showing active model name with chevron dropdown.
- **Microphone:** Web Speech recognition for voice notes (pulses blue when active).
- **Submit Button:** Blue `#007acc` circle with right arrow SVG.

---

## 4. Strict Anti-AI Slop Rules

1. **Zero Emojis:** All buttons and statuses use SVGs and typography.
2. **No Purple/Indigo/Navy Gradients or Blue Color Casts:** Maintain pure Antigravity neutral charcoal/obsidian surfaces (`#181818` / `#1f1f1f` / `#262626`). Do not use dark navy or slate blue backgrounds.
3. **No Toy Pill Buttons:** Buttons have 6px border-radius and crisp 1px borders.
4. **Thumb Zone Ergonomics:** All touch targets maintain 44px hitboxes for mobile comfort.
