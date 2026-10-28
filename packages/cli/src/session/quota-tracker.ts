import https from 'https';
import { exec } from 'child_process';
import { promisify } from 'util';
import { EventEmitter } from 'events';
import type { AgentQuota } from '@agy-companion/protocol';

const execAsync = promisify(exec);

const GET_USER_STATUS_PATH = '/exa.language_server_pb.LanguageServerService/GetUserStatus';

export const quotaEventEmitter = new EventEmitter();

interface LanguageServerConnection {
  port: number;
  token: string;
  pid: number;
}

let cachedConnection: LanguageServerConnection | null = null;
let lastConnectionCheck = 0;
const CONNECTION_CACHE_TTL = 60000; // 1 minute

let cachedQuotas: AgentQuota[] | null = null;
let lastQuotaFetch = 0;
const QUOTA_CACHE_TTL = 10000; // 10 seconds

let lastKnownUserEmail: string | null = null;
let lastKnownPlan: string | null = null;
let activeIdeModelLabel: string = 'Gemini 3.8 Flash (High)';

export function getActiveIdeModel(): string {
  return activeIdeModelLabel;
}

export function setActiveIdeModel(model: string): void {
  activeIdeModelLabel = model;
}

/**
 * Directly set language server port & CSRF token from Antigravity extension export.
 */
export function setDirectLanguageServerCredentials(port: number, token: string): void {
  if (port > 0 && token) {
    cachedConnection = { port, token, pid: process.pid };
    lastConnectionCheck = Date.now();
  }
}

/**
 * Scan running processes to find the Antigravity Language Server
 * and extract the API port + CSRF token.
 */
export async function findLanguageServer(): Promise<LanguageServerConnection | null> {
  if (cachedConnection && Date.now() - lastConnectionCheck < CONNECTION_CACHE_TTL) {
    return cachedConnection;
  }

  try {
    if (process.platform === 'win32') {
      const { stdout } = await execAsync(
        'powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name LIKE \'%language_server%\'\\" | Select-Object ProcessId, CommandLine | ConvertTo-Json -Compress"',
        { timeout: 5000, windowsHide: true }
      );
      if (stdout.trim()) {
        let procs: Array<{ ProcessId: number; CommandLine: string }> = [];
        try {
          const parsed = JSON.parse(stdout.trim());
          procs = Array.isArray(parsed) ? parsed : [parsed];
        } catch {}

        for (const proc of procs) {
          const cmd = proc.CommandLine || '';
          if (!cmd.includes('--csrf_token') || !cmd.includes('antigravity')) continue;

          const tokenMatch = cmd.match(/--csrf_token[=\s]+([a-f0-9-]+)/i);
          if (!tokenMatch) continue;
          const token = tokenMatch[1];
          const pid = proc.ProcessId;

          const ports = await getProcessListeningPorts(pid);
          for (const port of ports) {
            const works = await testApiPort(port, token);
            if (works) {
              cachedConnection = { port, token, pid };
              lastConnectionCheck = Date.now();
              return cachedConnection;
            }
          }
        }
      }
    } else {
      const { stdout } = await execAsync('pgrep -fl language_server', { timeout: 4000 });
      for (const line of stdout.split('\n')) {
        const tokenMatch = line.match(/--csrf_token[=\s]+([a-f0-9-]+)/i);
        if (!tokenMatch) continue;
        const pidMatch = line.match(/^(\d+)/);
        if (!pidMatch) continue;
        const pid = parseInt(pidMatch[1], 10);
        const token = tokenMatch[1];
        const ports = await getProcessListeningPorts(pid);
        for (const port of ports) {
          const works = await testApiPort(port, token);
          if (works) {
            cachedConnection = { port, token, pid };
            lastConnectionCheck = Date.now();
            return cachedConnection;
          }
        }
      }
    }

    return null;
  } catch (err) {
    return null;
  }
}

/**
 * Get listening TCP ports for process PID on Windows
 */
async function getProcessListeningPorts(pid: number): Promise<number[]> {
  try {
    const cmd = `powershell -NoProfile -Command "Get-NetTCPConnection -State Listen -OwningProcess ${pid} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty LocalPort"`;
    const { stdout } = await execAsync(cmd, { timeout: 4000, windowsHide: true });
    const matches = stdout.match(/\b\d{1,5}\b/g) || [];
    const ports = matches.map(m => parseInt(m, 10)).filter(p => p > 0 && p <= 65535);
    return Array.from(new Set(ports)).sort((a, b) => b - a);
  } catch {
    return [];
  }
}

/**
 * Test if a candidate port responds to GetUserStatus
 */
function testApiPort(port: number, token: string): Promise<boolean> {
  return new Promise((resolve) => {
    const data = JSON.stringify({ metadata: { ideName: 'antigravity', extensionName: 'antigravity', locale: 'en' } });
    const req = https.request(
      {
        hostname: '127.0.0.1',
        port,
        path: GET_USER_STATUS_PATH,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          'Connect-Protocol-Version': '1',
          'X-Codeium-Csrf-Token': token,
        },
        rejectUnauthorized: false,
        timeout: 2500,
      },
      (res) => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => {
          resolve(res.statusCode === 200 && body.includes('userStatus'));
        });
      }
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.write(data);
    req.end();
  });
}

function formatCountdown(resetTimeStr?: string): { ms: number; text: string } {
  if (!resetTimeStr) return { ms: 0, text: 'Active' };
  const resetMs = new Date(resetTimeStr).getTime();
  const diff = resetMs - Date.now();
  if (diff <= 0) return { ms: resetMs, text: 'Resetting now' };

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) return { ms: resetMs, text: `${days}d ${hours}h reset` };
  if (hours > 0) return { ms: resetMs, text: `${hours}h ${minutes}m reset` };
  return { ms: resetMs, text: `${minutes}m reset` };
}

function getProvider(label: string, modelId: string): 'Google' | 'Anthropic' | 'OpenAI' {
  const combined = (label + ' ' + modelId).toLowerCase();
  if (combined.includes('claude') || combined.includes('sonnet') || combined.includes('opus')) {
    return 'Anthropic';
  }
  if (combined.includes('gpt') || combined.includes('openai') || combined.includes('oss')) {
    return 'OpenAI';
  }
  return 'Google';
}

/**
 * Fetch real, live model quotas from Antigravity Language Server
 */
export async function getLiveAgentQuotas(force: boolean = false): Promise<AgentQuota[]> {
  if (force) {
    cachedQuotas = null;
    cachedConnection = null;
    lastConnectionCheck = 0;
  } else if (cachedQuotas && Date.now() - lastQuotaFetch < QUOTA_CACHE_TTL) {
    return cachedQuotas;
  }

  const conn = await findLanguageServer();
  if (!conn) {
    return [];
  }

  return new Promise((resolve) => {
    const data = JSON.stringify({ metadata: { ideName: 'antigravity', extensionName: 'antigravity', locale: 'en' } });
    const req = https.request(
      {
        hostname: '127.0.0.1',
        port: conn.port,
        path: GET_USER_STATUS_PATH,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          'Connect-Protocol-Version': '1',
          'X-Codeium-Csrf-Token': conn.token,
        },
        rejectUnauthorized: false,
        timeout: 4000,
      },
      (res) => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => {
          try {
            if (res.statusCode !== 200) {
              cachedConnection = null;
              lastConnectionCheck = 0;
              resolve([]);
              return;
            }
            const json = JSON.parse(body);
            const configs = json?.userStatus?.cascadeModelConfigData?.clientModelConfigs || [];
            const planName = json?.userStatus?.planStatus?.planInfo?.planName || 'Pro';
            const userEmail = json?.userStatus?.email || json?.userStatus?.name || '';
            const overrideModel = json?.userStatus?.cascadeModelConfigData?.defaultOverrideModelConfig?.modelOrAlias?.model || '';

            // Detect Account Switch automatically (Bug 4)
            if (lastKnownUserEmail !== null && (lastKnownUserEmail !== userEmail || lastKnownPlan !== planName)) {
              console.log(`[QuotaTracker] Account switch detected: ${lastKnownUserEmail} (${lastKnownPlan}) -> ${userEmail} (${planName})`);
              cachedQuotas = null;
              quotaEventEmitter.emit('account_switched', { email: userEmail, plan: planName });
            }
            lastKnownUserEmail = userEmail;
            lastKnownPlan = planName;

            const quotas: AgentQuota[] = [];
            for (const c of configs) {
              const label = c.label || 'Unknown Model';
              const modelId = c.modelOrAlias?.model || c.modelOrAlias || label;
              const remainingFraction = c.quotaInfo?.remainingFraction ?? 1;
              const usedPercent = Math.max(0, Math.min(100, Math.round((1 - remainingFraction) * 100)));
              const countdown = formatCountdown(c.quotaInfo?.resetTime);

              const isOverride = !!(
                overrideModel && (
                  modelId === overrideModel ||
                  c.modelOrAlias?.model === overrideModel ||
                  c.modelOrAlias === overrideModel ||
                  label.toLowerCase() === overrideModel.toLowerCase()
                )
              );

              if (isOverride) {
                activeIdeModelLabel = label;
              }

              quotas.push({
                id: modelId,
                name: label,
                provider: getProvider(label, modelId),
                badge: `${planName} Quota`,
                isActive: isOverride,
                usedPercent,
                usedUnits: usedPercent,
                totalUnits: 100,
                unitLabel: '%',
                resetTimestamp: countdown.ms,
                resetWindowText: countdown.text,
                status: remainingFraction < 0.15 ? 'exhausted' : remainingFraction < 0.4 ? 'moderate' : 'optimal',
              });
            }

            // Fallback: if no model had isActive, mark the activeIdeModelLabel
            if (quotas.length > 0 && !quotas.some(q => q.isActive)) {
              const match = quotas.find(q =>
                q.name.toLowerCase().includes(activeIdeModelLabel.toLowerCase()) ||
                activeIdeModelLabel.toLowerCase().includes(q.name.toLowerCase())
              );
              if (match) {
                match.isActive = true;
              } else if (quotas[0]) {
                quotas[0].isActive = true;
              }
            }

            if (quotas.length > 0) {
              cachedQuotas = quotas;
              lastQuotaFetch = Date.now();
            }
            resolve(quotas);
          } catch {
            resolve([]);
          }
        });
      }
    );

    req.on('error', () => {
      cachedConnection = null;
      lastConnectionCheck = 0;
      resolve([]);
    });
    req.on('timeout', () => {
      req.destroy();
      cachedConnection = null;
      lastConnectionCheck = 0;
      resolve([]);
    });
    req.write(data);
    req.end();
  });
}
