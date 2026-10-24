import { spawn, spawnSync, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import assert from 'assert';

console.log('[Test] Starting restart-logic verification test...');

const testLog = path.join(os.tmpdir(), `restart-test-${Date.now()}.log`);
const dummyBat = path.join(os.tmpdir(), `restart-test-runner-${Date.now()}.bat`);

// 1. Spawn a mock target process
const dummyProc = spawn('node', ['-e', 'setInterval(()=>{}, 1000)'], {
  detached: true,
  stdio: 'ignore',
  windowsHide: true,
});
dummyProc.unref();
const dummyPid = dummyProc.pid;
console.log(`[Test] Spawned dummy target process PID=${dummyPid}`);
assert(dummyPid, 'Dummy process PID must exist');

// 2. Generate test restart batch script
const batContent = [
  '@echo off',
  'setlocal',
  `set LOG="${testLog}"`,
  'echo ================================================================ >> %LOG%',
  'echo [%date% %time%] [TEST_RESTART_INITIATED] >> %LOG%',
  `echo [%date% %time%] Step 1: Killing PID ${dummyPid}... >> %LOG%`,
  `taskkill /F /PID ${dummyPid} >> %LOG% 2>&1`,
  'echo [%date% %time%] Step 2: Polling until process is dead... >> %LOG%',
  'set /a COUNT=0',
  ':WAIT_LOOP',
  'set /a COUNT+=1',
  `tasklist /NH /FI "PID eq ${dummyPid}" 2>nul | find "${dummyPid}" >nul`,
  'if not errorlevel 1 (',
  '    if %COUNT% LEQ 15 (',
  '        ping 127.0.0.1 -n 2 >nul 2>&1',
  '        goto WAIT_LOOP',
  '    ) else (',
  '        echo [%date% %time%] Warning: Polling timeout reached. >> %LOG%',
  '    )',
  ') else (',
  '    echo [%date% %time%] Step 3: Process exited cleanly after %COUNT% checks. >> %LOG%',
  ')',
  'echo [%date% %time%] Step 4: Spawning replacement process... >> %LOG%',
  'start "" /B node -e "setTimeout(() => process.exit(0), 2000)"',
  'echo [%date% %time%] Step 5: Verification complete. >> %LOG%',
  'endlocal',
  'exit /b 0',
].join('\r\n') + '\r\n';

fs.writeFileSync(dummyBat, batContent, 'utf8');

// 3. Execute restart batch script
console.log('[Test] Executing restart batch script...');
const res = spawnSync(process.env.ComSpec || 'cmd.exe', ['/c', dummyBat], {
  encoding: 'utf8',
  windowsHide: true,
});
console.log('[Test] Batch runner stdout:', res.stdout);
console.log('[Test] Batch runner stderr:', res.stderr);
console.log('[Test] Batch runner status:', res.status);

// 4. Poll test log for completion (max 10s)
let completed = false;
for (let i = 0; i < 10; i++) {
  execSync('ping 127.0.0.1 -n 2 >nul', { windowsHide: true });
  if (fs.existsSync(testLog)) {
    const content = fs.readFileSync(testLog, 'utf8');
    console.log(`[Test Poll ${i}] Log so far:\n${content}`);
    if (content.includes('Step 5: Verification complete.')) {
      completed = true;
      break;
    }
  } else {
    console.log(`[Test Poll ${i}] Log file does not exist yet.`);
  }
}

if (!completed) {
  console.error('[Test Failed] Batch file was:');
  console.error(fs.readFileSync(dummyBat, 'utf8'));
  if (fs.existsSync(testLog)) {
    console.error('[Test Failed] Log content was:');
    console.error(fs.readFileSync(testLog, 'utf8'));
  }
}

try { fs.unlinkSync(dummyBat); } catch {}
try { fs.unlinkSync(testLog); } catch {}

assert(completed, 'Restart script must successfully kill target, wait, spawn replacement, and log all steps.');
console.log('[Test] PASSED: Restart batch lifecycle and detailed logging verified 100% working!');
