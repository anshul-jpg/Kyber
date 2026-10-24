import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { RecentProject, WorkspaceState } from '@agy-companion/protocol';
import { installHook } from '../commands/install-hook.js';

export function getRecentProjects(currentWorkspaces: WorkspaceState[] = []): RecentProject[] {
  const home = os.homedir();
  const storageCandidates = [
    path.join(home, 'AppData', 'Roaming', 'Antigravity IDE', 'User', 'globalStorage', 'storage.json'),
    path.join(home, 'AppData', 'Roaming', 'Code', 'User', 'globalStorage', 'storage.json'),
    path.join(home, 'Library', 'Application Support', 'Antigravity IDE', 'User', 'globalStorage', 'storage.json'),
    path.join(home, '.config', 'Antigravity IDE', 'User', 'globalStorage', 'storage.json'),
  ];

  const storagePath = storageCandidates.find(p => fs.existsSync(p));
  if (!storagePath) {
    return [];
  }

  try {
    const raw = fs.readFileSync(storagePath, 'utf8');
    const data = JSON.parse(raw);
    const workspacesMap = data.profileAssociations?.workspaces || {};
    const keys = Object.keys(workspacesMap);

    const openPaths = new Set(
      currentWorkspaces.map(w => path.resolve(w.path).toLowerCase())
    );

    const projects: RecentProject[] = [];

    for (const key of keys) {
      let resolvedPath = '';
      try {
        if (key.startsWith('file://')) {
          resolvedPath = fileURLToPath(key);
        } else {
          resolvedPath = path.resolve(key);
        }
      } catch {
        continue;
      }

      if (!resolvedPath || !fs.existsSync(resolvedPath)) continue;

      try {
        const stat = fs.statSync(resolvedPath);
        if (!stat.isDirectory()) continue;

        const norm = path.resolve(resolvedPath);
        const normLower = norm.toLowerCase();
        const name = path.basename(norm);
        const isOpen = openPaths.has(normLower);
        const hasHook = fs.existsSync(path.join(norm, '.agents', 'hooks.json'));

        projects.push({
          name: name || norm,
          path: norm,
          isOpen,
          hasHook,
          lastModified: stat.mtimeMs,
        });
      } catch {
        // Skip inaccessible entries
      }
    }

    // Sort: open projects first, then by last modified descending
    projects.sort((a, b) => {
      if (a.isOpen && !b.isOpen) return -1;
      if (!a.isOpen && b.isOpen) return 1;
      return (b.lastModified || 0) - (a.lastModified || 0);
    });

    return projects.slice(0, 15);
  } catch (err: any) {
    console.warn('[RecentProjects] Failed to read recent workspaces:', err.message);
    return [];
  }
}

export function resolveIdeExecutable(): string | null {
  const home = os.homedir();
  let cachedIdePath: string | null = null;
  const idePathFile = path.join(home, '.agy-ide-path');
  if (fs.existsSync(idePathFile)) {
    try {
      const p = fs.readFileSync(idePathFile, 'utf8').trim();
      if (p && fs.existsSync(p)) {
        if (p.endsWith('.cmd')) {
          const parentDir = path.dirname(path.dirname(p));
          const siblingExe = path.join(parentDir, 'Antigravity IDE.exe');
          if (fs.existsSync(siblingExe)) {
            cachedIdePath = siblingExe;
          }
        } else {
          cachedIdePath = p;
        }
      }
    } catch {}
  }

  const rawCandidateExes = [
    cachedIdePath && cachedIdePath.endsWith('.exe') ? cachedIdePath : null,
    process.env.ANTIGRAVITY_IDE_EXEC_PATH && process.env.ANTIGRAVITY_IDE_EXEC_PATH.endsWith('.exe')
      ? process.env.ANTIGRAVITY_IDE_EXEC_PATH
      : null,
    path.join(home, 'AppData', 'Local', 'Programs', 'Antigravity IDE', 'Antigravity IDE.exe'),
    path.join(home, 'AppData', 'Local', 'Programs', 'Antigravity', 'Antigravity.exe'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Antigravity IDE', 'Antigravity IDE.exe'),
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Antigravity IDE', 'Antigravity IDE.exe'),
    '/Applications/Antigravity IDE.app/Contents/MacOS/Electron',
    '/usr/bin/antigravity-ide',
    '/snap/bin/antigravity-ide',
  ].filter(Boolean) as string[];

  for (const exe of rawCandidateExes) {
    if (fs.existsSync(exe)) return exe;
  }
  return null;
}

export async function launchRecentProject(
  targetPath?: string,
  onForwardToExtension?: (projectPath: string) => boolean,
  options?: { isRestart?: boolean }
): Promise<{ ok: boolean; message: string }> {
  let norm: string | undefined = undefined;
  if (targetPath) {
    const resolved = path.resolve(targetPath);
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      norm = resolved;
    }
  }

  // 1. Auto-provision Antigravity Companion hook if workspace folder is known
  if (norm) {
    try {
      installHook(norm);
    } catch (err: any) {
      console.warn(`[RecentProjects] Hook auto-provision warning for ${norm}:`, err.message);
    }
  }

  // 2. If VS Code Extension is attached and not a restart, forward to extension host
  if (!options?.isRestart && norm && onForwardToExtension && onForwardToExtension(norm)) {
    return { ok: true, message: `Opened ${path.basename(norm)} in IDE` };
  }

  // 3. Fallback: launch IDE executable directly
  const home = os.homedir();
  let cachedIdePath: string | null = null;
  const idePathFile = path.join(home, '.agy-ide-path');
  if (fs.existsSync(idePathFile)) {
    try {
      const p = fs.readFileSync(idePathFile, 'utf8').trim();
      if (p && fs.existsSync(p)) {
        if (p.endsWith('.cmd')) {
          // If a .cmd was mistakenly cached, resolve sibling Antigravity IDE.exe
          const parentDir = path.dirname(path.dirname(p));
          const siblingExe = path.join(parentDir, 'Antigravity IDE.exe');
          if (fs.existsSync(siblingExe)) {
            cachedIdePath = siblingExe;
          }
        } else {
          cachedIdePath = p;
        }
      }
    } catch {}
  }

  // Clean environment so child process doesn't inherit dead VSCODE_IPC_HOOK or ELECTRON_RUN_AS_NODE
  const cleanEnv = { ...process.env };
  for (const k of Object.keys(cleanEnv)) {
    if (k.startsWith('VSCODE_') || k.startsWith('ELECTRON_')) {
      delete cleanEnv[k];
    }
  }

  const rawCandidateExes = [
    // 1. Prioritize direct native GUI executables FIRST
    cachedIdePath && cachedIdePath.endsWith('.exe') ? cachedIdePath : null,
    process.env.ANTIGRAVITY_IDE_EXEC_PATH && process.env.ANTIGRAVITY_IDE_EXEC_PATH.endsWith('.exe')
      ? process.env.ANTIGRAVITY_IDE_EXEC_PATH
      : null,
    path.join(home, 'AppData', 'Local', 'Programs', 'Antigravity IDE', 'Antigravity IDE.exe'),
    path.join(home, 'AppData', 'Local', 'Programs', 'Antigravity', 'Antigravity.exe'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Antigravity IDE', 'Antigravity IDE.exe'),
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Antigravity IDE', 'Antigravity IDE.exe'),
    // POSIX binaries
    '/Applications/Antigravity IDE.app/Contents/MacOS/Electron',
    '/usr/bin/antigravity-ide',
    '/snap/bin/antigravity-ide',
    // 2. Fallbacks
    cachedIdePath,
    process.env.ANTIGRAVITY_IDE_EXEC_PATH,
    path.join(home, 'AppData', 'Local', 'Programs', 'Antigravity IDE', 'bin', 'antigravity-ide.cmd'),
    path.join(home, 'AppData', 'Local', 'Programs', 'Antigravity', 'bin', 'antigravity.cmd'),
    'antigravity-ide',
    'antigravity',
    'code',
  ].filter(Boolean) as string[];

  // Deduplicate candidates preserving priority order
  const executableCandidates: string[] = Array.from(new Set(rawCandidateExes));

  const args: string[] = [];
  if (norm) {
    args.push(norm);
  }

  for (const exe of executableCandidates) {
    try {
      if (fs.existsSync(exe) || !exe.includes(path.sep)) {
        const isCmd = exe.endsWith('.cmd') || exe.endsWith('.bat');
        const spawnCwd = norm || (exe.includes(path.sep) ? path.dirname(exe) : process.cwd());
        let child: import('child_process').ChildProcess;

        if (isCmd && process.platform === 'win32') {
          // Quote properly to prevent spaces from breaking cmd.exe
          child = spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `"${exe}"`, ...args], {
            detached: true,
            stdio: 'ignore',
            shell: false,
            windowsVerbatimArguments: true,
            windowsHide: true,
            cwd: spawnCwd,
            env: cleanEnv,
          });
        } else {
          child = spawn(exe, args, {
            detached: true,
            stdio: 'ignore',
            shell: false,
            windowsHide: true,
            cwd: spawnCwd,
            env: cleanEnv,
          });
        }

        child.on('error', (err) => {
          console.warn(`[RecentProjects] Failed to spawn ${exe}:`, err.message);
        });
        child.unref();

        // Cache successful IDE path for subsequent calls (only if native .exe)
        if (exe.endsWith('.exe')) {
          try {
            fs.writeFileSync(idePathFile, exe, 'utf8');
          } catch {}
        }

        const label = norm ? path.basename(norm) : 'session';
        return { ok: true, message: `Launched ${label} in IDE` };
      }
    } catch (err: any) {
      console.warn(`[RecentProjects] Error attempting to spawn ${exe}:`, err.message);
    }
  }

  return {
    ok: false,
    message: `Could not find a working IDE executable to relaunch. Checked: ${executableCandidates.slice(0, 3).join(', ')}`,
  };
}
