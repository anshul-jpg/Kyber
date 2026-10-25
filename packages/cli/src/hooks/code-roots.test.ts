import { test } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { CodeRootsManager } from '../session/code-roots.js';

test('CodeRootsManager enforces containment and prevents Windows cross-drive traversal', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-root-test-'));
  const cfg = path.join(tmpRoot, 'roots.json');
  try {
    const manager = new CodeRootsManager(tmpRoot, cfg);

    // Inside root
    const validFile = path.join(tmpRoot, 'my-project', 'index.js');
    assert.strictEqual(manager.isPathAllowed(validFile), true, 'Path inside code root must be allowed');

    // Upward escape
    const escapedFile = path.resolve(tmpRoot, '..', 'secrets.env');
    assert.strictEqual(manager.isPathAllowed(escapedFile), false, 'Escaping upward must be blocked');

    // Cross-drive traversal simulation on Windows
    if (process.platform === 'win32') {
      const rootDrive = path.parse(tmpRoot).root.toUpperCase();
      const otherDrive = rootDrive.startsWith('C:') ? 'D:\\Windows\\System32' : 'C:\\Windows\\System32';
      assert.strictEqual(manager.isPathAllowed(otherDrive), false, 'Cross-drive path must be strictly blocked');
    }
  } finally {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {}
  }
});

test('CodeRootsManager adds and removes directories dynamically', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-roots-test-'));
  const tmp1 = path.join(tmpRoot, 'dir1');
  const tmp2 = path.join(tmpRoot, 'dir2');
  fs.mkdirSync(tmp1, { recursive: true });
  fs.mkdirSync(tmp2, { recursive: true });
  const cfg = path.join(tmpRoot, 'roots.json');
  try {
    const manager = new CodeRootsManager(tmp1, cfg);
    manager.addRoot(tmp2);

    assert.strictEqual(manager.isPathAllowed(path.join(tmp1, 'sub', 'file.txt')), true);
    assert.strictEqual(manager.isPathAllowed(path.join(tmp2, 'sub', 'file.txt')), true);

    manager.removeRoot(tmp2);
    assert.strictEqual(manager.isPathAllowed(path.join(tmp2, 'sub', 'file.txt')), false);
    assert.strictEqual(manager.isPathAllowed(path.join(tmp1, 'sub', 'file.txt')), true);
  } finally {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {}
  }
});
