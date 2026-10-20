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

function postToDaemon(payload, timeoutMs = 3600000) {
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
      // Companion daemon is not running; gracefully fall back to terminal prompt
      resolve({ decision: 'ask', reason: 'Companion daemon not active.' });
    });

    req.write(postData);
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

    // Read mode file: check local workspace override first, fallback to global user home
    const localModeFile = path.resolve(__dirname, 'companion-mode');
    const globalModeFile = path.resolve(os.homedir(), '.agy-companion-mode');
    let mode = 'remote';
    if (fs.existsSync(localModeFile)) {
      mode = fs.readFileSync(localModeFile, 'utf8').trim().toLowerCase();
    } else if (fs.existsSync(globalModeFile)) {
      mode = fs.readFileSync(globalModeFile, 'utf8').trim().toLowerCase();
    }

    // Only gate run_command; auto-allow others so agent never hangs on file edits/reads
    if (hookContext.toolCall.name !== 'run_command') {
      process.stdout.write(JSON.stringify({ decision: 'allow' }));
      process.exit(0);
      return;
    }

    // Desk mode: force IDE to show its own native Allow/Deny dialog
    if (mode === 'desk') {
      logDebug('Desk mode — returning force_ask for IDE native prompt');
      process.stdout.write(JSON.stringify({ decision: 'force_ask' }));
      process.exit(0);
      return;
    }

    // Auto-allow internal build/bundle operations
    const cmd = hookContext.toolCall?.args?.CommandLine || '';
    if (cmd.includes('npm run build') || cmd.includes('vite build') || cmd.includes('tsc')) {
      process.stdout.write(JSON.stringify({ decision: 'allow', permissionOverrides: [\`command(\${cmd})\`] }));
      process.exit(0);
      return;
    }

    // Forward to companion daemon for mobile approval
    const result = await postToDaemon(hookContext);
    if (result && result.decision === 'allow') {
      process.stdout.write(JSON.stringify({ decision: 'allow' }));
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
    hooks: {
      PreToolUse: [
        {
          matcher: "run_command",
          command: "node",
          args: [".agents/interceptor.js"]
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
