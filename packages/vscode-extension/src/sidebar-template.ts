import { ApprovalRequest, QuickAction, ExecutionPolicy } from '@agy-companion/protocol';
import { DaemonStatus, CompanionMode, PairingEndpoint, LogLine, MeshStatus } from './types';

export interface SidebarRenderContext {
  status: DaemonStatus;
  mode: CompanionMode;
  effectiveMode: 'remote' | 'desk';
  endpoints: PairingEndpoint[];
  approvals: ApprovalRequest[];
  meshStatus: MeshStatus;
  quickActions: QuickAction[];
  logs: LogLine[];
  hasCfToken: boolean;
  isHookInstalled: boolean;
  isGlobalHookInstalled?: boolean;
  activeEndpointType: 'local' | 'tailscale' | 'cloudflare';
  executionPolicy?: ExecutionPolicy;
  qrSvg: string;
}

function escapeHtml(str: string | undefined | null): string {
  return (str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderSidebarHtml(ctx: SidebarRenderContext): string {
  const {
    status,
    mode,
    effectiveMode,
    endpoints,
    approvals,
    meshStatus,
    quickActions,
    logs,
    hasCfToken,
    isHookInstalled,
    isGlobalHookInstalled = false,
    activeEndpointType,
    executionPolicy = 'always_proceed',
    qrSvg,
  } = ctx;

  let currentEndpoint = endpoints.find(e => e.type === activeEndpointType);
  if (!currentEndpoint && endpoints.length > 0) {
    currentEndpoint = endpoints[0];
  }

  const isLive = status === 'running';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' https:; script-src 'unsafe-inline' https:; img-src data: https: http:;">
  <title>Antigravity Companion</title>
  <style>
    :root {
      --bg-canvas: #181818;
      --bg-surface: #1f1f1f;
      --bg-elevated: #252525;
      --bg-interactive: #2b2b2b;
      --bg-hover: #333333;
      --border-hairline: rgba(255, 255, 255, 0.08);
      --border-subtle: rgba(255, 255, 255, 0.14);
      --border-focus: rgba(0, 122, 204, 0.4);
      --accent-blue: #0078d4;
      --accent-blue-hover: #0062a3;
      --accent-emerald: #4ade80;
      --accent-amber: #f59e0b;
      --accent-rose: #f87171;
      --accent-cyan: #38bdf8;
      --text-primary: #cccccc;
      --text-secondary: #9e9e9e;
      --text-muted: #858585;
      --font-sans: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', system-ui, sans-serif;
      --font-mono: 'Geist Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background-color: var(--bg-canvas);
      color: var(--text-primary);
      font-family: var(--font-sans);
      font-size: 11.5px;
      line-height: 1.45;
      padding: 10px;
      overflow-x: hidden;
    }

    button {
      font-family: inherit;
      cursor: pointer;
      border: 1px solid var(--border-hairline);
      border-radius: 6px;
      transition: background 0.12s ease, border-color 0.12s ease, transform 0.08s ease;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      user-select: none;
    }
    button:active {
      transform: scale(0.98);
    }

    .card {
      background: var(--bg-surface);
      border: 1px solid var(--border-hairline);
      border-radius: 8px;
      padding: 10px;
      margin-bottom: 9px;
    }

    .card-title {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--text-muted);
      margin-bottom: 7px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    /* Top Brand Header */
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 10px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--border-hairline);
    }
    .brand-title {
      display: flex;
      align-items: center;
      gap: 7px;
      font-size: 12px;
      font-weight: 600;
      color: var(--text-primary);
      letter-spacing: -0.01em;
    }

    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 10px;
      font-weight: 600;
      padding: 2px 7px;
      border-radius: 5px;
      border: 1px solid var(--border-hairline);
      background: var(--bg-elevated);
      color: var(--text-secondary);
    }
    .status-badge.running {
      color: var(--accent-emerald);
      border-color: rgba(16, 185, 129, 0.25);
    }
    .status-badge.starting {
      color: var(--accent-amber);
    }

    /* Master 1-Click Setup Hero Card */
    .hero-card {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      padding: 10px;
      margin-bottom: 9px;
    }
    .hero-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }
    .hero-icon-box {
      width: 24px;
      height: 24px;
      background: var(--bg-interactive);
      border: 1px solid var(--border-hairline);
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--text-primary);
      flex-shrink: 0;
    }
    .hero-title {
      font-size: 11.5px;
      font-weight: 600;
      color: var(--text-primary);
    }
    .hero-sub {
      font-size: 10px;
      color: var(--text-secondary);
    }
    .btn-hero {
      width: 100%;
      background: var(--accent-blue);
      color: #ffffff;
      border: 1px solid rgba(255, 255, 255, 0.12);
      padding: 7px 10px;
      font-size: 11px;
      font-weight: 600;
      border-radius: 6px;
    }
    .btn-hero:hover {
      background: var(--accent-blue-hover);
      border-color: var(--border-focus);
    }

    .linked-banner {
      background: var(--bg-surface);
      border: 1px solid var(--border-hairline);
      border-radius: 8px;
      padding: 7px 10px;
      margin-bottom: 9px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .linked-left {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      color: var(--text-secondary);
    }
    .linked-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--accent-emerald);
    }

    /* Live Mesh & Network Indicators Matrix */
    .mesh-matrix {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 5px;
      margin-bottom: 9px;
    }
    .mesh-item {
      background: var(--bg-surface);
      border: 1px solid var(--border-hairline);
      border-radius: 6px;
      padding: 5px 7px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .mesh-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--text-muted);
      flex-shrink: 0;
    }
    .mesh-dot.active {
      background: var(--accent-emerald);
    }
    .mesh-col {
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .mesh-label {
      font-size: 9px;
      color: var(--text-muted);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .mesh-sub {
      font-size: 10px;
      font-weight: 600;
      color: var(--text-secondary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* 3-Way Mode Switcher (Linear/Raycast Segmented Control) */
    .mode-switch {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 3px;
      background: var(--bg-surface);
      padding: 3px;
      border-radius: 7px;
      border: 1px solid var(--border-hairline);
      margin-bottom: 9px;
    }
    .mode-btn {
      background: transparent;
      border: 1px solid transparent;
      color: var(--text-muted);
      padding: 4px 3px;
      font-size: 10.5px;
      font-weight: 600;
      border-radius: 5px;
    }
    .mode-btn:hover {
      color: var(--text-secondary);
    }
    .mode-btn.active {
      background: var(--bg-hover);
      color: var(--text-primary);
      border-color: var(--border-subtle);
    }

    /* Approvals Gate Alert */
    .approval-gate {
      background: #181512;
      border: 1px solid rgba(245, 158, 11, 0.35);
      border-radius: 7px;
      padding: 9px;
      margin-bottom: 9px;
    }
    .approval-cmd {
      font-family: var(--font-mono);
      font-size: 10px;
      background: #141414;
      border: 1px solid var(--border-hairline);
      padding: 5px 6px;
      border-radius: 4px;
      color: #cccccc;
      margin: 5px 0;
      word-break: break-all;
    }
    .approval-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 5px;
      margin-top: 5px;
    }
    .btn-approve {
      background: #064e3b;
      color: #a7f3d0;
      border: 1px solid rgba(16, 185, 129, 0.3);
      padding: 5px;
      font-weight: 600;
      font-size: 10.5px;
    }
    .btn-approve:hover {
      background: #065f46;
    }
    .btn-deny {
      background: #450a0a;
      color: #fecdd3;
      border: 1px solid rgba(244, 63, 94, 0.3);
      padding: 5px;
      font-weight: 600;
      font-size: 10.5px;
    }
    .btn-deny:hover {
      background: #7f1d1d;
    }

    /* Pairing Hub & QR */
    .qr-container {
      background: #141414;
      border: 1px solid var(--border-hairline);
      border-radius: 6px;
      padding: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 6px auto;
      width: 148px;
      height: 148px;
    }
    .qr-container svg {
      width: 128px;
      height: 128px;
      display: block;
    }

    /* Endpoint Selector Tabs */
    .endpoint-tabs {
      display: flex;
      gap: 3px;
      background: var(--bg-elevated);
      padding: 2px;
      border-radius: 6px;
      border: 1px solid var(--border-hairline);
      margin-bottom: 6px;
    }
    .endpoint-tab {
      flex: 1;
      background: transparent;
      border: 1px solid transparent;
      color: var(--text-muted);
      font-size: 10px;
      font-weight: 600;
      padding: 4px 2px;
      border-radius: 4px;
    }
    .endpoint-tab.active {
      background: var(--bg-hover);
      color: var(--text-primary);
      border-color: var(--border-subtle);
    }

    /* Terminal Log Feed */
    .terminal-box {
      background: #141414;
      border: 1px solid var(--border-hairline);
      border-radius: 6px;
      padding: 6px 8px;
      font-family: var(--font-mono);
      font-size: 10px;
      line-height: 1.4;
      height: 110px;
      overflow-y: auto;
      color: var(--text-secondary);
    }
    .term-line {
      display: flex;
      gap: 6px;
      margin-bottom: 2px;
      word-break: break-all;
    }
    .term-time {
      color: var(--text-muted);
      flex-shrink: 0;
      font-size: 9px;
    }
    .term-line.ipc .term-text { color: var(--accent-amber); }
    .term-line.ws .term-text { color: var(--accent-cyan); }
    .term-line.error .term-text { color: var(--accent-rose); }
    .term-line.warn .term-text { color: #fde047; }
    .term-empty {
      color: var(--text-muted);
      font-style: italic;
      text-align: center;
      padding: 20px 0;
    }

    /* Quick Actions Grid */
    .quick-actions-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 5px;
    }
    .btn-action {
      background: var(--bg-elevated);
      color: var(--text-secondary);
      border: 1px solid var(--border-hairline);
      padding: 5px 6px;
      font-size: 10.5px;
      font-weight: 500;
      border-radius: 5px;
      justify-content: flex-start;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .btn-action:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
      border-color: var(--border-subtle);
    }

    /* Standard Tactile Buttons */
    .btn-primary {
      background: var(--accent-blue);
      color: #ffffff;
      border: 1px solid rgba(255, 255, 255, 0.12);
      padding: 5px 8px;
      font-size: 11px;
      font-weight: 600;
      width: 100%;
    }
    .btn-primary:hover {
      background: var(--accent-blue-hover);
      border-color: var(--border-focus);
    }
    .btn-secondary {
      background: var(--bg-elevated);
      color: var(--text-secondary);
      border: 1px solid var(--border-hairline);
      padding: 5px 8px;
      font-size: 10.5px;
      width: 100%;
    }
    .btn-secondary:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
      border-color: var(--border-subtle);
    }
    .btn-xs {
      background: transparent;
      border: 1px solid var(--border-hairline);
      color: var(--text-muted);
      font-size: 9px;
      padding: 1px 5px;
      border-radius: 4px;
    }
    .btn-xs:hover {
      color: var(--text-primary);
      border-color: var(--border-subtle);
    }
  </style>
</head>
<body>

  <!-- Brand Header -->
  <div class="header">
    <div class="brand-title">
      <svg width="15" height="15" viewBox="0 0 100 100" fill="none">
        <polygon points="48.5,18 22,58 48.5,98" fill="#ffffff" />
        <polygon points="51.5,2 78,42 51.5,82" fill="#a1a1aa" />
      </svg>
      <span>Antigravity Companion</span>
    </div>
    <div class="status-badge ${status}">
      <span>${isLive ? '● Live' : (status === 'starting' ? '⟳ Starting' : '○ Stopped')}</span>
    </div>
  </div>

  <!-- Master 1-Click Setup Hero Card -->
  ${!isHookInstalled || !isLive ? `
    <div class="hero-card">
      <div class="hero-header">
        <div class="hero-icon-box">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
        </div>
        <div>
          <div class="hero-title">${!isHookInstalled ? '1-Click Master Setup' : 'Start Companion Daemon'}</div>
          <div class="hero-sub">${!isHookInstalled ? 'Workspace hook unlinked' : 'Hook linked • Daemon stopped'}</div>
        </div>
      </div>
      <button class="btn-hero" data-cmd="masterStartAndLink" onclick="sendMsg('masterStartAndLink')">
        ${!isHookInstalled ? 'Link Current Project & Start' : 'Start Companion Daemon'}
      </button>
    </div>
  ` : `
    <div class="linked-banner">
      <div class="linked-left">
        <span class="linked-dot"></span>
        <span>Active & Linked to Workspace</span>
      </div>
      <button class="btn-xs" style="color: var(--accent-rose);" data-cmd="disableHook" onclick="sendMsg('disableHook')" title="Unlink companion hook from this workspace">Unlink</button>
    </div>
  `}

  <!-- Universal Global Hook Indicator -->
  <div class="linked-banner" style="margin-top: -3px; margin-bottom: 9px; border-color: ${isGlobalHookInstalled ? 'rgba(16, 185, 129, 0.2)' : 'var(--border-hairline)'};">
    <div class="linked-left">
      <span class="linked-dot" style="background: ${isGlobalHookInstalled ? 'var(--accent-emerald)' : 'var(--text-muted)'}; ${isGlobalHookInstalled ? 'box-shadow: 0 0 6px rgba(16, 185, 129, 0.4);' : ''}"></span>
      <span style="font-size: 11px;">${isGlobalHookInstalled ? 'Global Hook Active (All Workspaces)' : 'Global Hook Inactive'}</span>
    </div>
    <button class="btn-xs" style="color: ${isGlobalHookInstalled ? 'var(--accent-rose)' : 'var(--accent-blue)'};" data-cmd="${isGlobalHookInstalled ? 'disableGlobalHook' : 'enableGlobalHook'}" onclick="sendMsg('${isGlobalHookInstalled ? 'disableGlobalHook' : 'enableGlobalHook'}')" title="${isGlobalHookInstalled ? 'Disable global hook' : 'Enable companion hook for all projects'}">
      ${isGlobalHookInstalled ? 'Unlink' : 'Enable Everywhere'}
    </button>
  </div>

  <!-- Live Mesh & Network Indicators Matrix -->
  <div class="mesh-matrix">
    <div class="mesh-item" title="${meshStatus.tailscaleMeshed ? (meshStatus.tailscaleIp || 'Tailscale Mesh Connected') : 'Tailscale VPN offline'}">
      <span class="mesh-dot ${meshStatus.tailscaleMeshed ? 'active' : ''}"></span>
      <div class="mesh-col">
        <span class="mesh-label">Tailscale</span>
        <span class="mesh-sub">${meshStatus.tailscaleMeshed ? 'Meshed' : 'Offline'}</span>
      </div>
    </div>
    <div class="mesh-item" title="${meshStatus.cloudflareRouting ? (meshStatus.cloudflareUrl || 'Cloudflare Tunnel Active') : 'Cloudflare Tunnel inactive'}">
      <span class="mesh-dot ${meshStatus.cloudflareRouting ? 'active' : ''}"></span>
      <div class="mesh-col">
        <span class="mesh-label">Cloudflare</span>
        <span class="mesh-sub">${meshStatus.cloudflareRouting ? 'Routing' : 'Standby'}</span>
      </div>
    </div>
    <div class="mesh-item" title="${meshStatus.phoneConnected ? `${meshStatus.phoneCount} phone device(s) connected` : 'No phone companion active'}">
      <span class="mesh-dot ${meshStatus.phoneConnected ? 'active' : ''}"></span>
      <div class="mesh-col">
        <span class="mesh-label">Phone</span>
        <span class="mesh-sub">${meshStatus.phoneConnected ? `${meshStatus.phoneCount} Device${meshStatus.phoneCount > 1 ? 's' : ''}` : 'Waiting'}</span>
      </div>
    </div>
  </div>

  <!-- Mode Switcher (Segmented Control) -->
  <div class="mode-switch">
    <button class="mode-btn ${mode === 'remote' ? 'active' : ''}" onclick="sendMsg('setMode', { mode: 'remote' })">
      Remote (Phone)
    </button>
    <button class="mode-btn ${mode === 'desk' ? 'active' : ''}" onclick="sendMsg('setMode', { mode: 'desk' })">
      Desk (PC)
    </button>
    <button class="mode-btn ${mode === 'auto' ? 'active' : ''}" onclick="sendMsg('setMode', { mode: 'auto' })">
      Auto
    </button>
  </div>

  <!-- Execution Policy (Autonomous vs Force Ask) -->
  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-bottom: 8px;">
    <button class="mode-btn ${executionPolicy === 'always_proceed' ? 'active' : ''}" style="${executionPolicy === 'always_proceed' ? 'background: #0078d4; color: #ffffff;' : 'background: rgba(255,255,255,0.03);'}" onclick="sendMsg('setExecutionPolicy', { policy: 'always_proceed' })">
      ⚡ Autonomous
    </button>
    <button class="mode-btn ${executionPolicy === 'force_ask' ? 'active' : ''}" style="${executionPolicy === 'force_ask' ? 'background: #f59e0b; color: #000000; font-weight: 600;' : 'background: rgba(255,255,255,0.03);'}" onclick="sendMsg('setExecutionPolicy', { policy: 'force_ask' })">
      🛡️ Force Ask
    </button>
  </div>

  <!-- Pending Approvals Alert (if any) -->
  ${approvals.length > 0 ? `
    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; padding: 0 2px;">
      <span style="font-size: 10.5px; font-weight: 600; color: #fbbf24; letter-spacing: 0.02em;">
        Pending Approvals (${approvals.length})
      </span>
      <button class="btn-secondary" style="font-size: 9.5px; padding: 2px 7px; border-radius: 4px; background: rgba(255,255,255,0.06); border: 1px solid var(--border-subtle); color: var(--text-secondary); cursor: pointer;" onclick="sendMsg('clearApprovals')">
        Clear All
      </button>
    </div>
    ${approvals.map(app => `
      <div class="approval-gate">
        <div style="font-weight: 600; color: #fbbf24; font-size: 10.5px;">
          Tool Approval Required: ${escapeHtml(app.toolCall.name)}
        </div>
        <div class="approval-cmd">${escapeHtml(app.toolCall.args?.CommandLine || JSON.stringify(app.toolCall.args))}</div>
        <div class="approval-actions">
          <button class="btn-approve" onclick="sendMsg('resolveApproval', { requestId: '${app.id}', decision: 'allow' })">
            ✓ Allow
          </button>
          <button class="btn-deny" onclick="sendMsg('resolveApproval', { requestId: '${app.id}', decision: 'deny' })">
            ✕ Deny
          </button>
        </div>
      </div>
    `).join('')}
  ` : ''}

  <!-- Pairing Hub -->
  <div class="card">
    <div class="card-title">
      <span>Mobile Pairing Hub</span>
      ${isLive ? '<span style="color: var(--accent-emerald); font-size: 9.5px;">Ready</span>' : ''}
    </div>

    ${isLive && currentEndpoint ? `
      <div class="endpoint-tabs">
        <button class="endpoint-tab ${activeEndpointType === 'local' ? 'active' : ''}" onclick="sendMsg('selectEndpoint', { endpointType: 'local' })">Local Wi-Fi</button>
        <button class="endpoint-tab ${activeEndpointType === 'tailscale' ? 'active' : ''}" onclick="sendMsg('selectEndpoint', { endpointType: 'tailscale' })">Tailscale</button>
        <button class="endpoint-tab ${activeEndpointType === 'cloudflare' ? 'active' : ''}" onclick="sendMsg('selectEndpoint', { endpointType: 'cloudflare' })">Cloudflare</button>
      </div>

      <div class="qr-container">
        ${qrSvg}
      </div>

      <div style="display: flex; flex-direction: column; gap: 4px; margin-top: 6px;">
        <button class="btn-secondary" onclick="sendMsg('copyText', { text: '${currentEndpoint.ticket}', label: 'Pairing Ticket' })">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          Copy Pairing Ticket
        </button>
        <button class="btn-secondary" onclick="sendMsg('copyText', { text: '${currentEndpoint.url}', label: 'Companion URL' })">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
          Copy Direct URL
        </button>
      </div>

      <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border-subtle); display: flex; flex-direction: column; gap: 5px;">
        <button class="btn-primary" style="display: flex; align-items: center; justify-content: center; gap: 6px; font-weight: 600;" onclick="sendMsg('openUrl', { url: 'http://127.0.0.1:4040/download/app.apk' })">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Download Android APK
        </button>
        <button class="btn-secondary" style="font-size: 10px;" onclick="sendMsg('openUrl', { url: 'https://github.com/anshul-jpg/Kyber/releases' })">
          View Releases on GitHub
        </button>
      </div>
    ` : `
      <div style="text-align: center; padding: 12px 0; color: var(--text-muted);">
        <p style="margin-bottom: 8px;">Daemon is currently stopped.</p>
        <button class="btn-primary" onclick="sendMsg('masterStartAndLink')">Start & Link Workspace</button>
      </div>
    `}
  </div>

  <!-- Quick Action Templates -->
  ${quickActions.length > 0 ? `
    <div class="card">
      <div class="card-title">
        <span>Quick Action Templates</span>
        <span style="font-size: 9px; color: var(--text-muted);">1-Tap Exec</span>
      </div>
      <div class="quick-actions-grid">
        ${quickActions.map(qa => `
          <button class="btn-action" title="${escapeHtml(qa.command)}" onclick="sendMsg('runQuickAction', { command: '${escapeHtml(qa.command)}', label: '${escapeHtml(qa.label)}' })">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            <span>${escapeHtml(qa.label)}</span>
          </button>
        `).join('')}
      </div>
    </div>
  ` : ''}

  <!-- Live Mini-Terminal Log Stream -->
  <div class="card">
    <div class="card-title">
      <span>Daemon Log Stream</span>
      <button class="btn-xs" onclick="sendMsg('clearLogs')">Clear</button>
    </div>
    <div class="terminal-box" id="terminalBox">
      ${logs.length > 0 ? logs.map(l => `
        <div class="term-line ${l.level}">
          <span class="term-time">${new Date(l.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
          <span class="term-text">${escapeHtml(l.text)}</span>
        </div>
      `).join('') : '<div class="term-empty">Waiting for daemon event stream...</div>'}
    </div>
  </div>

  <!-- Service Controls & Security Secrets -->
  <div class="card">
    <div class="card-title">
      <span>Service Controls</span>
    </div>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 5px; margin-bottom: 6px;">
      ${isLive ? `
        <button class="btn-secondary" onclick="sendMsg('restartDaemon')">Restart</button>
        <button class="btn-secondary" style="color: var(--accent-rose);" onclick="sendMsg('stopDaemon')">Stop</button>
      ` : `
        <button class="btn-primary" style="grid-column: span 2;" onclick="sendMsg('masterStartAndLink')">Master Start</button>
      `}
    </div>

    <div style="display: flex; flex-direction: column; gap: 4px;">
      <button class="btn-secondary" onclick="sendMsg('promptCloudflareToken')">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        ${hasCfToken ? 'Cloudflare Secret (Configured)' : 'Set Cloudflare Token (Keychain)'}
      </button>
      <button class="btn-secondary" onclick="sendMsg('openSettings')">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        Configure Ports & Rules
      </button>
      <button class="btn-secondary" onclick="sendMsg('restartExtensionHost')" title="Restarts only the extension host process in ~1s. Preserves all open editor tabs, cursor states, and active chat context.">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
        Hot-Reload Extension (Keep Context)
      </button>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    function sendMsg(command, payload) {
      vscode.postMessage({ command, ...(payload || {}) });
    }
    window.sendMsg = sendMsg;

    document.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-cmd]');
      if (btn) {
        var cmd = btn.getAttribute('data-cmd');
        var payload = {};
        var raw = btn.getAttribute('data-payload');
        if (raw) {
          try { payload = JSON.parse(raw); } catch (e) {}
        }
        sendMsg(cmd, payload);
      }
    });

    const tBox = document.getElementById('terminalBox');
    if (tBox) {
      tBox.scrollTop = tBox.scrollHeight;
    }
    window.addEventListener('message', event => {
      const msg = event.data;
      if (msg && msg.command === 'updateLogs' && Array.isArray(msg.logs)) {
        const box = document.getElementById('terminalBox');
        if (box) {
          if (msg.logs.length === 0) {
            box.innerHTML = '<div class="term-empty">Waiting for daemon event stream...</div>';
          } else {
            box.innerHTML = msg.logs.map(l => {
              const d = new Date(l.timestamp);
              const time = d.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
              const safeText = String(l.text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
              return '<div class="term-line ' + (l.level || 'info') + '"><span class="term-time">' + time + '</span><span class="term-text">' + safeText + '</span></div>';
            }).join('');
          }
          box.scrollTop = box.scrollHeight;
        }
      }
    });
  </script>
</body>
</html>`;
}
