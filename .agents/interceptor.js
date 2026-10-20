#!/usr/bin/env node

/**
 * Antigravity Companion - PreToolUse Lifecycle Hook
 *
 * This hook is called by Antigravity CLI before executing tools.
 * It reads the toolCall from stdin, queries the local Companion daemon,
 * and outputs the decision to stdout.
 *
 * If the Companion daemon is offline or times out, it gracefully falls back
 * to "ask" so that the standard terminal prompt functions normally.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const LOG_FILE = path.resolve(__dirname, 'hook_debug.log');

function logDebug(msg) {
  try {
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`);
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
  return new Promise((resolve, reject) => {
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

    req.on('error', err => {
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
    logDebug(`Hook invoked with context: ${JSON.stringify(hookContext)}`);

    // Check if toolCall is present
    if (!hookContext.toolCall) {
      logDebug('No toolCall in context, allowing');
      process.stdout.write(JSON.stringify({ decision: 'allow' }));
      process.exit(0);
      return;
    }

    // Read mode file: check local workspace override first, fallback to global user home
    const os = require('os');
    const localModeFile = path.resolve(__dirname, 'companion-mode');
    const globalModeFile = path.resolve(os.homedir(), '.agy-companion-mode');
    let mode = 'remote';
    if (fs.existsSync(localModeFile)) {
      mode = fs.readFileSync(localModeFile, 'utf8').trim().toLowerCase();
    } else if (fs.existsSync(globalModeFile)) {
      mode = fs.readFileSync(globalModeFile, 'utf8').trim().toLowerCase();
    }

    // Only gate run_command; auto-allow everything else so agent never hangs on file edits/reads
    if (hookContext.toolCall.name !== 'run_command') {
      logDebug(`Auto-allowing non-run_command tool: ${hookContext.toolCall.name}`);
      process.stdout.write(JSON.stringify({ decision: 'allow' }));
      process.exit(0);
      return;
    }

    // Desk mode: force IDE to show its own native Allow/Deny dialog, no phone involved
    if (mode === 'desk') {
      logDebug('Desk mode — returning force_ask for IDE native prompt');
      process.stdout.write(JSON.stringify({ decision: 'force_ask' }));
      process.exit(0);
      return;
    }

    // Auto-allow build/bundle operations within the companion project
    const cmd = hookContext.toolCall?.args?.CommandLine || '';
    if (cmd.includes('npm run build') || cmd.includes('vite build') || cmd.includes('tsc')) {
      logDebug(`Auto-allowing internal build command: ${cmd}`);
      process.stdout.write(JSON.stringify({ decision: 'allow', permissionOverrides: [`command(${cmd})`] }));
      process.exit(0);
      return;
    }

    // Forward to companion daemon for mobile approval
    logDebug(`Posting to daemon: ${hookContext.toolCall.name}`);
    const result = await postToDaemon(hookContext);
    logDebug(`Daemon returned: ${JSON.stringify(result)}`);

    if (result && result.decision === 'allow') {
      process.stdout.write(JSON.stringify({ decision: 'allow' }));
      process.exit(0);
      return;
    }

    process.stdout.write(JSON.stringify(result));
    process.exit(0);
  } catch (error) {
    logDebug(`Hook error: ${error.message}`);
    // Fail-safe: Always fall back to "ask" on any unexpected error
    process.stdout.write(
      JSON.stringify({
        decision: 'ask',
        reason: `Hook error: ${error.message}`,
      })
    );
    process.exit(0);
  }
}

main();
