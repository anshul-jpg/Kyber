import * as vscode from 'vscode';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { EventEmitter } from 'events';

const INTERCEPTOR_SCRIPT = `#!/usr/bin/env node

/**
 * Antigravity Companion - PreToolUse Lifecycle Hook
 *
 * Intercepts tool calls before execution.
 * - In Desk Mode: signals IDE to show native desktop prompt ('force_ask').
 * - In Remote Mode: pushes prompt to phone companion and waits for 'Allow'/'Deny'.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

async function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => {
      try {
        resolve(data.trim() ? JSON.parse(data) : {});
      } catch (err) {
        reject(err);
      }
    });
    process.stdin.on('error', reject);
  });
}

function postToDaemon(payload, timeoutMs = 130000) {
  return new Promise((resolve) => {
    const postData = JSON.stringify(payload);
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: 4041,
        path: '/api/hook/pre-tool-use',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
        timeout: timeoutMs,
      },
      res => {
        let responseData = '';
        res.on('data', chunk => { responseData += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(responseData));
          } catch (e) {
            resolve({ decision: 'ask', reason: 'Failed to parse daemon response' });
          }
        });
      }
    );

    req.on('timeout', () => {
      req.destroy();
      resolve({ decision: 'ask', reason: 'Mobile approval timed out. Falling back to terminal.' });
    });

    req.on('error', () => {
      resolve({ decision: 'ask', reason: 'Companion daemon not active.' });
    });

    req.write(postData);
    req.end();
  });
}

function getAutoModeResolution() {
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: 4040,
        path: '/api/health',
        method: 'GET',
        timeout: 350,
      },
      res => {
        let data = '';
        res.on('data', c => { data += c; });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve(json.connectedPhoneCount > 0 ? 'remote' : 'desk');
          } catch {
            resolve('desk');
          }
        });
      }
    );
    req.on('error', () => resolve('desk'));
    req.on('timeout', () => { req.destroy(); resolve('desk'); });
    req.end();
  });
}

async function main() {
  try {
    const hookContext = await readStdin();

    if (!hookContext.toolCall) {
      process.stdout.write(JSON.stringify({ decision: 'allow' }));
      process.exit(0);
      return;
    }

    // 1. Check Global Execution Policy (Autonomous vs Supervised)
    const globalPolicyFile = path.resolve(os.homedir(), '.agy-companion-policy');
    let policy = 'force_ask';
    if (fs.existsSync(globalPolicyFile)) {
      policy = fs.readFileSync(globalPolicyFile, 'utf8').trim().toLowerCase();
    }
    if (policy === 'always_proceed') {
      process.stdout.write(JSON.stringify({ decision: 'allow' }));
      process.exit(0);
      return;
    }

    const toolName = hookContext.toolCall?.name || '';
    const cmd = hookContext.toolCall?.args?.CommandLine || '';

    // Safe read tools that should never stall the agent
    const SAFE_READ_TOOLS = new Set([
      'view_file',
      'list_dir',
      'grep_search',
      'read_url_content',
      'read_resource',
      'list_resources',
      'schedule',
      'manage_task',
    ]);
    if (SAFE_READ_TOOLS.has(toolName)) {
      process.stdout.write(JSON.stringify({ decision: 'allow' }));
      process.exit(0);
      return;
    }

    // Auto-allow read-only git queries so agent isn't spammed during background git checks
    if (
      toolName === 'run_command' &&
      (cmd.trim() === 'git status' ||
        cmd.trim() === 'git diff' ||
        cmd.trim() === 'git log' ||
        cmd.trim().startsWith('git status '))
    ) {
      process.stdout.write(JSON.stringify({ decision: 'allow', permissionOverrides: [\`command(\${cmd})\`] }));
      process.exit(0);
      return;
    }

    // 2. Check Companion Mode (Desk vs Remote vs Auto vs Autonomous)
    const globalModeFile = path.resolve(os.homedir(), '.agy-companion-mode');
    const localModeFile = path.resolve(__dirname, 'companion-mode');
    let mode = 'remote';
    if (fs.existsSync(globalModeFile)) {
      mode = fs.readFileSync(globalModeFile, 'utf8').trim().toLowerCase();
    } else if (fs.existsSync(localModeFile)) {
      mode = fs.readFileSync(localModeFile, 'utf8').trim().toLowerCase();
    }

    // Autonomous mode: completely hands-off, auto-allow every tool immediately with zero prompts
    if (mode === 'autonomous') {
      const overrides = cmd ? [\`command(\${cmd})\`] : [];
      process.stdout.write(JSON.stringify({ decision: 'allow', permissionOverrides: overrides }));
      process.exit(0);
      return;
    }

    if (mode === 'auto') {
      mode = await getAutoModeResolution();
    }

    // Desk mode: let IDE handle native prompt according to user settings, no phone routing
    if (mode === 'desk') {
      process.stdout.write(JSON.stringify({ decision: 'force_ask' }));
      process.exit(0);
      return;
    }

    const result = await postToDaemon(hookContext);
    if (result && result.decision === 'allow') {
      const overrides = result.permissionOverrides || (cmd ? [\`command(\${cmd})\`] : []);
      process.stdout.write(JSON.stringify({ decision: 'allow', permissionOverrides: overrides }));
      process.exit(0);
      return;
    }

    process.stdout.write(JSON.stringify(result));
    process.exit(0);
  } catch (error) {
    process.stdout.write(JSON.stringify({ decision: 'force_ask', reason: error.message }));
    process.exit(0);
  }
}

main();
`;

const HOOKS_JSON_CONTENT = JSON.stringify(
  {
    'companion-interceptor': {
      PreToolUse: [
        {
          matcher: 'run_command|write_to_file|replace_file_content|multi_replace_file_content',
          hooks: [
            {
              type: 'command',
              command: 'node ./interceptor.js',
              timeout: 130,
            },
          ],
        },
      ],
    },
  },
  null,
  2
);

export class HookManager extends EventEmitter {
  constructor() {
    super();
  }

  public getActiveWorkspacePath(): string | null {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) return null;
    return folders[0].uri.fsPath;
  }

  public isInstalledInCurrentWorkspace(): boolean {
    const ws = this.getActiveWorkspacePath();
    if (!ws) return false;

    const hookFile = path.join(ws, '.agents', 'hooks.json');
    const interceptorFile = path.join(ws, '.agents', 'interceptor.js');

    return fs.existsSync(hookFile) && fs.existsSync(interceptorFile);
  }

  public async enableInCurrentWorkspace(): Promise<boolean> {
    const ws = this.getActiveWorkspacePath();
    if (!ws) {
      vscode.window.showErrorMessage('No active workspace open in IDE.');
      return false;
    }

    try {
      const agentsDir = path.join(ws, '.agents');
      if (!fs.existsSync(agentsDir)) {
        fs.mkdirSync(agentsDir, { recursive: true });
      }

      const interceptorPath = path.join(agentsDir, 'interceptor.js');
      const hooksJsonPath = path.join(agentsDir, 'hooks.json');
      const globalModePath = path.resolve(os.homedir(), '.agy-companion-mode');

      fs.writeFileSync(interceptorPath, INTERCEPTOR_SCRIPT, 'utf8');
      fs.writeFileSync(hooksJsonPath, HOOKS_JSON_CONTENT, 'utf8');

      if (!fs.existsSync(globalModePath)) {
        fs.writeFileSync(globalModePath, 'remote', 'utf8');
      }

      this.emit('hook_status_changed', true);
      vscode.window.showInformationMessage('Antigravity Companion Hook enabled for this workspace.');
      return true;
    } catch (err: any) {
      vscode.window.showErrorMessage(`Failed to install hook: ${err.message}`);
      return false;
    }
  }

  public async disableInCurrentWorkspace(): Promise<boolean> {
    const ws = this.getActiveWorkspacePath();
    if (!ws) return false;

    try {
      const hookFile = path.join(ws, '.agents', 'hooks.json');
      const interceptorFile = path.join(ws, '.agents', 'interceptor.js');

      if (fs.existsSync(hookFile)) fs.unlinkSync(hookFile);
      if (fs.existsSync(interceptorFile)) fs.unlinkSync(interceptorFile);

      this.emit('hook_status_changed', false);
      vscode.window.showInformationMessage('Antigravity Companion Hook disabled for this workspace.');
      return true;
    } catch (err: any) {
      vscode.window.showErrorMessage(`Failed to remove hook: ${err.message}`);
      return false;
    }
  }
}
