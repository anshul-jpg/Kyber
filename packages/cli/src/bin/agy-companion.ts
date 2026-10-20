#!/usr/bin/env node

import os from 'os';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import qrcode from 'qrcode-terminal';
import cloudflared from 'cloudflared';
import { DEFAULT_DAEMON_PORT, HOOK_IPC_PORT } from '@agy-companion/protocol';
import { HookIpcServer } from '../hooks/ipc-server.js';
import { WorkspaceManager } from '../session/workspace-manager.js';
import { WsGateway } from '../server/ws-gateway.js';
import { AgyEngine } from '../engine/agy-engine.js';
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

async function startCloudflareTunnel(port: number): Promise<{ url: string; stop: () => void } | null> {
  return new Promise(async resolve => {
    try {
      console.log('[Tunnel] Launching Cloudflare quick tunnel (worldwide HTTPS)...');
      let binPath = (cloudflared as any).bin;
      if (!binPath || !fs.existsSync(binPath)) {
        binPath = await (cloudflared as any).install((cloudflared as any).DEFAULT_CLOUDFLARED_BIN);
      }

      const proc = spawn(binPath, ['tunnel', '--url', `http://127.0.0.1:${port}`], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let resolved = false;
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
      console.error('[Tunnel] Failed to launch Cloudflare quick tunnel:', err);
      resolve(null);
    }
  });
}

async function main() {
  const args = process.argv.slice(2);

  // Subcommand: agy-companion hook install [dir]
  if (args[0] === 'hook' && args[1] === 'install') {
    const targetDir = args[2] || '.';
    installHook(targetDir);
    process.exit(0);
  }

  // Help command
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Antigravity Companion CLI

Commands:
  agy-companion                  Start the companion daemon server
  agy-companion --tunnel         Start daemon with a free Cloudflare Quick Tunnel (public HTTPS)
  agy-companion hook install [d] Install universal interceptor hook into target directory (default: .)

Options:
  --tunnel                       Expose over public HTTPS via Cloudflare Quick Tunnel
  --help, -h                     Show this help message
`);
    process.exit(0);
  }

  const { localIp, tailscaleIp } = getNetworkAddresses();
  const currentDir = process.cwd();
  const wantTunnel = args.includes('--tunnel');

  console.log('\n===========================================================');
  console.log('       🚀 ANTIGRAVITY COMPANION DAEMON (v0.1.0)');
  console.log('      "Cloud Gaming, but for Cloud Coding"');
  console.log('===========================================================\n');

  const hookIpc = new HookIpcServer(HOOK_IPC_PORT);
  const workspaceManager = new WorkspaceManager();
  const agyEngine = new AgyEngine();
  const wsGateway = new WsGateway(hookIpc, workspaceManager, agyEngine, DEFAULT_DAEMON_PORT);

  // Register current workspace
  const activeWs = workspaceManager.registerWorkspace(currentDir);

  await hookIpc.start();
  await wsGateway.start();

  console.log(`[IPC] Hook listener active on:       http://127.0.0.1:${HOOK_IPC_PORT}`);
  console.log(`[WS]  Mobile gateway active on:     ws://${localIp}:${DEFAULT_DAEMON_PORT}`);
  console.log(`[WS]  Workspace registered:         ${activeWs.name} (${activeWs.path})\n`);

  const localMobileUrl = `http://${localIp}:${DEFAULT_DAEMON_PORT}/?host=${localIp}&port=${DEFAULT_DAEMON_PORT}&ws=${activeWs.id}`;

  console.log('-----------------------------------------------------------');
  console.log('📱 1. LOCAL WI-FI / LAN:');
  console.log(`   ${localMobileUrl}\n`);
  qrcode.generate(localMobileUrl, { small: true });

  if (tailscaleIp) {
    const tailscaleMobileUrl = `http://${tailscaleIp}:${DEFAULT_DAEMON_PORT}/?host=${tailscaleIp}&port=${DEFAULT_DAEMON_PORT}&ws=${activeWs.id}`;
    console.log('-----------------------------------------------------------');
    console.log('🌐 2. TAILSCALE REMOTE ACCESS (Anywhere on Tailscale VPN):');
    console.log(`   ${tailscaleMobileUrl}\n`);
  }

  let tunnelHandler: { url: string; stop: () => void } | null = null;
  if (wantTunnel) {
    tunnelHandler = await startCloudflareTunnel(DEFAULT_DAEMON_PORT);
    if (tunnelHandler) {
      // In web app, we pass the tunnel host and protocol
      const publicMobileUrl = `${tunnelHandler.url}/?ws=${activeWs.id}`;
      console.log('-----------------------------------------------------------');
      console.log('🌍 3. CLOUDFLARE QUICK TUNNEL (Worldwide Cellular / HTTPS):');
      console.log(`   ${publicMobileUrl}\n`);
      qrcode.generate(publicMobileUrl, { small: true });
    } else {
      console.log('⚠️ Cloudflare tunnel startup timed out.');
    }
  }

  console.log('-----------------------------------------------------------\n');
  console.log('Waiting for Antigravity permission requests...\n');

  hookIpc.on('approval_requested', req => {
    console.log(`\n🔔 [APPROVAL NEEDED] Tool: "${req.toolCall.name}"`);
    console.log(`   Workspace: ${req.workspacePath}`);
    console.log(`   Args: ${JSON.stringify(req.toolCall.args)}`);
    console.log(`   ➡️ Pushed to mobile companion. Awaiting response...`);
  });

  hookIpc.on('approval_resolved', res => {
    console.log(`✅ [APPROVAL RESOLVED] Decision: ${res.decision.toUpperCase()}`);
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
