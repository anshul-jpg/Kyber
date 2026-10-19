/**
 * Test script to simulate Antigravity CLI triggering a PreToolUse hook.
 * Run this while `npm run start` is running to test the phone push notification!
 */

const { spawn } = require('child_process');
const path = require('path');

const hookScript = path.resolve(__dirname, '../hooks/interceptor.js');

const mockHookInput = {
  conversationId: 'test-conv-1234',
  stepIdx: 42,
  workspacePaths: [process.cwd()],
  toolCall: {
    name: 'run_command',
    args: {
      CommandLine: 'npm run test:e2e',
      Description: 'Run test suite against local staging environment',
    },
  },
};

console.log('Simulating Antigravity CLI executing a sensitive tool...');
console.log('Launching hook interceptor with payload:\n', JSON.stringify(mockHookInput, null, 2));

const proc = spawn('node', [hookScript], {
  stdio: ['pipe', 'pipe', 'inherit'],
});

proc.stdin.write(JSON.stringify(mockHookInput));
proc.stdin.end();

let output = '';
proc.stdout.on('data', chunk => {
  output += chunk;
});

proc.on('close', code => {
  console.log(`\nHook script finished with exit code ${code}`);
  console.log('Response received by Antigravity CLI:\n', output);
});
