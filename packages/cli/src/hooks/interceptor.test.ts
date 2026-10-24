import { test } from 'node:test';
import assert from 'node:assert';
import { execFileSync, spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { getCanonicalInterceptorCode } from '../commands/install-hook.js';

test('Canonical interceptor.js passes node syntax check with zero errors', () => {
  const assetPath = path.resolve(process.cwd(), 'assets/interceptor.js');
  const fallbackPath = path.resolve(process.cwd(), 'packages/cli/assets/interceptor.js');
  const targetPath = fs.existsSync(assetPath) ? assetPath : fallbackPath;

  assert.ok(fs.existsSync(targetPath), `Target asset must exist: ${targetPath}`);
  
  // node --check fails and throws if there is any syntax error
  execFileSync('node', ['--check', targetPath], { encoding: 'utf8', windowsHide: true });
});

test('getCanonicalInterceptorCode returns valid JavaScript matching canonical asset', () => {
  const code = getCanonicalInterceptorCode();
  assert.ok(code.length > 500, 'Interceptor code must not be empty');
  assert.ok(code.includes('sendDecisionAndExit'), 'Must contain sendDecisionAndExit function');
  assert.ok(!code.includes('\\`;'), 'Must not contain rogue escaped template backticks');
});

test('interceptor immediately allows safe read tools (view_file)', async () => {
  const assetPath = path.resolve(process.cwd(), 'assets/interceptor.js');
  const fallbackPath = path.resolve(process.cwd(), 'packages/cli/assets/interceptor.js');
  const targetPath = fs.existsSync(assetPath) ? assetPath : fallbackPath;

  const payload = JSON.stringify({
    toolCall: {
      name: 'view_file',
      args: { AbsolutePath: 'd:/test.txt' }
    }
  });

  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn('node', [targetPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', chunk => (stdout += chunk));
    child.stderr.on('data', chunk => (stderr += chunk));

    child.on('close', code => {
      if (code !== 0) {
        reject(new Error(`Interceptor failed with code ${code}: ${stderr}`));
      } else {
        resolve(stdout.trim());
      }
    });

    child.stdin.write(payload);
    child.stdin.end();
  });

  const parsed = JSON.parse(output);
  assert.strictEqual(parsed.decision, 'allow', 'Safe read tool must be automatically allowed');
});

test('interceptor in Desk Mode emits force_ask to desktop IDE', async () => {
  const assetPath = path.resolve(process.cwd(), 'assets/interceptor.js');
  const fallbackPath = path.resolve(process.cwd(), 'packages/cli/assets/interceptor.js');
  const targetPath = fs.existsSync(assetPath) ? assetPath : fallbackPath;

  // Temporarily ensure local companion-mode is desk
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-interceptor-test-'));
  const testScriptPath = path.join(tmpDir, 'interceptor.js');
  fs.copyFileSync(targetPath, testScriptPath);
  fs.writeFileSync(path.join(tmpDir, 'companion-mode'), 'desk', 'utf8');
  fs.writeFileSync(path.join(tmpDir, 'companion-policy'), 'force_ask', 'utf8');

  const payload = JSON.stringify({
    toolCall: {
      name: 'run_command',
      args: { CommandLine: 'npm test' }
    }
  });

  try {
    const output = await new Promise<string>((resolve, reject) => {
      const child = spawn('node', [testScriptPath], {
        cwd: tmpDir,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', chunk => (stdout += chunk));
      child.stderr.on('data', chunk => (stderr += chunk));

      child.on('close', code => {
        if (code !== 0) {
          reject(new Error(`Interceptor failed with code ${code}: ${stderr}`));
        } else {
          resolve(stdout.trim());
        }
      });

      child.stdin.write(payload);
      child.stdin.end();
    });

    const parsed = JSON.parse(output);
    assert.strictEqual(parsed.decision, 'force_ask', 'Desk mode must emit force_ask');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
