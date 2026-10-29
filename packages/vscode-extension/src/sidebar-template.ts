import { ApprovalRequest, QuickAction, ExecutionPolicy } from '@agy-companion/protocol';
import { DaemonStatus, CompanionMode, PairingEndpoint, LogLine, MeshStatus } from './types';

export interface SidebarRenderContext {
  status: DaemonStatus;
  mode: CompanionMode;
  effectiveMode: 'remote' | 'desk' | 'autonomous';
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
  isStartupServiceEnabled?: boolean;
  qrSvg: string;
  apkQrSvg?: string;
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
    isStartupServiceEnabled = false,
    qrSvg,
    apkQrSvg = '',
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
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' https:; script-src 'unsafe-inline' https:; font-src https: data:; img-src data: https: http:;">
  <title>KYBER</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-canvas: #0d0d0e;
      --bg-surface: #141416;
      --bg-elevated: #1a1a1d;
      --bg-interactive: #222226;
      --bg-hover: #2a2a2f;
      --border-hairline: rgba(255, 255, 255, 0.08);
      --border-subtle: rgba(255, 255, 255, 0.14);
      --border-focus: rgba(255, 255, 255, 0.3);
      --accent-emerald: #4ade80;
      --accent-amber: #f59e0b;
      --accent-rose: #f87171;
      --accent-cyan: #38bdf8;
      --text-primary: #ffffff;
      --text-secondary: #a1a1aa;
      --text-muted: #71717a;
      --font-sans: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', system-ui, sans-serif;
      --font-mono: 'Geist Mono', Consolas, 'Cascadia Code', monospace;
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

    details.card {
      padding: 8px 10px;
    }
    details.card > summary {
      cursor: pointer;
      user-select: none;
      list-style: none;
      display: flex;
      align-items: center;
      justify-content: space-between;
      outline: none;
    }
    details.card > summary::-webkit-details-marker {
      display: none;
    }
    details.card > summary::after {
      content: '›';
      font-size: 13px;
      font-family: var(--font-mono);
      transition: transform 0.15s ease;
      color: var(--text-muted);
    }
    details.card[open] > summary::after {
      transform: rotate(90deg);
    }
    details.card[open] > summary {
      margin-bottom: 8px;
    }

    .card-title {
      font-family: var(--font-mono);
      font-size: 9.5px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-muted);
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    /* Top Brand Header */
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
      padding-bottom: 10px;
      border-bottom: 1px solid var(--border-hairline);
    }
    .brand-title {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .brand-text {
      font-family: var(--font-mono);
      font-size: 14px;
      font-weight: 600;
      letter-spacing: -0.02em;
      color: #ffffff;
    }

    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 500;
      padding: 3px 9px;
      border-radius: 20px;
      border: 1px solid var(--border-hairline);
      background: var(--bg-surface);
      color: var(--text-muted);
    }
    .status-badge.running {
      color: var(--accent-emerald);
      border-color: rgba(74, 222, 128, 0.25);
      background: rgba(74, 222, 128, 0.08);
    }
    .status-badge.starting {
      color: var(--accent-amber);
      border-color: rgba(245, 158, 11, 0.25);
      background: rgba(245, 158, 11, 0.08);
    }
    .status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--text-muted);
    }
    .status-dot.live {
      background: var(--accent-emerald);
      box-shadow: 0 0 6px rgba(74, 222, 128, 0.6);
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
      font-family: var(--font-mono);
    }
    .btn-hero {
      width: 100%;
      background: #ffffff;
      color: #09090b;
      border: 1px solid #ffffff;
      padding: 7px 10px;
      font-size: 11px;
      font-weight: 600;
      font-family: var(--font-mono);
      border-radius: 6px;
    }
    .btn-hero:hover {
      background: #e4e4e7;
      border-color: #e4e4e7;
    }

    .linked-banner {
      background: var(--bg-surface);
      border: 1px solid var(--border-hairline);
      border-radius: 8px;
      padding: 7px 10px;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .linked-left {
      display: flex;
      align-items: center;
      gap: 7px;
      font-size: 11px;
      color: var(--text-secondary);
      font-family: var(--font-mono);
    }
    .linked-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--accent-emerald);
      box-shadow: 0 0 6px rgba(74, 222, 128, 0.4);
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
      padding: 6px 7px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .mesh-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #52525b;
      flex-shrink: 0;
    }
    .mesh-dot.active {
      background: var(--accent-emerald);
      box-shadow: 0 0 6px rgba(74, 222, 128, 0.4);
    }
    .mesh-col {
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .mesh-label {
      font-family: var(--font-mono);
      font-size: 8.5px;
      color: var(--text-muted);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .mesh-sub {
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 500;
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
      margin-bottom: 8px;
    }
    .mode-btn {
      background: transparent;
      border: 1px solid transparent;
      color: var(--text-muted);
      padding: 5px 3px;
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.02em;
      border-radius: 5px;
      transition: all 0.12s ease;
    }
    .mode-btn:hover {
      color: #ffffff;
    }
    .mode-btn.active {
      background: var(--bg-interactive);
      color: #ffffff;
      border-color: rgba(255, 255, 255, 0.18);
      box-shadow: 0 1px 3px rgba(0,0,0,0.4);
    }

    /* Execution Policy Switcher (Obsidian Segmented Control) */
    .policy-switch {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 5px;
      margin-bottom: 9px;
    }
    .policy-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 6px 8px;
      background: var(--bg-surface);
      border: 1px solid var(--border-hairline);
      border-radius: 6px;
      color: var(--text-muted);
      font-family: var(--font-mono);
      font-size: 10.5px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.12s ease;
    }
    .policy-btn:hover {
      color: #ffffff;
      border-color: var(--border-subtle);
    }
    .policy-btn.active {
      background: var(--bg-elevated);
      color: #ffffff;
      border-color: rgba(255, 255, 255, 0.22);
      font-weight: 600;
      box-shadow: 0 1px 3px rgba(0,0,0,0.3);
    }
    .policy-btn.active.force-ask {
      color: #fbbf24;
      border-color: rgba(251, 191, 36, 0.3);
      background: rgba(251, 191, 36, 0.06);
    }
    .policy-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #52525b;
    }
    .policy-dot.active {
      background: #ffffff;
      box-shadow: 0 0 6px rgba(255, 255, 255, 0.6);
    }
    .policy-dot.force-ask {
      background: #fbbf24;
      box-shadow: 0 0 6px rgba(251, 191, 36, 0.6);
    }

    /* Approvals Gate Alert */
    .approval-gate {
      background: #141416;
      border: 1px solid rgba(245, 158, 11, 0.35);
      border-radius: 7px;
      padding: 9px;
      margin-bottom: 9px;
    }
    .approval-cmd {
      font-family: var(--font-mono);
      font-size: 10px;
      background: #09090a;
      border: 1px solid var(--border-hairline);
      padding: 6px 8px;
      border-radius: 4px;
      color: #ffffff;
      margin: 6px 0;
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
      padding: 6px;
      font-weight: 600;
      font-family: var(--font-mono);
      font-size: 10.5px;
      border-radius: 5px;
    }
    .btn-approve:hover {
      background: #065f46;
    }
    .btn-deny {
      background: #450a0a;
      color: #fecdd3;
      border: 1px solid rgba(244, 63, 94, 0.3);
      padding: 6px;
      font-weight: 600;
      font-family: var(--font-mono);
      font-size: 10.5px;
      border-radius: 5px;
    }
    .btn-deny:hover {
      background: #7f1d1d;
    }

    /* Pairing Hub & QR */
    .qr-container {
      background: #09090a;
      border: 1px solid var(--border-hairline);
      border-radius: 8px;
      padding: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 8px auto;
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
      background: var(--bg-canvas);
      padding: 3px;
      border-radius: 6px;
      border: 1px solid var(--border-hairline);
      margin-bottom: 8px;
    }
    .endpoint-tab {
      flex: 1;
      background: transparent;
      border: 1px solid transparent;
      color: var(--text-muted);
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 500;
      padding: 4px 2px;
      border-radius: 4px;
      transition: all 0.12s ease;
    }
    .endpoint-tab:hover {
      color: #ffffff;
    }
    .endpoint-tab.active {
      background: var(--bg-interactive);
      color: #ffffff;
      border-color: rgba(255, 255, 255, 0.16);
      font-weight: 600;
    }

    /* Terminal Log Feed */
    .terminal-box {
      background: #09090a;
      border: 1px solid var(--border-hairline);
      border-radius: 6px;
      padding: 8px 10px;
      font-family: var(--font-mono);
      font-size: 10px;
      line-height: 1.5;
      height: 115px;
      overflow-y: auto;
      color: #a1a1aa;
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
      padding: 6px 8px;
      font-size: 10.5px;
      font-family: var(--font-mono);
      font-weight: 500;
      border-radius: 6px;
      justify-content: flex-start;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      transition: all 0.12s ease;
    }
    .btn-action:hover {
      background: var(--bg-interactive);
      color: var(--text-primary);
      border-color: var(--border-subtle);
    }

    /* Standard Tactile Buttons */
    .btn-primary {
      background: #ffffff;
      color: #09090b;
      border: 1px solid #ffffff;
      padding: 6px 10px;
      font-size: 11px;
      font-weight: 600;
      font-family: var(--font-mono);
      width: 100%;
      border-radius: 6px;
      transition: all 0.12s ease;
    }
    .btn-primary:hover {
      background: #e4e4e7;
      border-color: #e4e4e7;
    }
    .btn-secondary {
      background: var(--bg-elevated);
      color: #d4d4d8;
      border: 1px solid var(--border-hairline);
      padding: 6px 10px;
      font-size: 10.5px;
      font-family: var(--font-mono);
      width: 100%;
      border-radius: 6px;
      transition: all 0.12s ease;
    }
    .btn-secondary:hover {
      background: var(--bg-interactive);
      color: var(--text-primary);
      border-color: var(--border-subtle);
    }
    .btn-xs {
      background: transparent;
      border: 1px solid var(--border-hairline);
      color: var(--text-muted);
      font-family: var(--font-mono);
      font-size: 9px;
      padding: 2px 6px;
      border-radius: 4px;
      transition: all 0.12s ease;
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
      <svg width="18" height="18" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="18" y="16" width="13" height="68" rx="2.5" fill="#ffffff" />
        <path d="M52 16 L31 50 L52 84 H39 L22 50 L39 16 H52 Z" fill="#ffffff" />
        <path d="M82 16 L61 50 L82 84 H69 L52 50 L69 16 H82 Z" fill="#0078d4" />
      </svg>
      <span class="brand-text">kyber.</span>
    </div>
    <div class="status-badge ${status}">
      <span class="status-dot ${isLive ? 'live' : ''}"></span>
      <span>${isLive ? 'Live' : (status === 'starting' ? 'Starting' : 'Stopped')}</span>
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
        <span>Active & Linked</span>
      </div>
      <div style="display: flex; gap: 4px;">
        <button class="btn-xs" style="color: ${isGlobalHookInstalled ? 'var(--accent-emerald)' : 'var(--text-muted)'};" data-cmd="${isGlobalHookInstalled ? 'disableGlobalHook' : 'enableGlobalHook'}" onclick="sendMsg('${isGlobalHookInstalled ? 'disableGlobalHook' : 'enableGlobalHook'}')" title="${isGlobalHookInstalled ? 'Global hook active everywhere' : 'Click to enable hook globally for all projects'}">
          ${isGlobalHookInstalled ? 'Global: ON' : 'Global: OFF'}
        </button>
        <button class="btn-xs" style="color: var(--accent-rose);" data-cmd="disableHook" onclick="sendMsg('disableHook')" title="Unlink companion hook from this workspace">Unlink</button>
      </div>
    </div>
  `}

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
  <div class="policy-switch">
    <button class="policy-btn ${executionPolicy === 'always_proceed' ? 'active' : ''}" onclick="sendMsg('setExecutionPolicy', { policy: 'always_proceed' })">
      <span class="policy-dot ${executionPolicy === 'always_proceed' ? 'active' : ''}"></span>
      <span>Autonomous</span>
    </button>
    <button class="policy-btn ${executionPolicy === 'force_ask' ? 'active force-ask' : ''}" onclick="sendMsg('setExecutionPolicy', { policy: 'force_ask' })">
      <span class="policy-dot ${executionPolicy === 'force_ask' ? 'force-ask' : ''}"></span>
      <span>Force Ask</span>
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

      <div style="display: flex; gap: 4px; margin-bottom: 6px;">
        <button id="btnTabWeb" class="endpoint-tab active" style="flex: 1;" onclick="switchQrView('web')">Web App QR</button>
        <button id="btnTabApk" class="endpoint-tab" style="flex: 1;" onclick="switchQrView('apk')">Direct APK QR</button>
      </div>

      <div class="qr-container" id="qrWebBox">
        ${qrSvg}
      </div>
      <div class="qr-container" id="qrApkBox" style="display: none; flex-direction: column; align-items: center;">
        ${apkQrSvg}
        <div style="font-size: 10px; color: var(--accent-emerald); text-align: center; margin-top: 6px; font-weight: 500;">
          Scan with phone camera to download APK directly to phone
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 5px; margin-top: 8px;">
        <button class="btn-secondary" onclick="sendMsg('copyText', { text: '${currentEndpoint.url}', label: 'Companion URL' })" title="Copy Web App URL with ticket">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
          Copy URL
        </button>
        <button class="btn-secondary" onclick="sendMsg('copyText', { text: '${currentEndpoint.ticket}', label: 'Pairing Ticket' })" title="Copy authentication ticket">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          Copy Ticket
        </button>
      </div>

      <div style="margin-top: 6px;">
        <button class="btn-primary" style="display: flex; align-items: center; justify-content: center; gap: 6px;" onclick="sendMsg('openUrl', { url: 'http://127.0.0.1:4040/download/app.apk' })">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Download Android APK
        </button>
      </div>
    ` : `
      <div style="text-align: center; padding: 12px 0; color: var(--text-muted);">
        <p style="margin-bottom: 8px;">Daemon is currently stopped.</p>
        <button class="btn-primary" onclick="sendMsg('masterStartAndLink')">Start & Link Workspace</button>
      </div>
    `}
  </div>

  <!-- Collapsible Quick Action Shortcuts -->
  ${quickActions.length > 0 ? `
    <details class="card details-section">
      <summary class="card-title" style="margin-bottom: 0;">Quick Action Shortcuts (${quickActions.length})</summary>
      <div class="quick-actions-grid" style="margin-top: 8px;">
        ${quickActions.map(qa => `
          <button class="btn-action" title="${escapeHtml(qa.command)}" onclick="sendMsg('runQuickAction', { command: '${escapeHtml(qa.command)}', label: '${escapeHtml(qa.label)}' })">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            <span>${escapeHtml(qa.label)}</span>
          </button>
        `).join('')}
      </div>
    </details>
  ` : ''}

  <!-- Collapsible Live Mini-Terminal Feed -->
  <details class="card details-section">
    <summary class="card-title" style="margin-bottom: 0;">Daemon Event Logs</summary>
    <div style="margin-top: 8px;">
      <div style="display: flex; justify-content: flex-end; margin-bottom: 4px;">
        <button class="btn-xs" onclick="sendMsg('clearLogs')">Clear</button>
      </div>
      <div class="terminal-box" id="terminalBox" style="height: 90px;">
        ${logs.length > 0 ? logs.map(l => `
          <div class="term-line ${l.level}">
            <span class="term-time">${new Date(l.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
            <span class="term-text">${escapeHtml(l.text)}</span>
          </div>
        `).join('') : '<div class="term-empty">Waiting for daemon event stream...</div>'}
      </div>
    </div>
  </details>

  <!-- Service Controls -->
  <div class="card">
    <div class="card-title">
      <span>Service Controls</span>
    </div>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 5px; margin-bottom: 6px;">
      ${isLive ? `
        <button class="btn-secondary" onclick="sendMsg('restartDaemon')" title="Restarts companion daemon">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
          Restart
        </button>
        <button class="btn-secondary" style="color: var(--accent-rose);" onclick="sendMsg('stopDaemon')" title="Stops companion daemon">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          Stop
        </button>
      ` : `
        <button class="btn-primary" style="grid-column: span 2;" onclick="sendMsg('masterStartAndLink')">Master Start</button>
      `}
    </div>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 5px; margin-bottom: 4px;">
      <button class="btn-secondary" onclick="sendMsg('restartExtensionHost')" title="Restarts only the extension host process in ~1s while preserving open chat turns.">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
        Hot-Reload
      </button>
      <button class="btn-secondary" onclick="sendMsg('openSettings')" title="Open extension configuration">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        Settings
      </button>
    </div>

    <details style="margin-top: 4px;">
      <summary style="font-family: var(--font-mono); font-size: 9px; color: var(--text-muted); cursor: pointer; padding: 2px 0;">Advanced Service Options</summary>
      <div style="display: flex; flex-direction: column; gap: 4px; margin-top: 6px;">
        <button class="btn-secondary" onclick="sendMsg('${isStartupServiceEnabled ? 'disableStartupService' : 'enableStartupService'}')">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          ${isStartupServiceEnabled ? '24/7 Autostart: ON' : 'Enable 24/7 Autostart'}
        </button>
        <button class="btn-secondary" onclick="sendMsg('promptCloudflareToken')">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          ${hasCfToken ? 'Cloudflare Secret: Configured' : 'Set Cloudflare Secret'}
        </button>
      </div>
    </details>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    function sendMsg(command, payload) {
      vscode.postMessage({ command, ...(payload || {}) });
    }
    window.sendMsg = sendMsg;

    function switchQrView(type) {
      var webBox = document.getElementById('qrWebBox');
      var apkBox = document.getElementById('qrApkBox');
      var btnWeb = document.getElementById('btnTabWeb');
      var btnApk = document.getElementById('btnTabApk');
      if (type === 'apk') {
        if (webBox) webBox.style.display = 'none';
        if (apkBox) apkBox.style.display = 'flex';
        if (btnWeb) btnWeb.classList.remove('active');
        if (btnApk) btnApk.classList.add('active');
      } else {
        if (webBox) webBox.style.display = 'flex';
        if (apkBox) apkBox.style.display = 'none';
        if (btnWeb) btnWeb.classList.add('active');
        if (btnApk) btnApk.classList.remove('active');
      }
    }
    window.switchQrView = switchQrView;

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
