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

function postToDaemon(payload, timeoutMs = 300000) {
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

    // Check if toolCall is present
    if (!hookContext.toolCall) {
      process.stdout.write(JSON.stringify({ decision: 'allow' }));
      process.exit(0);
      return;
    }

    // Forward to companion daemon for mobile approval
    const result = await postToDaemon(hookContext);
    process.stdout.write(JSON.stringify(result));
    process.exit(0);
  } catch (error) {
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
