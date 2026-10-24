#!/usr/bin/env node

/**
 * Antigravity Companion - PreToolUse Lifecycle Hook
 *
 * Three-Mode Policy:
 * 1. Remote Mode:
 *    - ALL tool approval cards and questions route to mobile phone companion (port 4041).
 *    - ZERO desktop popups in Antigravity IDE under any circumstances.
 *    - If daemon is unreachable or mobile times out, returns 'deny' with a paused explanation.
 *      Never returns 'force_ask' or 'ask' to PC.
 *
 * 2. Desk Mode:
 *    - ALL tool approval cards and questions prompt on PC IDE desktop ('force_ask').
 *    - Mobile receives zero prompts.
 *
 * 3. Auto Mode:
 *    - Autonomous execution: tools proceed without asking ('allow').
 *    - If forced ask (e.g. ask_question or explicit policy override):
 *      Prompts on whichever target device is selected (Remote = Phone, Desk = PC IDE).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

function sendDecisionAndExit(decisionObj) {
  try {
    fs.appendFileSync(path.resolve(__dirname, 'interceptor.log'), `${new Date().toISOString()} Hook decision: ${JSON.stringify(decisionObj)}\n`);
  } catch {}
  const json = JSON.stringify(decisionObj) + '\n';
  process.stdout.write(json, () => {
    process.exit(0);
  });
  setTimeout(() => {
    process.exit(0);
  }, 100);
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
            resolve({ decision: 'deny', reason: 'Failed to parse daemon response. Session held safely.' });
          }
        });
      }
    );

    req.on('timeout', () => {
      req.destroy();
      resolve({ decision: 'deny', reason: 'Mobile approval timed out (130s). Session held safely without PC modal.' });
    });

    req.on('error', () => {
      resolve({ decision: 'deny', reason: 'Companion daemon not active on port 4041. Session held safely.' });
    });

    req.write(postData);
    req.end();
  });
}

async function main() {
  let mode = 'remote';
  try {
    const hookContext = await readStdin();

    if (!hookContext.toolCall) {
      sendDecisionAndExit({ decision: 'allow' });
      return;
    }

    const toolName = hookContext.toolCall?.name || '';
    const cmd = hookContext.toolCall?.args?.CommandLine || '';

    // Safe read tools that never require user approval
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
      sendDecisionAndExit({ decision: 'allow' });
      return;
    }

    // 1. Read Global & Local Companion Mode
    const globalModeFile = path.resolve(os.homedir(), '.agy-companion-mode');
    const localModeFile = path.resolve(__dirname, 'companion-mode');
    if (fs.existsSync(globalModeFile)) {
      mode = fs.readFileSync(globalModeFile, 'utf8').trim().toLowerCase();
    } else if (fs.existsSync(localModeFile)) {
      mode = fs.readFileSync(localModeFile, 'utf8').trim().toLowerCase();
    }

    // 2. Read Global Execution Policy (Strict / Supervised vs Always Proceed / Autonomous)
    const globalPolicyFile = path.resolve(os.homedir(), '.agy-companion-policy');
    let policy = 'force_ask';
    if (fs.existsSync(globalPolicyFile)) {
      policy = fs.readFileSync(globalPolicyFile, 'utf8').trim().toLowerCase();
    }

    // If policy is Always Allow / Always Proceed, or mode is Auto/Autonomous:
    // Auto-proceed immediately without prompting (unless it's an explicit ask_question)
    const isAlwaysAllow = policy === 'always_proceed' || mode === 'auto' || mode === 'autonomous';

    if (isAlwaysAllow && toolName !== 'ask_question') {
      sendDecisionAndExit({ decision: 'allow' });
      return;
    }

    // Read target device preference for forced questions / asks
    const targetDeviceFile = path.resolve(os.homedir(), '.agy-companion-target');
    let targetDevice = 'remote';
    if (fs.existsSync(targetDeviceFile)) {
      const val = fs.readFileSync(targetDeviceFile, 'utf8').trim().toLowerCase();
      if (val === 'remote' || val === 'desk') targetDevice = val;
    } else if (mode === 'desk' || mode === 'remote') {
      targetDevice = mode;
    }

    const effectiveDevice = (mode === 'auto' || mode === 'autonomous') ? targetDevice : mode;

    // DESK MODE: Prompt appears on PC IDE Desktop
    if (effectiveDevice === 'desk') {
      sendDecisionAndExit({ decision: 'force_ask' });
      return;
    }

    // REMOTE MODE: Prompt appears ONLY on Phone Companion (ZERO desktop popups)
    const result = await postToDaemon(hookContext);
    if (result && result.decision === 'allow') {
      sendDecisionAndExit({ decision: 'allow' });
      return;
    }

    // Safety guard: in Remote Mode, NEVER let an 'ask' or 'force_ask' leak to IDE stdout
    if (result && (result.decision === 'force_ask' || result.decision === 'ask')) {
      sendDecisionAndExit({
        decision: 'deny',
        reason: 'Execution Paused: Waiting for mobile companion approval. Session frozen safely without desktop popup.'
      });
      return;
    }

    sendDecisionAndExit(result);
  } catch (error) {
    if (mode === 'desk') {
      sendDecisionAndExit({ decision: 'force_ask', reason: error.message });
    } else {
      sendDecisionAndExit({
        decision: 'deny',
        reason: `Remote approval paused: ${error.message}. Session held safely.`
      });
    }
  }
}

main();
`;
