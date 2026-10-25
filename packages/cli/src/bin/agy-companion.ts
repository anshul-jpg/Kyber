#!/usr/bin/env node

// Protect daemon from breaking pipes (EPIPE) when IDE closes or restarts
process.stdout.on('error', (err: any) => {
  if (err.code === 'EPIPE') return;
});
process.stderr.on('error', (err: any) => {
  if (err.code === 'EPIPE') return;
});
process.on('uncaughtException', (err: any) => {
  if (err.code === 'EPIPE') return;
  console.error('[Companion Daemon Error] Uncaught exception:', err);
});

import os from 'os';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawn } from 'child_process';
import qrcode from 'qrcode-terminal';
import cloudflared from 'cloudflared';
import { DEFAULT_DAEMON_PORT, HOOK_IPC_PORT, encodePairingTicket, PairingTicket } from '@agy-companion/protocol';
import { HookIpcServer } from '../hooks/ipc-server.js';
import { WorkspaceManager } from '../session/workspace-manager.js';
import { WsGateway } from '../server/ws-gateway.js';
import { installHook } from '../commands/install-hook.js';

interface NetworkAddresses {
  localIp: string;
  tailscaleIp: string | null;
}

function getNetworkAddresses(): NetworkAddresses {
  const interfaces = os.networkInterfaces();
  const candidates: string[] = [];
  let tailscaleIp: string | null = null;

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        // Detect Tailscale IP (100.64.0.0/10) or interface name
        if (name.toLowerCase().includes('tailscale') || iface.address.startsWith('100.')) {
          tailscaleIp = iface.address;
          continue;
        }

        // Skip link-local auto-assigned APIPA
        if (!iface.address.startsWith('169.254.')) {
          if (name.toLowerCase().includes('wi-fi') || name.toLowerCase().includes('ethernet')) {
            candidates.unshift(iface.address);
          } else {
            candidates.push(iface.address);
          }
        }
      }
    }
  }

  return {
    localIp: candidates.length > 0 ? candidates[0] : '127.0.0.1',
    tailscaleIp,
  };
}

async function startCloudflareTunnel(port: number, token?: string): Promise<{ url: string; stop: () => void } | null> {
  return new Promise(async resolve => {
    try {
      let binPath = (cloudflared as any).bin;
      if (!binPath || !fs.existsSync(binPath)) {
        binPath = await (cloudflared as any).install((cloudflared as any).DEFAULT_CLOUDFLARED_BIN);
      }

      let proc: any;
      let resolved = false;

      if (token) {
        console.log('[Tunnel] Launching Cloudflare named tunnel with secure token...');
        proc = spawn(binPath, ['tunnel', 'run', '--token', token], {
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        });
        // Named tunnels route through user's preconfigured Cloudflare domain
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            resolve({
              url: 'https://cloudflare-tunnel.user-configured.net',
              stop: () => {
                try { proc.kill(); } catch {}
              },
            });
          }
        }, 3000);
      } else {
        console.log('[Tunnel] Launching Cloudflare quick tunnel (worldwide HTTPS)...');
        proc = spawn(binPath, ['tunnel', '--url', `http://127.0.0.1:${port}`], {
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        });
      }

      const parseOutput = (data: Buffer) => {
        const text = data.toString();
        const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/i);
        if (match && !resolved) {
          resolved = true;
          resolve({
            url: match[0],
            stop: () => {
              try {
                proc.kill();
              } catch {}
            },
          });
        }
      };

      proc.stdout?.on('data', parseOutput);
      proc.stderr?.on('data', parseOutput);

      setTimeout(() => {
        if (!resolved) resolve(null);
      }, 15000);
    } catch (err) {
      console.error('[Tunnel] Failed to launch Cloudflare tunnel:', err);
      resolve(null);
    }
  });
}

async function main() {
  const args = process.argv.slice(2);

  // Subcommand: agy-companion hook install [dir | --global]
  if (args[0] === 'hook' && args[1] === 'install') {
    const isGlobal = args.includes('--global') || args.includes('-g') || args[2] === 'global';
    const targetDir = isGlobal ? undefined : (args[2] || '.');
    installHook(targetDir, isGlobal);
    process.exit(0);
  }

  // Help command
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Antigravity Companion CLI

Commands:
  agy-companion                     Start the companion daemon server
  agy-companion --tunnel            Start daemon with a free Cloudflare Quick Tunnel (public HTTPS)
  agy-companion hook install [dir]  Install universal hook into project workspace (default: .)
  agy-companion hook install -g     Install universal hook globally (~/.gemini/config/hooks.json)

Options:
  --tunnel                          Expose over public HTTPS via Cloudflare Quick Tunnel
  --global, -g                      Install hook globally for all projects & workspaces
  --help, -h                        Show this help message
`);
    process.exit(0);
  }

function getOrCreateAuthToken(): string {
  const tokenPath = path.resolve(os.homedir(), '.agy-companion-token');
  try {
    if (fs.existsSync(tokenPath)) {
      const token = fs.readFileSync(tokenPath, 'utf8').trim();
      if (token.length >= 16) return token;
    }
    const newToken = crypto.randomBytes(16).toString('hex');
    fs.writeFileSync(tokenPath, newToken, 'utf8');
    return newToken;
  } catch {
    return 'companion_persistent_token_default';
  }
}

  const { localIp, tailscaleIp } = getNetworkAddresses();
  const wsIdx = args.indexOf('--workspace');
  const targetWsDir = wsIdx !== -1 && args[wsIdx + 1] ? path.resolve(args[wsIdx + 1]) : process.cwd();
  
  const portIdx = args.indexOf('--port');
  const daemonPort = portIdx !== -1 && args[portIdx + 1] ? parseInt(args[portIdx + 1], 10) : DEFAULT_DAEMON_PORT;

  const cfTokenIdx = args.indexOf('--cloudflare-token');
  const cloudflareToken = cfTokenIdx !== -1 && args[cfTokenIdx + 1] ? args[cfTokenIdx + 1] : undefined;

  const wantTunnel = args.includes('--tunnel') || !!cloudflareToken;
  const authToken = getOrCreateAuthToken();

  console.log('\n===========================================================');
  console.log('       ANTIGRAVITY COMPANION DAEMON (v0.1.0)');
  console.log('      "Cloud Gaming, but for Cloud Coding"');
  console.log('===========================================================\n');

  const hookIpc = new HookIpcServer(HOOK_IPC_PORT);
  const workspaceManager = new WorkspaceManager();
  const wsGateway = new WsGateway(hookIpc, workspaceManager, daemonPort);

  // Register initial workspace if valid user workspace directory
  const baseName = path.basename(targetWsDir).toLowerCase();
  const normPath = targetWsDir.toLowerCase().replace(/\\/g, '/');
  const isInternal = baseName === 'bin' || normPath.endsWith('/dist/bin') || normPath.includes('/packages/cli/dist');
  let activeWs: import('@agy-companion/protocol').WorkspaceState | undefined = undefined;
  if (!isInternal && fs.existsSync(targetWsDir) && fs.statSync(targetWsDir).isDirectory()) {
    activeWs = workspaceManager.registerWorkspace(targetWsDir);
  }

  await hookIpc.start();
  await wsGateway.start();

  console.log(`
       ▲
      /|
     / |   KYBER
     \\ |   Autonomous Pocket Supervisor
      \\|
       ▼
  `);
  console.log(`[IPC] Hook listener active on:       http://127.0.0.1:${HOOK_IPC_PORT}`);
  console.log(`[WS]  Mobile gateway active on:     ws://${localIp}:${DEFAULT_DAEMON_PORT}`);
  if (activeWs) {
    console.log(`[WS]  Workspace registered:         ${activeWs.name} (${activeWs.path})\n`);
  } else {
    console.log('[WS]  Workspace registered:         Awaiting IDE attachment\n');
  }

  // 1. Local Wi-Fi Ticket
  const localTicket = encodePairingTicket({
    version: 1,
    host: localIp,
    port: DEFAULT_DAEMON_PORT,
    ssl: false,
    token: authToken,
    workspaceId: activeWs?.id,
  });
  const localMobileUrl = `http://${localIp}:${DEFAULT_DAEMON_PORT}/?ticket=${localTicket}`;

  console.log('-----------------------------------------------------------');
  console.log('1. LOCAL WI-FI / LAN:');
  console.log(`   URL:    ${localMobileUrl}`);
  console.log(`   Ticket: ${localTicket}\n`);
  qrcode.generate(localMobileUrl, { small: true });

  // 2. Tailscale Mesh VPN Ticket
  if (tailscaleIp) {
    const tailscaleTicket = encodePairingTicket({
      version: 1,
      host: tailscaleIp,
      port: DEFAULT_DAEMON_PORT,
      ssl: false,
      token: authToken,
      workspaceId: activeWs?.id,
    });
    const tailscaleMobileUrl = `http://${tailscaleIp}:${DEFAULT_DAEMON_PORT}/?ticket=${tailscaleTicket}`;
    console.log('-----------------------------------------------------------');
    console.log('2. TAILSCALE REMOTE ACCESS (Anywhere on Mesh VPN):');
    console.log(`   URL:    ${tailscaleMobileUrl}`);
    console.log(`   Ticket: ${tailscaleTicket}\n`);
    qrcode.generate(tailscaleMobileUrl, { small: true });
  }

  // 3. Cloudflare Tunnel Ticket
  let tunnelHandler: { url: string; stop: () => void } | null = null;
  if (wantTunnel) {
    tunnelHandler = await startCloudflareTunnel(daemonPort, cloudflareToken);
    if (tunnelHandler) {
      const tunnelHost = tunnelHandler.url.replace(/^https?:\/\//, '');
      const tunnelTicket = encodePairingTicket({
        version: 1,
        host: tunnelHost,
        port: 443,
        ssl: true,
        token: authToken,
        workspaceId: activeWs?.id,
        tunnelUrl: tunnelHandler.url,
      });
      const publicMobileUrl = `${tunnelHandler.url}/?ticket=${tunnelTicket}`;
      console.log('-----------------------------------------------------------');
      console.log('3. CLOUDFLARE QUICK TUNNEL (Worldwide Cellular / HTTPS):');
      console.log(`   URL:    ${publicMobileUrl}`);
      console.log(`   Ticket: ${tunnelTicket}\n`);
      qrcode.generate(publicMobileUrl, { small: true });
    } else {
      console.log('Cloudflare tunnel startup timed out.');
    }
  }

  console.log('-----------------------------------------------------------\n');
  console.log('Waiting for Antigravity permission requests...\n');

  // Terminal keyboard bypass listener for immediate desktop approvals
  if (process.stdin.isTTY) {
    try {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', key => {
        const str = key.toString();
        if (str === '\u0003') {
          // Ctrl+C
          process.emit('SIGINT');
        } else if (str.toLowerCase() === 'a') {
          if (hookIpc.resolveLatest('allow')) {
            console.log('\n[DESKTOP BYPASS] Allowed immediately from desktop console.');
          }
        } else if (str.toLowerCase() === 'd') {
          if (hookIpc.resolveLatest('deny')) {
            console.log('\n[DESKTOP BYPASS] Denied immediately from desktop console.');
          }
        }
      });
    } catch {}
  }

  hookIpc.on('approval_requested', req => {
    console.log(`\n[APPROVAL NEEDED] Tool: "${req.toolCall.name}"`);
    console.log(`   Workspace: ${req.workspacePath}`);
    if (req.toolCall.args?.CommandLine) console.log(`   Command:   ${req.toolCall.args.CommandLine}`);
    console.log(`   -> Pushed to mobile companion (120s timeout).`);
    console.log(`   [DESKTOP KEYBOARD]: Press [A] to Allow now, [D] to Deny.`);
  });

  hookIpc.on('approval_resolved', res => {
    console.log(`[APPROVAL RESOLVED] Decision: ${res.decision.toUpperCase()}`);
    if (res.reason) console.log(`   Reason: ${res.reason}`);
  });

  process.on('SIGINT', async () => {
    console.log('\nStopping companion daemon...');
    if (tunnelHandler) tunnelHandler.stop();
    await hookIpc.stop();
    await wsGateway.stop();
    process.exit(0);
  });
}

main().catch(err => {
  console.error('Fatal error starting daemon:', err);
  process.exit(1);
});
