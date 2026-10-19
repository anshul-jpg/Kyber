#!/usr/bin/env node

import os from 'os';
import qrcode from 'qrcode-terminal';
import { DEFAULT_DAEMON_PORT, HOOK_IPC_PORT } from '@agy-companion/protocol';
import { HookIpcServer } from '../hooks/ipc-server.js';
import { WorkspaceManager } from '../session/workspace-manager.js';
import { WsGateway } from '../server/ws-gateway.js';

function getLocalIp(): string {
  const interfaces = os.networkInterfaces();
  const candidates: string[] = [];

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        // Skip link-local auto-assigned APIPA
        if (!iface.address.startsWith('169.254.')) {
          // If Wi-Fi or Ethernet, prioritize first
          if (name.toLowerCase().includes('wi-fi') || name.toLowerCase().includes('ethernet')) {
            return iface.address;
          }
          candidates.push(iface.address);
        }
      }
    }
  }

  if (candidates.length > 0) return candidates[0];
  return '127.0.0.1';
}

async function main() {
  const localIp = getLocalIp();
  const currentDir = process.cwd();

  console.log('\n===========================================================');
  console.log('       🚀 ANTIGRAVITY COMPANION DAEMON (v0.1.0)');
  console.log('      "Cloud Gaming, but for Cloud Coding"');
  console.log('===========================================================\n');

  const hookIpc = new HookIpcServer(HOOK_IPC_PORT);
  const workspaceManager = new WorkspaceManager();
  const wsGateway = new WsGateway(hookIpc, workspaceManager, DEFAULT_DAEMON_PORT);

  // Register current workspace
  const activeWs = workspaceManager.registerWorkspace(currentDir);

  await hookIpc.start();
  await wsGateway.start();

  console.log(`[IPC] Hook listener active on:       http://127.0.0.1:${HOOK_IPC_PORT}`);
  console.log(`[WS]  Mobile gateway active on:     ws://${localIp}:${DEFAULT_DAEMON_PORT}`);
  console.log(`[WS]  Workspace registered:         ${activeWs.name} (${activeWs.path})\n`);

  const mobileUrl = `http://${localIp}:${DEFAULT_DAEMON_PORT}/?host=${localIp}&port=${DEFAULT_DAEMON_PORT}&ws=${activeWs.id}`;

  console.log('-----------------------------------------------------------');
  console.log('📱 SCAN WITH PHONE TO CONNECT (Same WiFi / LAN):');
  console.log(`   ${mobileUrl}\n`);
  qrcode.generate(mobileUrl, { small: true });
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
    await hookIpc.stop();
    await wsGateway.stop();
    process.exit(0);
  });
}

main().catch(err => {
  console.error('Fatal error starting daemon:', err);
  process.exit(1);
});
