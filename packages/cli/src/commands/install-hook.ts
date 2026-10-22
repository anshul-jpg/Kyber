import fs from 'fs';
import path from 'path';
import os from 'os';

const INTERCEPTOR_TEMPLATE = `#!/usr/bin/env node

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

const LOG_FILE = path.resolve(__dirname, 'hook_debug.log');

function logDebug(msg) {
  try {
    fs.appendFileSync(LOG_FILE, \`[\${new Date().toISOString()}] \${msg}\\n\`);
  } catch {}
}

async function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => {
      data += chunk;
    });
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
        res.on('data', chunk => {
          responseData += chunk;
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(responseData));
          } catch (e) {
            resolve({ decision: 'force_ask', reason: 'Failed to parse daemon response' });
          }
        });
      }
    );

    req.on('timeout', () => {
      req.destroy();
      resolve({ decision: 'force_ask', reason: 'Mobile approval timed out. Falling back to terminal prompt.' });
    });

    req.on('error', () => {
      // Companion daemon is not running; gracefully fall back to terminal prompt
      resolve({ decision: 'force_ask', reason: 'Companion daemon not active.' });
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

    // 1. Global execution policy (autonomous vs supervised)
    const globalPolicyFile = path.resolve(os.homedir(), '.agy-companion-policy');
    let policy = 'force_ask';
    if (fs.existsSync(globalPolicyFile)) {
      policy = fs.readFileSync(globalPolicyFile, 'utf8').trim().toLowerCase();
    }
    if (policy === 'always_proceed') {
      logDebug('Execution policy is always_proceed — auto-allowing tool');
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

    // Auto-allow only read-only git queries so agent isn't spammed during background git checks
    if (
      toolName === 'run_command' &&
      (cmd.trim() === 'git status' ||
        cmd.trim() === 'git diff' ||
        cmd.trim() === 'git log' ||
        cmd.trim().startsWith('git status '))
    ) {
      logDebug(\`Auto-allowing safe read query: \${cmd}\`);
      process.stdout.write(JSON.stringify({ decision: 'allow', permissionOverrides: [\`command(\${cmd})\`] }));
      process.exit(0);
      return;
    }

    // 2. Global mode file ~/.agy-companion-mode is the primary authority for remote/desk mode
    const globalModeFile = path.resolve(os.homedir(), '.agy-companion-mode');
    const localModeFile = path.resolve(__dirname, 'companion-mode');
    let mode = 'remote';
    if (fs.existsSync(globalModeFile)) {
      mode = fs.readFileSync(globalModeFile, 'utf8').trim().toLowerCase();
    } else if (fs.existsSync(localModeFile)) {
      mode = fs.readFileSync(localModeFile, 'utf8').trim().toLowerCase();
    }

    // Auto mode: dynamic resolution based on whether a phone is connected
    if (mode === 'auto') {
      mode = await getAutoModeResolution();
      logDebug(\`Auto mode dynamically resolved to: \${mode}\`);
    }

    // Desk mode: force IDE desktop prompt, ignoring cached 'always allow' permissions
    if (mode === 'desk') {
      logDebug('Desk mode — returning force_ask for IDE native handling');
      process.stdout.write(JSON.stringify({ decision: 'force_ask' }));
      process.exit(0);
      return;
    }

    // Forward to companion daemon for mobile approval
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
    process.stdout.write(
      JSON.stringify({
        decision: 'ask',
        reason: \`Hook error: \${error.message}\`,
      })
    );
    process.exit(0);
  }
}

main();
`;

const HOOKS_JSON_CONTENT = JSON.stringify(
  {
    "companion-interceptor": {
      PreToolUse: [
        {
          matcher: "run_command|write_to_file|replace_file_content|multi_replace_file_content",
          hooks: [
            {
              type: "command",
              command: "node .agents/interceptor.js",
              timeout: 130
            }
          ]
        }
      ]
    }
  },
  null,
  2
);

export function installHook(targetDirArg?: string): void {
  const targetDir = path.resolve(process.cwd(), targetDirArg || '.');
  const agentsDir = path.join(targetDir, '.agents');
  const interceptorPath = path.join(agentsDir, 'interceptor.js');
  const hooksJsonPath = path.join(agentsDir, 'hooks.json');
  const globalModePath = path.resolve(os.homedir(), '.agy-companion-mode');

  if (!fs.existsSync(agentsDir)) {
    fs.mkdirSync(agentsDir, { recursive: true });
  }

  // Write interceptor script
  fs.writeFileSync(interceptorPath, INTERCEPTOR_TEMPLATE, 'utf8');

  // Write hooks.json
  fs.writeFileSync(hooksJsonPath, HOOKS_JSON_CONTENT, 'utf8');

  // Ensure global ~/.agy-companion-mode exists (default to desk if not set)
  if (!fs.existsSync(globalModePath)) {
    fs.writeFileSync(globalModePath, 'desk', 'utf8');
  }

  console.log('\n===========================================================');
  console.log('   🚀 Antigravity Companion Hook Installed Successfully!');
  console.log('===========================================================');
  console.log(`📁 Target directory:   ${targetDir}`);
  console.log(`⚙️  Hook config:       .agents/hooks.json`);
  console.log(`⚡ Interceptor:       .agents/interceptor.js`);
  console.log(`🌐 Global Mode file:   ${globalModePath}`);
  console.log('-----------------------------------------------------------');
  console.log('✨ Any Antigravity task in this directory will now automatically');
  console.log('   route command approvals to your companion phone in Remote mode,');
  console.log('   or to your desktop screen in Desk mode.\n');
}
