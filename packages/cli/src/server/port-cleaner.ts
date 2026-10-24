import { execSync } from 'child_process';

export function killStalePort(port: number): void {
  if (process.platform !== 'win32') return;
  try {
    const out = execSync(`netstat -ano -p tcp | findstr :${port}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
    const myPid = process.pid;
    for (const line of out.split('\n')) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 5 && parts[1].endsWith(`:${port}`) && parts[3] === 'LISTENING') {
        const pid = parseInt(parts[parts.length - 1], 10);
        if (pid && pid !== myPid) {
          console.log(`[PortProtection] Freeing port ${port} by terminating stale PID ${pid}`);
          try {
            execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore', windowsHide: true });
          } catch {}
        }
      }
    }
  } catch {}
}
