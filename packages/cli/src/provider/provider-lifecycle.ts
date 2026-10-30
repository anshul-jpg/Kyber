import os from 'os';
import fs from 'fs';
import path from 'path';
import { execSync, spawn } from 'child_process';
import { HostTelemetry } from '@agy-companion/protocol';
import { launchRecentProject, resolveIdeExecutable } from '../session/recent-projects.js';

export interface ProviderDefinition {
  id: string;
  name: string;
  type: 'ide' | 'cli';
  windowsProcessNames: string[];
  posixProcessNames: string[];
  defaultExecutable: string;
}

export const SUPPORTED_PROVIDERS: Record<string, ProviderDefinition> = {
  antigravity: {
    id: 'antigravity',
    name: 'Antigravity IDE',
    type: 'ide',
    windowsProcessNames: ['Antigravity IDE.exe', 'Antigravity.exe'],
    posixProcessNames: ['Antigravity IDE', 'antigravity-ide'],
    defaultExecutable: 'antigravity-ide',
  },
};

let previousCpuUsage: { idle: number; total: number } | null = null;

export function getCpuPercent(): number {
  try {
    const cpus = os.cpus();
    let idle = 0;
    let total = 0;

    for (const cpu of cpus) {
      idle += cpu.times.idle;
      total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.irq + cpu.times.idle;
    }

    if (!previousCpuUsage) {
      previousCpuUsage = { idle, total };
      const load = os.loadavg();
      if (load && load[0] > 0) {
        return Math.min(100, Math.round((load[0] / cpus.length) * 100));
      }
      return 5;
    }

    const idleDelta = idle - previousCpuUsage.idle;
    const totalDelta = total - previousCpuUsage.total;
    previousCpuUsage = { idle, total };

    if (totalDelta <= 0) return 0;
    const percentage = Math.round((1 - idleDelta / totalDelta) * 100);
    return Math.max(0, Math.min(100, percentage));
  } catch {
    return 0;
  }
}

function checkGlobalHookInstalled(): boolean {
  try {
    const globalConfigDir = path.join(os.homedir(), '.gemini', 'config');
    return fs.existsSync(path.join(globalConfigDir, 'hooks.json')) && fs.existsSync(path.join(globalConfigDir, 'interceptor.js'));
  } catch {
    return false;
  }
}

function detectHostIdePolicy(): 'always-proceed' | 'always-ask' | 'unknown' {
  try {
    const candidates = [
      path.join(process.env.APPDATA || '', 'Antigravity IDE', 'User', 'settings.json'),
      path.join(os.homedir(), '.config', 'Antigravity IDE', 'User', 'settings.json'),
      path.join(os.homedir(), 'Library', 'Application Support', 'Antigravity IDE', 'User', 'settings.json'),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        const s = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (s['antigravity.toolExecutionPolicy'] === 'always-proceed' || s['antigravity.autoExecutionPolicy'] === 'always-proceed') {
          return 'always-proceed';
        }
        if (s['antigravity.toolExecutionPolicy'] === 'always-ask') {
          return 'always-ask';
        }
      }
    }
  } catch {}
  return 'unknown';
}

export function getHostTelemetry(ideStatus: 'active' | 'dormant', activeProvider: string = 'antigravity'): HostTelemetry {
  const totalBytes = os.totalmem();
  const freeBytes = os.freemem();
  const usedBytes = Math.max(0, totalBytes - freeBytes);

  const totalMemMb = Math.round(totalBytes / (1024 * 1024));
  const freeMemMb = Math.round(freeBytes / (1024 * 1024));
  const usedMemMb = Math.round(usedBytes / (1024 * 1024));
  const usedMemPercent = totalMemMb > 0 ? Math.round((usedMemMb / totalMemMb) * 100) : 0;

  return {
    cpuPercent: getCpuPercent(),
    totalMemMb,
    usedMemMb,
    freeMemMb,
    usedMemPercent,
    platform: process.platform,
    uptimeSeconds: Math.round(os.uptime()),
    activeProvider,
    ideStatus,
    hostIdePolicy: detectHostIdePolicy(),
    isGlobalHookInstalled: checkGlobalHookInstalled(),
  };
}

export function closeProvider(providerId: string = 'antigravity', force: boolean = true): {
  ok: boolean;
  message: string;
  ramFreedMb?: number;
} {
  const provider = SUPPORTED_PROVIDERS[providerId] || SUPPORTED_PROVIDERS.antigravity;
  const beforeFree = os.freemem();
  const isWindows = process.platform === 'win32';
  const processNames = isWindows ? provider.windowsProcessNames : provider.posixProcessNames;

  let killedAny = false;
  for (const proc of processNames) {
    try {
      if (isWindows) {
        const flag = force ? '/F /T' : '';
        execSync(`taskkill /IM "${proc}" ${flag}`.trim(), { stdio: 'ignore', windowsHide: true });
      } else {
        const signal = force ? '-9' : '-15';
        execSync(`pkill ${signal} -f "${proc}"`, { stdio: 'ignore' });
      }
      killedAny = true;
    } catch {
      // Process might already be closed or refused graceful close
    }
  }

  // Allow OS memory management a brief tick to reflect reclaimed pages
  const afterFree = os.freemem();
  const ramFreedMb = Math.max(0, Math.round((afterFree - beforeFree) / (1024 * 1024)));

  return {
    ok: true,
    message: killedAny ? `Closed ${provider.name}` : `${provider.name} was not running`,
    ramFreedMb: ramFreedMb > 0 ? ramFreedMb : undefined,
  };
}

export function isProcessRunning(imageName: string): boolean {
  try {
    if (process.platform === 'win32') {
      const stdout = execSync(`tasklist /NH /FI "IMAGENAME eq ${imageName}"`, {
        stdio: ['pipe', 'pipe', 'ignore'],
        encoding: 'utf8',
        windowsHide: true,
      });
      return (
        stdout.toLowerCase().includes(imageName.toLowerCase()) &&
        !stdout.toLowerCase().includes('no tasks are running')
      );
    } else {
      const stdout = execSync(`pgrep -f "${imageName}"`, {
        stdio: ['pipe', 'pipe', 'ignore'],
        encoding: 'utf8',
      });
      return stdout.trim().length > 0;
    }
  } catch {
    return false;
  }
}

let isRestarting = false;

export async function restartProvider(
  providerId: string = 'antigravity',
  workspacePath?: string
): Promise<{ ok: boolean; message: string }> {
  if (isRestarting) {
    return { ok: false, message: 'Restart already in progress' };
  }
  isRestarting = true;
  try {
    const provider = SUPPORTED_PROVIDERS[providerId] || SUPPORTED_PROVIDERS.antigravity;
    const isWindows = process.platform === 'win32';
    const normPath = workspacePath ? path.resolve(workspacePath) : '';

    if (isWindows && providerId === 'antigravity') {
      const exePath =
        resolveIdeExecutable() ||
        path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Antigravity IDE', 'Antigravity IDE.exe');

      const globalLog = path.join(os.homedir(), '.agy-restart.log');
      const wsLog = normPath ? path.join(normPath, '.agents', 'restart.log') : '';
      const stateFile = normPath ? path.join(normPath, '.agents', 'restart-state.json') : '';

      try {
        if (stateFile) {
          fs.mkdirSync(path.dirname(stateFile), { recursive: true });
          fs.writeFileSync(stateFile, JSON.stringify({
            timestamp: new Date().toISOString(),
            providerId,
            workspacePath: normPath,
            status: 'initiated',
            exePath,
          }, null, 2), 'utf8');
        }
      } catch {}

      const workingDir = normPath || path.dirname(exePath);
      const startCmd = normPath
        ? `start "" /D "${workingDir}" "${exePath}" "${normPath}"`
        : `start "" /D "${workingDir}" "${exePath}"`;

      const batPath = path.join(os.homedir(), '.agy-companion-restart.bat');
      const batContent = [
        '@echo off',
        'setlocal',
        `set LOG="${globalLog}"`,
        wsLog ? `set WSLOG="${wsLog}"` : 'set WSLOG=',
        'echo ================================================================ >> %LOG%',
        `echo [%date% %time%] [RESTART INITIATED] Target: "${normPath}" >> %LOG%`,
        `echo [%date% %time%] Executable: "${exePath}" >> %LOG%`,
        'if not "%WSLOG%"=="" (',
        '  echo ================================================================ >> %WSLOG%',
        `  echo [%date% %time%] [RESTART INITIATED] Target: "${normPath}" >> %WSLOG%`,
        ')',
        'echo [%date% %time%] Step 1: Killing Antigravity processes (/F /T)... >> %LOG%',
        'taskkill /F /T /IM "Antigravity IDE.exe" >> %LOG% 2>&1',
        'taskkill /F /T /IM "Antigravity.exe" >> %LOG% 2>&1',
        'echo [%date% %time%] Step 2: Polling until processes are completely terminated... >> %LOG%',
        'set /a COUNT=0',
        ':WAIT_LOOP',
        'set /a COUNT+=1',
        'tasklist /NH /FI "IMAGENAME eq Antigravity IDE.exe" 2>nul | find /i "Antigravity IDE.exe" >nul',
        'if not errorlevel 1 (',
        '  if %COUNT% LEQ 15 (',
        '    ping 127.0.0.1 -n 2 >nul 2>&1',
        '    goto WAIT_LOOP',
        '  ) else (',
        '    echo [%date% %time%] Warning: Polling timeout reached after %COUNT% checks. >> %LOG%',
        '  )',
        ') else (',
        '  echo [%date% %time%] Step 3: All processes cleanly terminated after %COUNT% check(s). >> %LOG%',
        ')',
        'echo [%date% %time%] Settling lock files (1s delay)... >> %LOG%',
        'ping 127.0.0.1 -n 2 >nul 2>&1',
        `echo [%date% %time%] Step 4: Spawning new IDE process: ${startCmd} >> %LOG%`,
        startCmd,
        'set LAUNCH_ERR=%ERRORLEVEL%',
        'echo [%date% %time%] Spawn executed with exit code %LAUNCH_ERR% >> %LOG%',
        'ping 127.0.0.1 -n 3 >nul 2>&1',
        'echo [%date% %time%] Step 5: Post-spawn verification: >> %LOG%',
        'tasklist /NH /FI "IMAGENAME eq Antigravity IDE.exe" >> %LOG% 2>&1',
        'echo [%date% %time%] [RESTART SEQUENCE FINISHED] >> %LOG%',
        'if not "%WSLOG%"=="" (',
        '  echo [%date% %time%] [RESTART SEQUENCE FINISHED] >> %WSLOG%',
        ')',
        'endlocal',
        'del "%~f0" >nul 2>&1 & exit',
      ].join('\r\n') + '\r\n';

      fs.writeFileSync(batPath, batContent, 'utf8');

      // Strip dead electron/vscode env vars from spawned process
      const cleanEnv = { ...process.env };
      for (const k of Object.keys(cleanEnv)) {
        if (k.startsWith('VSCODE_') || k.startsWith('ELECTRON_')) {
          delete cleanEnv[k];
        }
      }

      const child = spawn(process.env.ComSpec || 'cmd.exe', ['/c', batPath], {
        detached: true,
        stdio: 'ignore',
        windowsVerbatimArguments: true,
        windowsHide: true,
        env: cleanEnv,
      });
      child.unref();

      return {
        ok: true,
        message: `Restart sequence dispatched for ${provider.name}${normPath ? ` in ${normPath}` : ''}. Detailed logs: ${globalLog}`,
      };
    }

    // POSIX or CLI fallback
    closeProvider(providerId, true);
    await new Promise(r => setTimeout(r, 2000));
    const result = await launchRecentProject(workspacePath, undefined, { isRestart: true });
    return {
      ok: result.ok,
      message: result.ok
        ? `Restarted ${provider.name}${workspacePath ? ` in ${workspacePath}` : ''}`
        : `Failed to launch ${provider.name}: ${result.message}`,
    };
  } catch (err: any) {
    return { ok: false, message: `Failed to restart: ${err.message}` };
  } finally {
    isRestarting = false;
  }
}

