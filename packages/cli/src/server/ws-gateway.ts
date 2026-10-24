import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import {
  DEFAULT_DAEMON_PORT,
  WsClientMessage,
  WsServerMessage,
  ApprovalRequest,
  ApprovalDecisionPayload,
  WorkspaceState,
  ExecutionPolicy,
  CompanionMode,
  AudioAttachment,
  EditorTab,
  decodePairingTicket,
  RecentProject,
  TerminalEntry,
  HostTelemetry,
} from '@agy-companion/protocol';
import { HookIpcServer, getWorkspaceGitChanges } from '../hooks/ipc-server.js';
import { WorkspaceManager } from '../session/workspace-manager.js';
import { IdeTranscriptWatcher } from '../session/ide-watcher.js';
import { getRecentProjects, launchRecentProject } from '../session/recent-projects.js';
import { closeProvider, restartProvider, getHostTelemetry } from '../provider/provider-lifecycle.js';
import { killStalePort } from './port-cleaner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Resolve path to packages/web/dist
const WEB_DIST_PATH = path.resolve(__dirname, '../../../web/dist');

export class WsGateway {
  private httpServer: http.Server | null = null;
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();
  private phoneClients: Set<WebSocket> = new Set();
  private lastPhoneActivity: number = Date.now();
  private extensionClients: Set<WebSocket> = new Set();
  private extensionWorkspaces: Map<WebSocket, string> = new Map();
  private ideWatcher: IdeTranscriptWatcher;
  private pendingHostPrompts: Array<{
    prompt: string;
    workspaceId: string;
    images: { base64: string; name: string }[];
    audio?: AudioAttachment;
    model?: string;
  }> = [];
  private activeTabs: EditorTab[] = [];

  public getActiveTabs(workspaceId?: string): EditorTab[] {
    if (this.activeTabs.length > 0) {
      return this.activeTabs;
    }
    try {
      const ws = (workspaceId ? this.workspaceManager.getWorkspace(workspaceId) : null) || this.workspaceManager.listWorkspaces()[0];
      const cwd = ws?.path || process.cwd();
      const changes = getWorkspaceGitChanges(cwd);
      if (changes.length > 0) {
        return changes.slice(0, 10).map((c, idx) => ({
          label: c.file,
          path: c.relativePath,
          isActive: idx === 0,
          isDirty: true,
        }));
      }
      const dirents = fs.readdirSync(cwd, { withFileTypes: true });
      const ignored = new Set(['.git', 'node_modules', 'dist', '.tempmediaStorage', '.gemini', 'coverage', '.idea', '.vscode']);
      const files = dirents
        .filter(d => !d.isDirectory() && !ignored.has(d.name) && !d.name.startsWith('.'))
        .slice(0, 8);
      if (files.length > 0) {
        return files.map((f, idx) => ({
          label: f.name,
          path: f.name,
          isActive: idx === 0,
          isDirty: false,
        }));
      }
    } catch {}
    return [];
  }

  private resolveWorkspace(workspaceId?: string | null): WorkspaceState {
    if (workspaceId) {
      const match = this.workspaceManager.getWorkspace(workspaceId);
      if (match) return match;
    }
    const list = this.workspaceManager.listWorkspaces();
    if (list.length > 0) return list[0];
    return {
      id: 'default',
      name: path.basename(process.cwd()),
      path: process.cwd(),
      status: 'idle',
      lastActive: Date.now(),
      pendingApprovals: [],
    };
  }

  public isIdeActive(): boolean {
    return Array.from(this.extensionClients).some(c => c.readyState === WebSocket.OPEN);
  }

  public getApkDetails(): { hasApk: boolean; apkBuildTime?: number; size?: number } {
    try {
      const apkPath = path.resolve(__dirname, '../../../../packages/web/android/app/build/outputs/apk/debug/app-debug.apk');
      if (fs.existsSync(apkPath)) {
        const stat = fs.statSync(apkPath);
        return { hasApk: true, apkBuildTime: stat.mtimeMs, size: stat.size };
      }
    } catch {}
    return { hasApk: false };
  }

  constructor(
    private hookIpc: HookIpcServer,
    private workspaceManager: WorkspaceManager,
    private port: number = DEFAULT_DAEMON_PORT
  ) {
    this.ideWatcher = new IdeTranscriptWatcher();
    this.setupHookListeners();
    this.setupIdeWatcher();

    // Periodic Host Telemetry broadcast (every 6s when phone clients connected)
    setInterval(() => {
      if (this.phoneClients.size > 0) {
        this.broadcast({
          type: 'server:host_telemetry',
          telemetry: getHostTelemetry(this.isIdeActive() ? 'active' : 'dormant'),
        });
      }
    }, 6000);
  }

  private getGlobalModeFilePath(): string {
    return path.resolve(os.homedir(), '.agy-companion-mode');
  }

  public getPhoneClientCount(): number {
    return this.phoneClients.size;
  }

  public getMode(): CompanionMode {
    try {
      // 1. Global ~/.agy-companion-mode is primary authority
      const globalPath = this.getGlobalModeFilePath();
      if (fs.existsSync(globalPath)) {
        const val = fs.readFileSync(globalPath, 'utf8').trim().toLowerCase();
        if (val === 'desk' || val === 'remote' || val === 'auto' || val === 'autonomous') return val as CompanionMode;
      }
      // 2. Fallback to workspace-specific override if present
      const cwdPath = path.resolve(process.cwd(), '.agents/companion-mode');
      if (fs.existsSync(cwdPath)) {
        const val = fs.readFileSync(cwdPath, 'utf8').trim().toLowerCase();
        if (val === 'desk' || val === 'remote' || val === 'auto' || val === 'autonomous') return val as CompanionMode;
      }
    } catch {}
    return 'remote';
  }

  public setMode(mode: CompanionMode): void {
    try {
      // Always write to global file so all workspaces stay in sync
      const globalPath = this.getGlobalModeFilePath();
      fs.writeFileSync(globalPath, mode, 'utf8');

      // Record target device if remote or desk
      if (mode === 'remote' || mode === 'desk') {
        const targetPath = path.resolve(os.homedir(), '.agy-companion-target');
        try { fs.writeFileSync(targetPath, mode, 'utf8'); } catch {}
      }

      // Also sync to workspace .agents/companion-mode if directory exists
      const cwdPath = path.resolve(process.cwd(), '.agents/companion-mode');
      if (fs.existsSync(path.dirname(cwdPath))) {
        fs.writeFileSync(cwdPath, mode, 'utf8');
      }

      // Sync across all registered workspaces
      for (const ws of this.workspaceManager.listWorkspaces()) {
        try {
          const wsAgentsMode = path.resolve(ws.path, '.agents/companion-mode');
          if (fs.existsSync(path.dirname(wsAgentsMode))) {
            fs.writeFileSync(wsAgentsMode, mode, 'utf8');
          }
        } catch {}
      }

      console.log(`[WsGateway] Mode set to: ${mode} (saved globally to ${globalPath})`);
      this.broadcast({
        type: 'server:mode_updated',
        mode,
      });
    } catch (err) {
      console.error('[WsGateway] Failed to save mode:', err);
    }
  }

  private getGlobalPolicyFilePath(): string {
    return path.resolve(os.homedir(), '.agy-companion-policy');
  }

  public getAuthToken(): string {
    const tokenPath = path.resolve(os.homedir(), '.agy-companion-token');
    try {
      if (fs.existsSync(tokenPath)) {
        const token = fs.readFileSync(tokenPath, 'utf8').trim();
        if (token.length >= 16) return token;
      }
    } catch {}
    // Generate secure token on first run if none exists (finding 3)
    const newToken = crypto.randomBytes(24).toString('hex');
    try {
      fs.writeFileSync(tokenPath, newToken, 'utf8');
      console.log(`[WsGateway] Generated secure pairing token at ${tokenPath}`);
    } catch (err) {
      console.error('[WsGateway] Failed to save pairing token to disk:', err);
    }
    return newToken;
  }

  public isRequestAuthorized(req: http.IncomingMessage, parsedUrl: URL): boolean {
    const rawIp = req.socket.remoteAddress || '';
    const cleanIp = rawIp.replace(/^::ffff:/, '');
    const isLocal = cleanIp === '127.0.0.1' || cleanIp === '::1' || cleanIp === 'localhost';
    if (isLocal) return true;

    const expectedToken = this.getAuthToken();
    if (!expectedToken) return false;

    // Timing-safe comparison helper (finding 2)
    const safeCompare = (a: string, b: string): boolean => {
      if (typeof a !== 'string' || typeof b !== 'string') return false;
      const bufA = Buffer.from(a);
      const bufB = Buffer.from(b);
      if (bufA.length !== bufB.length) return false;
      return crypto.timingSafeEqual(bufA, bufB);
    };

    const authHeader = req.headers['authorization'];
    if (authHeader) {
      const parts = authHeader.split(' ');
      if (parts.length === 2 && parts[0].toLowerCase() === 'bearer' && safeCompare(parts[1].trim(), expectedToken)) {
        return true;
      }
    }

    const qToken = parsedUrl.searchParams.get('token');
    if (qToken && safeCompare(qToken.trim(), expectedToken)) {
      return true;
    }

    const qTicket = parsedUrl.searchParams.get('ticket');
    if (qTicket) {
      const decoded = decodePairingTicket(qTicket);
      if (decoded && safeCompare(decoded.token, expectedToken)) {
        return true;
      }
    }

    return false;
  }

  public getExecutionPolicy(): ExecutionPolicy {
    try {
      const globalPath = this.getGlobalPolicyFilePath();
      if (fs.existsSync(globalPath)) {
        const val = fs.readFileSync(globalPath, 'utf8').trim().toLowerCase();
        if (val === 'force_ask' || val === 'always_proceed') return val as ExecutionPolicy;
      }
    } catch {}
    return 'force_ask';
  }

  public setExecutionPolicy(policy: ExecutionPolicy): void {
    try {
      const globalPath = this.getGlobalPolicyFilePath();
      fs.writeFileSync(globalPath, policy, 'utf8');
      console.log(`[WsGateway] Execution policy set to: ${policy} (saved globally to ${globalPath})`);
      this.broadcast({
        type: 'server:execution_policy_updated',
        policy,
      });
    } catch (err) {
      console.error('[WsGateway] Failed to save execution policy:', err);
    }
  }

  private setupIdeWatcher(): void {
    // Auto-discover existing active Antigravity IDE conversation
    this.ideWatcher.autoDiscoverActiveConversation();

    this.ideWatcher.on('message', message => {
      const activeWs = this.workspaceManager.listWorkspaces()[0];
      const wsId = activeWs ? activeWs.id : 'default';
      this.broadcast({
        type: 'server:chat_message',
        workspaceId: wsId,
        message,
      });
    });

    this.ideWatcher.on('thought', (thought: string) => {
      const activeWs = this.workspaceManager.listWorkspaces()[0];
      const wsId = activeWs ? activeWs.id : 'default';
      this.broadcast({
        type: 'server:stream_thought',
        workspaceId: wsId,
        thought,
      });
    });

    this.ideWatcher.on('terminal_output', (entry: TerminalEntry) => {
      this.broadcast({
        type: 'server:terminal_output',
        entry,
      });
    });

    this.ideWatcher.on('conversation_switched', data => {
      const activeWs = this.workspaceManager.listWorkspaces()[0];
      const wsId = activeWs ? activeWs.id : 'default';
      this.broadcast({
        type: 'server:history',
        workspaceId: wsId,
        messages: data.history,
        conversationTitle: data.title,
      });
    });
  }

  private setupHookListeners(): void {
    this.hookIpc.on('approval_requested', (request: ApprovalRequest, hookContext?: any) => {
      if (hookContext?.transcriptPath) {
        this.ideWatcher.setTranscriptPath(hookContext.transcriptPath);
      }
      this.workspaceManager.addPendingApproval(request);
      this.broadcast({
        type: 'server:approval_requested',
        request,
      });
    });

    this.hookIpc.on('approval_resolved', (payload: ApprovalDecisionPayload) => {
      this.workspaceManager.removePendingApproval(payload.requestId);
      this.broadcast({
        type: 'server:approval_resolved',
        requestId: payload.requestId,
        decision: payload.decision,
      });
    });

    this.hookIpc.on('approval_paused', (request: ApprovalRequest) => {
      this.workspaceManager.addPendingApproval(request);
      this.broadcast({
        type: 'server:approval_paused',
        request,
      });
    });

    this.hookIpc.on('approval_timeout', (request: ApprovalRequest) => {
      this.workspaceManager.removePendingApproval(request.id);
      this.broadcast({
        type: 'server:approval_resolved',
        requestId: request.id,
        decision: 'timeout',
      });
    });

    this.workspaceManager.on('workspaces_changed', (workspaces: WorkspaceState[]) => {
      this.broadcast({
        type: 'server:workspaces_updated',
        workspaces,
      });
    });
  }

  private serveStatic(reqUrl: string, res: http.ServerResponse): boolean {
    if (!fs.existsSync(WEB_DIST_PATH)) {
      return false;
    }

    let filePath = path.join(WEB_DIST_PATH, reqUrl === '/' ? 'index.html' : reqUrl.split('?')[0]);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(WEB_DIST_PATH, 'index.html');
    }

    if (!fs.existsSync(filePath)) return false;

    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.ico': 'image/x-icon',
    };

    const contentType = mimeTypes[ext] || 'application/octet-stream';
    try {
      const content = fs.readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
      return true;
    } catch {
      return false;
    }
  }

  public start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.httpServer = http.createServer((req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        const url = req.url || '/';
        const parsedUrl = new URL(url, 'http://localhost');

        // Allow public/benign endpoints without pairing token
        const isPublicEndpoint =
          url === '/health' ||
          url === '/api/health' ||
          url === '/api/apk-status' ||
          url === '/api/version' ||
          url === '/download/app.apk' ||
          url === '/app.apk' ||
          !url.startsWith('/api/');

        if (!isPublicEndpoint && !this.isRequestAuthorized(req, parsedUrl)) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized: Valid pairing token required' }));
          return;
        }

        if (url === '/health' || url === '/api/health') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              status: 'ok',
              version: '0.1.0',
              workspacesCount: this.workspaceManager.listWorkspaces().length,
              pendingApprovals: this.hookIpc.getPendingRequests().length,
              connectedPhoneCount: this.phoneClients.size,
              lastPhoneActivity: this.lastPhoneActivity,
              mode: this.getMode(),
            })
          );
          return;
        }

        if (url === '/api/mode' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ mode: this.getMode(), connectedPhoneCount: this.phoneClients.size, lastPhoneActivity: this.lastPhoneActivity }));
          return;
        }

        if (url === '/api/mode' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => {
            body += chunk;
          });
          req.on('end', () => {
            try {
              const data = JSON.parse(body);
              if (data.mode === 'desk' || data.mode === 'remote' || data.mode === 'auto' || data.mode === 'autonomous') {
                this.setMode(data.mode);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, mode: data.mode }));
              } else {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Mode must be desk, remote, auto, or autonomous' }));
              }
            } catch (err: any) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        if (url === '/api/policy' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ policy: this.getExecutionPolicy() }));
          return;
        }

        if (url === '/api/policy' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => {
            body += chunk;
          });
          req.on('end', () => {
            try {
              const data = JSON.parse(body);
              const pol = data.policy === 'autonomous' ? 'always_proceed' : data.policy;
              if (pol === 'force_ask' || pol === 'always_proceed') {
                this.setExecutionPolicy(pol);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, policy: pol }));
              } else {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Policy must be force_ask, always_proceed, or autonomous' }));
              }
            } catch (err: any) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        if ((url === '/api/agent-quotas' || url === '/api/quotas') && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, quotas: this.ideWatcher.getAgentQuotas(), timestamp: Date.now() }));
          return;
        }

        // Live Workspace Directory Crawler for Mobile File Explorer
        if (url.startsWith('/api/workspace/files') || url.startsWith('/api/files')) {
          try {
            const parsed = new URL(url, 'http://localhost');
            const targetWs = this.resolveWorkspace(parsed.searchParams.get('workspaceId'));
            const rootPath = path.resolve(targetWs.path);
            const relSub = (parsed.searchParams.get('subPath') || '').replace(/^(\/|\\)+/, '');
            const targetPath = path.resolve(rootPath, relSub);
            const relFromRoot = path.relative(rootPath, targetPath);
            if (relFromRoot.startsWith('..') || path.isAbsolute(relFromRoot) || !fs.existsSync(targetPath)) {
              res.writeHead(404, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Directory not found or invalid' }));
              return;
            }
            const dirents = fs.readdirSync(targetPath, { withFileTypes: true });
            const ignored = new Set(['.git', 'node_modules', 'dist', '.tempmediaStorage', '.gemini', 'coverage', '.idea', '.vscode']);
            const files = dirents
              .filter(d => !ignored.has(d.name))
              .map(d => ({
                name: d.name,
                isDirectory: d.isDirectory(),
                path: relSub ? `${relSub}/${d.name}` : d.name,
              }))
              .sort((a, b) => {
                if (a.isDirectory && !b.isDirectory) return -1;
                if (!a.isDirectory && b.isDirectory) return 1;
                return a.name.localeCompare(b.name);
              });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, workspaceId: targetWs.id, workspaceName: targetWs.name, subPath: relSub, files }));
          } catch (err: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }

        // Live Workspace File Content Reader for Mobile Explorer Preview
        if (url.startsWith('/api/workspace/file/content') || url.startsWith('/api/file/content')) {
          try {
            const parsed = new URL(url, 'http://localhost');
            const targetWs = this.resolveWorkspace(parsed.searchParams.get('workspaceId'));
            const rootPath = path.resolve(targetWs.path);
            const rawFile = (parsed.searchParams.get('filePath') || parsed.searchParams.get('path') || '').trim();
            let targetPath = '';
            if (path.isAbsolute(rawFile)) {
              targetPath = path.resolve(rawFile);
            } else {
              targetPath = path.resolve(rootPath, rawFile.replace(/^(\/|\\)+/, ''));
            }
            const allWorkspaces = this.workspaceManager.listWorkspaces();
            const isInsideAnyWs = allWorkspaces.some(ws => {
              const wsRoot = path.resolve(ws.path);
              const rel = path.relative(wsRoot, targetPath);
              return !rel.startsWith('..') && !path.isAbsolute(rel);
            });
            const isInsideRoot = !path.relative(rootPath, targetPath).startsWith('..');

            if ((!isInsideAnyWs && !isInsideRoot) || !fs.existsSync(targetPath) || fs.statSync(targetPath).isDirectory()) {
              res.writeHead(404, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'File not found or invalid' }));
              return;
            }
            const relFile = path.relative(rootPath, targetPath).replace(/\\/g, '/');
            const stat = fs.statSync(targetPath);
            const ext = path.extname(targetPath).toLowerCase();
            const isImage = ['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif'].includes(ext);

            let mimeType = 'text/plain';
            if (ext === '.md') mimeType = 'text/markdown';
            else if (ext === '.html') mimeType = 'text/html';
            else if (ext === '.json') mimeType = 'application/json';
            else if (ext === '.png') mimeType = 'image/png';
            else if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
            else if (ext === '.webp') mimeType = 'image/webp';
            else if (ext === '.svg') mimeType = 'image/svg+xml';

            if (isImage) {
              const data = fs.readFileSync(targetPath);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                ok: true,
                path: relFile,
                name: path.basename(targetPath),
                size: stat.size,
                isText: false,
                base64: data.toString('base64'),
                mimeType,
              }));
              return;
            }

            if (stat.size > 500 * 1024) {
              const buf = Buffer.alloc(50 * 1024);
              const fd = fs.openSync(targetPath, 'r');
              fs.readSync(fd, buf, 0, 50 * 1024, 0);
              fs.closeSync(fd);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                ok: true,
                path: relFile,
                name: path.basename(targetPath),
                size: stat.size,
                isText: true,
                truncated: true,
                content: buf.toString('utf8') + '\n\n... (truncated: file exceeds 500KB)',
                mimeType,
              }));
              return;
            }

            const content = fs.readFileSync(targetPath, 'utf8');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              ok: true,
              path: relFile,
              name: path.basename(targetPath),
              size: stat.size,
              isText: true,
              truncated: false,
              content,
              mimeType,
            }));
          } catch (err: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }

        // Live Session Artifacts List for Mobile Artifacts Viewer
        if (url.startsWith('/api/session/artifacts') && req.method === 'GET') {
          try {
            const artifacts = this.ideWatcher.getSessionArtifacts();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, artifacts, count: artifacts.length }));
          } catch (err: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }

        // Live Session Artifact Content Reader
        if (url.startsWith('/api/session/artifact/content') || url.startsWith('/api/session/artifact')) {
          try {
            const parsed = new URL(url, 'http://localhost');
            const relPath = (parsed.searchParams.get('path') || parsed.searchParams.get('name') || '').replace(/^(\/|\\)+/, '');
            if (!relPath) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Missing artifact path' }));
              return;
            }
            const data = this.ideWatcher.getArtifactContent(relPath);
            if (!data) {
              res.writeHead(404, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Artifact not found' }));
              return;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, ...data }));
          } catch (err: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }

        // Live Workspace Git Status
        if (url.startsWith('/api/workspace/git/status') || url.startsWith('/api/git/status')) {
          try {
            const parsed = new URL(url, 'http://localhost');
            const targetWs = this.resolveWorkspace(parsed.searchParams.get('workspaceId'));
            const cwd = targetWs.path;
            const changes = getWorkspaceGitChanges(cwd);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, workspacePath: cwd, changes }));
          } catch (err: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }

        // Live Workspace Unified Git Diff Inspector
        if (url.startsWith('/api/workspace/git/diff') || url.startsWith('/api/git/diff')) {
          try {
            const parsed = new URL(url, 'http://localhost');
            const targetWs = this.resolveWorkspace(parsed.searchParams.get('workspaceId'));
            const cwd = targetWs.path;
            const rawFile = (parsed.searchParams.get('filePath') || parsed.searchParams.get('path') || parsed.searchParams.get('file') || '').trim();
            let safeRel = '';
            if (path.isAbsolute(rawFile)) {
              safeRel = path.relative(cwd, rawFile).replace(/\\/g, '/');
            } else {
              safeRel = rawFile.replace(/^(\/|\\)+/, '').replace(/\\/g, '/');
            }

            let diff = '';
            try {
              if (safeRel) {
                try {
                  diff = execSync(`git diff HEAD -U3 -- "${safeRel}"`, { cwd, encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
                } catch {
                  diff = execSync(`git diff -U3 -- "${safeRel}"`, { cwd, encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
                }
                if (!diff.trim()) {
                  const full = path.resolve(cwd, safeRel);
                  if (fs.existsSync(full) && !fs.statSync(full).isDirectory()) {
                    const content = fs.readFileSync(full, 'utf8');
                    const lines = content.split('\n');
                    diff = [
                      `--- /dev/null`,
                      `+++ b/${safeRel}`,
                      `@@ -0,0 +1,${lines.length} @@`,
                      ...lines.map(l => `+${l}`),
                    ].join('\n');
                  }
                }
              } else {
                try {
                  diff = execSync('git diff HEAD -U3', { cwd, encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
                } catch {
                  diff = execSync('git diff -U3', { cwd, encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
                }
              }
            } catch (err: any) {
              diff = `Failed to get diff: ${err.message}`;
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, filePath: safeRel || null, diff }));
          } catch (err: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }

        // Live Workspace Active Editor Tabs
        if (url.startsWith('/api/workspace/tabs') || url.startsWith('/api/tabs')) {
          if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
              try {
                const data = JSON.parse(body);
                if (Array.isArray(data.tabs)) {
                  this.activeTabs = data.tabs;
                  this.broadcast({
                    type: 'server:tabs_updated',
                    tabs: this.activeTabs,
                    workspaceId: data.workspaceId,
                  });
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, count: this.activeTabs.length }));
              } catch (e: any) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: e.message }));
              }
            });
            return;
          }
          const parsed = new URL(url, 'http://localhost');
          const targetWs = this.resolveWorkspace(parsed.searchParams.get('workspaceId'));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, tabs: this.getActiveTabs(targetWs.id) }));
          return;
        }

        // Live Terminal Logs History
        if (url === '/api/terminal/history' || url.startsWith('/api/terminal/history')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, entries: this.ideWatcher.getTerminalHistory() }));
          return;
        }

        // Recent Projects Hub API
        if (url === '/api/workspace/recent' || url.startsWith('/api/workspace/recent')) {
          const projects = getRecentProjects(this.workspaceManager.listWorkspaces());
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, projects }));
          return;
        }

        // Launch Project in IDE
        if ((url === '/api/workspace/launch' || url === '/api/workspace/open') && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', async () => {
            try {
              const data = JSON.parse(body);
              if (data.path) {
                const isAlive = this.isIdeActive();
                const forwardCb = isAlive ? (p: string) => {
                  let sent = false;
                  for (const extWs of this.extensionClients) {
                    if (extWs.readyState === WebSocket.OPEN) {
                      extWs.send(JSON.stringify({ type: 'server:open_workspace', path: p }));
                      sent = true;
                    }
                  }
                  return sent;
                } : undefined;
                const result = await launchRecentProject(data.path, forwardCb);
                this.broadcast({
                  type: 'server:recent_projects_updated',
                  projects: getRecentProjects(this.workspaceManager.listWorkspaces()),
                });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(result));
              } else {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing project path' }));
              }
            } catch (err: any) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        // Host Hardware Telemetry API
        if (url === '/api/host/telemetry' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, telemetry: getHostTelemetry(this.isIdeActive() ? 'active' : 'dormant') }));
          return;
        }

        // Close IDE / Provider Process API
        if (url === '/api/host/close-ide' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const data = body ? JSON.parse(body) : {};
              const result = closeProvider(data.providerId || 'antigravity');
              this.broadcast({ type: 'server:ide_status', status: 'dormant' });
              this.broadcast({ type: 'server:host_telemetry', telemetry: getHostTelemetry('dormant', data.providerId || 'antigravity') });
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(result));
            } catch (err: any) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        // Restart IDE / Provider Process API
        if (url === '/api/host/restart-ide' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', async () => {
            try {
              const data = body ? JSON.parse(body) : {};
              const targetPath = this.resolveTargetWorkspace(data.path || data.workspacePath);
              this.extensionClients.clear();
              this.extensionWorkspaces.clear();
              this.broadcast({ type: 'server:ide_status', status: 'dormant' });
              const activeWs = this.workspaceManager.listWorkspaces()[0];
              this.broadcast({
                type: 'server:chat_message',
                workspaceId: activeWs?.id || 'default',
                message: {
                  id: `restart_ide_${Date.now()}`,
                  role: 'system',
                  content: `**Host IDE Restarting:** Executing detached batch restart script for Antigravity IDE...`,
                  timestamp: Date.now(),
                },
              });
              const result = await restartProvider(data.providerId || 'antigravity', targetPath);
              this.broadcast({
                type: 'server:ide_status',
                status: result.ok ? 'active' : 'dormant',
              });
              this.broadcast({
                type: 'server:host_telemetry',
                telemetry: getHostTelemetry(result.ok ? 'active' : 'dormant', data.providerId || 'antigravity'),
              });
              this.broadcast({
                type: 'server:recent_projects_updated',
                projects: getRecentProjects(this.workspaceManager.listWorkspaces()),
              });
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(result));
            } catch (err: any) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        // Direct HTTP fallback for mobile approvals (notifications / background tasks)
        if ((url === '/api/hook/approval' || url === '/api/approval') && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => {
            body += chunk;
          });
          req.on('end', () => {
            try {
              const payload = JSON.parse(body);
              if (payload && payload.requestId && payload.decision) {
                const pausedReq = this.hookIpc.getPausedRequest(payload.requestId);
                if (pausedReq) {
                  this.hookIpc.clearPausedRequest(payload.requestId);
                  this.workspaceManager.removePendingApproval(payload.requestId);
                  this.broadcast({
                    type: 'server:approval_resolved',
                    requestId: payload.requestId,
                    decision: payload.decision,
                  });
                  if (payload.decision === 'allow') {
                    const targetTool = pausedReq.toolTitle || pausedReq.toolCall?.name || 'action';
                    this.handleSendPrompt(`[Approved via Mobile]: Proceed with ${targetTool}`, pausedReq.workspacePath);
                  } else {
                    const answerPrompt = payload.interceptPrompt || payload.reason;
                    if (answerPrompt) {
                      this.handleSendPrompt(answerPrompt, pausedReq.workspacePath);
                    }
                  }
                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ ok: true, resumed: true }));
                  return;
                }

                const ok = this.hookIpc.resolveApproval(payload);
                this.workspaceManager.removePendingApproval(payload.requestId);
                this.broadcast({
                  type: 'server:approval_resolved',
                  requestId: payload.requestId,
                  decision: payload.decision,
                });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, resolved: ok }));
              } else {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing requestId or decision' }));
              }
            } catch (err: any) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        // Direct HTTP endpoint to clear any stale/ghost approvals
        if ((url === '/api/approvals/clear' || url === '/api/hook/clear') && req.method === 'POST') {
          this.hookIpc.clearAllApprovals('Cleared by user via API');
          for (const ws of this.workspaceManager.listWorkspaces()) {
            ws.pendingApprovals = [];
            if (ws.status === 'waiting_approval') ws.status = 'idle';
          }
          this.broadcast({
            type: 'server:workspaces_updated',
            workspaces: this.workspaceManager.listWorkspaces(),
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, message: 'All pending approvals cleared' }));
          return;
        }

        // Direct HTTP fallback for prompts/messages (in case WebSocket is reconnecting)
        if ((url === '/api/prompt' || url === '/api/chat') && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => {
            body += chunk;
          });
          req.on('end', () => {
            try {
              const data = JSON.parse(body);
              if (data && (data.prompt || data.audio || (data.images && data.images.length > 0))) {
                const ok = this.handleSendPrompt(data.prompt || '', data.workspaceId, data.images, data.audio, data.model);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok }));
              } else {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing prompt or audio' }));
              }
            } catch (err: any) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        // Direct HTTP fallback for emergency stop / interrupt
        if ((url === '/api/stop' || url === '/api/abort') && req.method === 'POST') {
          const pending = this.hookIpc.getPendingRequests();
          for (const p of pending) {
            this.hookIpc.resolveApproval({
              requestId: p.id,
              decision: 'deny',
              reason: 'Aborted remotely via emergency stop',
            });
          }

          // Broadcast interrupt to all attached VS Code Extension Hosts
          for (const ext of this.extensionClients) {
            if (ext.readyState === WebSocket.OPEN) {
              ext.send(JSON.stringify({ type: 'server:emergency_stop' }));
            }
          }

          const activeWs = this.workspaceManager.listWorkspaces()[0];
          this.broadcast({
            type: 'server:chat_message',
            workspaceId: activeWs ? activeWs.id : 'default',
            message: {
              id: `stop_${Date.now()}`,
              role: 'system',
              content: 'Emergency Stop: All pending approvals denied and agent paused.',
              timestamp: Date.now(),
            },
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
          return;
        }

        // Serve compiled Android APK
        if (url === '/download/app.apk' || url === '/app.apk') {
          const apkPath = path.resolve(__dirname, '../../../../packages/web/android/app/build/outputs/apk/debug/app-debug.apk');
          if (fs.existsSync(apkPath)) {
            const stat = fs.statSync(apkPath);
            res.writeHead(200, {
              'Content-Type': 'application/vnd.android.package-archive',
              'Content-Disposition': 'attachment; filename="AntigravityCompanion.apk"',
              'Content-Length': stat.size,
            });
            fs.createReadStream(apkPath).pipe(res);
            return;
          } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'APK is compiling or not found' }));
            return;
          }
        }

        // Serve APK build status / version
        if (url === '/api/apk-status' || url === '/api/version') {
          const details = this.getApkDetails();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ version: '0.1.0', ...details }));
          return;
        }

        // Serve built web companion UI
        if (this.serveStatic(url, res)) {
          return;
        }

        res.writeHead(404);
        res.end();
      });

      this.wss = new WebSocketServer({
        server: this.httpServer,
        verifyClient: (info, callback) => {
          try {
            const parsedUrl = new URL(info.req.url || '/', 'http://localhost');
            const isAuth = this.isRequestAuthorized(info.req, parsedUrl);
            if (isAuth) {
              callback(true);
            } else {
              console.warn(`[WsGateway] 401 Unauthorized: Rejected unauthenticated WebSocket upgrade from ${info.req.socket.remoteAddress}`);
              callback(false, 401, 'Unauthorized: Valid pairing token required');
            }
          } catch {
            callback(false, 400, 'Bad Request');
          }
        },
      });

      this.wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
        this.clients.add(ws);
        const rawIp = req?.socket?.remoteAddress || '';
        const clientIp = rawIp.replace(/^::ffff:/, '');
        const isLocal = clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === 'localhost';
        if (clientIp) {
          (ws as any)._clientIp = clientIp;
        }

        const interfaces = os.networkInterfaces();
        let tailscaleIp: string | null = null;
        for (const name of Object.keys(interfaces)) {
          for (const iface of interfaces[name] || []) {
            if (iface.family === 'IPv4' && !iface.internal) {
              if (name.toLowerCase().includes('tailscale') || iface.address.startsWith('100.')) {
                tailscaleIp = iface.address;
                break;
              }
            }
          }
        }

        // Reconcile workspace pending approvals against active hook requests before sending hello
        const activeReqIds = new Set(this.hookIpc.getPendingRequests().map(r => r.id));
        for (const wsState of this.workspaceManager.listWorkspaces()) {
          wsState.pendingApprovals = wsState.pendingApprovals.filter(r => activeReqIds.has(r.id));
          if (wsState.pendingApprovals.length === 0 && wsState.status === 'waiting_approval') {
            wsState.status = 'idle';
          }
        }

        // Send initial state & full conversation history on connection
        const apkDetails = this.getApkDetails();
        const helloMsg: WsServerMessage = {
          type: 'server:hello',
          daemonVersion: '0.1.0',
          workspaces: this.workspaceManager.listWorkspaces(),
          history: this.ideWatcher.getHistory(),
          mode: this.getMode(),
          executionPolicy: this.getExecutionPolicy(),
          conversationTitle: this.ideWatcher.getConversationTitle(),
          conversations: this.ideWatcher.getRecentConversations(),
          tailscaleIp,
          connectedPhoneCount: this.phoneClients.size,
          ideStatus: this.isIdeActive() ? 'active' : 'dormant',
          apkBuildTime: apkDetails.apkBuildTime,
          agentQuotas: this.ideWatcher.getAgentQuotas(),
          activeTabs: this.getActiveTabs(),
          token: isLocal ? (this.getAuthToken() || undefined) : undefined,
          recentProjects: getRecentProjects(this.workspaceManager.listWorkspaces()),
          terminalHistory: this.ideWatcher.getTerminalHistory(),
          telemetry: getHostTelemetry(this.isIdeActive() ? 'active' : 'dormant'),
        };
        ws.send(JSON.stringify(helloMsg));

        ws.on('message', (data: Buffer | string) => {
          try {
            const parsed = JSON.parse(data.toString()) as WsClientMessage;
            this.handleClientMessage(ws, parsed);
          } catch (err: any) {
            console.error('[WsGateway] Failed to parse client message:', err);
          }
        });

        const handleDisconnect = () => {
          this.clients.delete(ws);
          if (this.extensionClients.has(ws)) {
            this.extensionClients.delete(ws);
            this.extensionWorkspaces.delete(ws);
            console.log(`[WsGateway] VS Code Extension Host detached (${this.extensionClients.size} active).`);
            if (!this.isIdeActive()) {
              this.broadcast({
                type: 'server:ide_status',
                status: 'dormant',
              });
            }
          }
          if (this.phoneClients.has(ws)) {
            this.phoneClients.delete(ws);
            this.broadcast({
              type: 'server:device_count_updated',
              count: this.phoneClients.size,
            });
          }
        };

        ws.on('close', handleDisconnect);
        ws.on('error', err => {
          console.error('[WsGateway] Client socket error:', err);
          handleDisconnect();
        });
      });

      try {
        killStalePort(this.port);
      } catch {}

      this.httpServer.listen(this.port, '0.0.0.0', () => {
        resolve();
      });

      this.httpServer.on('error', reject);
    });
  }

  private handleClientMessage(ws: WebSocket, msg: WsClientMessage): void {
    if (this.phoneClients.has(ws)) {
      this.lastPhoneActivity = Date.now();
    }
    switch (msg.type) {
      case 'client:hello':
        if (msg.deviceId === 'vscode_extension_host' || msg.deviceId?.startsWith('vscode_extension')) {
          this.extensionClients.add(ws);
          if (msg.workspacePath) {
            const normalized = path.resolve(msg.workspacePath);
            this.extensionWorkspaces.set(ws, normalized);
            this.workspaceManager.registerWorkspace(normalized);
            console.log(`[WsGateway] VS Code Extension Host attached for workspace: ${normalized}`);
          }
          console.log(`[WsGateway] VS Code Extension Host attached as session controller (${this.extensionClients.size} active).`);
          this.broadcast({
            type: 'server:ide_status',
            status: 'active',
          });

          // Drain any pending prompts buffered while dormant with stagger
          if (this.pendingHostPrompts.length > 0) {
            const attachedWsPath = msg.workspacePath ? path.resolve(msg.workspacePath) : null;
            const attachedWs = attachedWsPath ? this.workspaceManager.getWorkspaceByPath(attachedWsPath) : null;

            const queueToDrain: typeof this.pendingHostPrompts = [];
            const remaining: typeof this.pendingHostPrompts = [];

            for (const item of this.pendingHostPrompts) {
              if (!attachedWs || !item.workspaceId || item.workspaceId === attachedWs.id) {
                queueToDrain.push(item);
              } else {
                remaining.push(item);
              }
            }
            this.pendingHostPrompts = remaining;

            if (queueToDrain.length > 0) {
              console.log(`[WsGateway] Draining ${queueToDrain.length} buffered prompt(s) to newly attached Extension Host.`);
              queueToDrain.forEach((item, idx) => {
                setTimeout(() => {
                  if (ws.readyState === WebSocket.OPEN) {
                    ws.send(
                      JSON.stringify({
                        type: 'server:forward_prompt',
                        prompt: item.prompt,
                        workspaceId: item.workspaceId,
                        images: item.images,
                        audio: item.audio,
                        model: item.model,
                      })
                    );
                  }
                }, idx * 1200);
              });
            }
          }
        } else {
          this.phoneClients.add(ws);
          this.lastPhoneActivity = Date.now();
          this.broadcast({
            type: 'server:device_count_updated',
            count: this.phoneClients.size,
          });
        }
        break;

      case 'client:ping':
        ws.send(JSON.stringify({ type: 'server:pong', timestamp: Date.now() }));
        break;

      case 'client:respond_approval': {
        const pausedReq = this.hookIpc.getPausedRequest(msg.payload.requestId);
        if (pausedReq) {
          this.hookIpc.clearPausedRequest(msg.payload.requestId);
          this.workspaceManager.removePendingApproval(msg.payload.requestId);
          this.broadcast({
            type: 'server:approval_resolved',
            requestId: msg.payload.requestId,
            decision: msg.payload.decision,
          });
          if (msg.payload.decision === 'allow') {
            const targetTool = pausedReq.toolTitle || pausedReq.toolCall?.name || 'action';
            this.handleSendPrompt(`[Approved via Mobile]: Proceed with ${targetTool}`, pausedReq.workspacePath);
          } else {
            const answerPrompt = msg.payload.interceptPrompt || msg.payload.reason;
            if (answerPrompt) {
              this.handleSendPrompt(answerPrompt, pausedReq.workspacePath);
            }
          }
          break;
        }

        const resolved = this.hookIpc.resolveApproval(msg.payload);
        if (resolved) {
          this.workspaceManager.removePendingApproval(msg.payload.requestId);
        }
        break;
      }

      case 'client:clear_approvals':
        this.hookIpc.clearAllApprovals('Cleared by user via companion');
        for (const wsState of this.workspaceManager.listWorkspaces()) {
          wsState.pendingApprovals = [];
          if (wsState.status === 'waiting_approval') wsState.status = 'idle';
        }
        this.broadcast({
          type: 'server:workspaces_updated',
          workspaces: this.workspaceManager.listWorkspaces(),
        });
        break;

      case 'client:set_mode':
        if (msg.mode === 'desk' || msg.mode === 'remote' || msg.mode === 'auto' || msg.mode === 'autonomous') {
          this.setMode(msg.mode);
        }
        break;

      case 'client:set_execution_policy': {
        const pol = msg.policy === 'autonomous' ? 'always_proceed' : msg.policy;
        if (pol === 'force_ask' || pol === 'always_proceed') {
          this.setExecutionPolicy(pol);
        }
        break;
      }

      case 'client:get_agent_quotas': {
        ws.send(
          JSON.stringify({
            type: 'server:agent_quotas',
            quotas: this.ideWatcher.getAgentQuotas(),
          })
        );
        break;
      }

      case 'client:update_tabs': {
        if (Array.isArray(msg.tabs)) {
          this.activeTabs = msg.tabs;
          this.broadcast({
            type: 'server:tabs_updated',
            tabs: this.activeTabs,
            workspaceId: msg.workspaceId,
          });
        }
        break;
      }

      case 'client:run_quick_action':
        this.broadcast({
          type: 'server:run_quick_action',
          command: msg.command,
          label: msg.label,
        });
        break;

      case 'client:list_workspaces':
        ws.send(
          JSON.stringify({
            type: 'server:workspaces_updated',
            workspaces: this.workspaceManager.listWorkspaces(),
          })
        );
        break;

      case 'client:register_workspace':
        if (msg.path && fs.existsSync(msg.path)) {
          this.workspaceManager.registerWorkspace(msg.path);
          this.broadcast({
            type: 'server:workspaces_updated',
            workspaces: this.workspaceManager.listWorkspaces(),
          });
        }
        break;

      case 'client:switch_workspace': {
        const targetWs = this.workspaceManager.getWorkspace((msg as any).workspaceId);
        if (targetWs) {
          targetWs.lastActive = Date.now();
          if (targetWs.path) {
            this.ideWatcher.autoDiscoverActiveConversation(targetWs.path);
          }
          const history = this.ideWatcher.getHistory();
          ws.send(
            JSON.stringify({
              type: 'server:history',
              workspaceId: targetWs.id,
              messages: history,
              conversationTitle: this.ideWatcher.getConversationTitle(),
            })
          );
          this.broadcast({
            type: 'server:workspaces_updated',
            workspaces: this.workspaceManager.listWorkspaces(),
          });
        }
        break;
      }

      case 'client:list_workspace_files': {
        const wsId = msg.workspaceId || this.workspaceManager.listWorkspaces()[0]?.id;
        const targetWs = wsId ? this.workspaceManager.getWorkspace(wsId) : null;
        if (!targetWs) {
          ws.send(JSON.stringify({ type: 'server:workspace_files', workspaceId: wsId || '', subPath: msg.subPath || '', files: [] }));
          break;
        }
        const rootPath = path.resolve(targetWs.path);
        const relSub = (msg.subPath || '').replace(/^(\/|\\)+/, '');
        const targetPath = path.resolve(rootPath, relSub);
        if (!targetPath.startsWith(rootPath) || !fs.existsSync(targetPath)) {
          ws.send(JSON.stringify({ type: 'server:workspace_files', workspaceId: targetWs.id, subPath: relSub, files: [] }));
          break;
        }
        try {
          const dirents = fs.readdirSync(targetPath, { withFileTypes: true });
          const ignored = new Set(['.git', 'node_modules', 'dist', '.tempmediaStorage', '.gemini', 'coverage', '.idea', '.vscode']);
          const files = dirents
            .filter(d => !ignored.has(d.name))
            .map(d => ({
              name: d.name,
              isDirectory: d.isDirectory(),
              path: relSub ? `${relSub}/${d.name}` : d.name,
            }))
            .sort((a, b) => {
              if (a.isDirectory && !b.isDirectory) return -1;
              if (!a.isDirectory && b.isDirectory) return 1;
              return a.name.localeCompare(b.name);
            });
          ws.send(JSON.stringify({ type: 'server:workspace_files', workspaceId: targetWs.id, subPath: relSub, files }));
        } catch {
          ws.send(JSON.stringify({ type: 'server:workspace_files', workspaceId: targetWs.id, subPath: relSub, files: [] }));
        }
        break;
      }

      case 'client:emergency_stop': {
        // 1. Deny any pending hook approvals
        const pending = this.hookIpc.getPendingRequests();
        for (const req of pending) {
          this.hookIpc.resolveApproval({
            requestId: req.id,
            decision: 'deny',
            reason: 'Aborted by user via Emergency Stop',
          });
        }

        // 2. Dispatch interrupt signal to attached VS Code Extension Hosts
        for (const ext of this.extensionClients) {
          if (ext.readyState === WebSocket.OPEN) {
            ext.send(JSON.stringify({ type: 'server:emergency_stop', workspaceId: msg.workspaceId }));
          }
        }

        // 3. Broadcast status update
        this.broadcast({
          type: 'server:chat_message',
          workspaceId: msg.workspaceId || 'default',
          message: {
            id: `stop_${Date.now()}`,
            role: 'system',
            content: '**Emergency Stop Triggered:** All pending approvals denied and agent paused.',
            timestamp: Date.now(),
          },
        });
        break;
      }

      case 'client:list_conversations': {
        ws.send(
          JSON.stringify({
            type: 'server:conversations_list',
            conversations: this.ideWatcher.getRecentConversations(),
          })
        );
        break;
      }

      case 'client:switch_conversation': {
        if (this.ideWatcher.switchConversation(msg.conversationId)) {
          const history = this.ideWatcher.getHistory();
          this.broadcast({
            type: 'server:history',
            workspaceId: 'default',
            messages: history,
            conversationTitle: this.ideWatcher.getConversationTitle(),
          });
        }
        break;
      }

      case 'client:launch_project':
        if (msg.path) {
          const isAlive = this.isIdeActive();
          const forwardCb = isAlive ? (p: string) => {
            let sent = false;
            for (const extWs of this.extensionClients) {
              if (extWs.readyState === WebSocket.OPEN) {
                extWs.send(JSON.stringify({ type: 'server:open_workspace', path: p }));
                sent = true;
              }
            }
            return sent;
          } : undefined;

          launchRecentProject(msg.path, forwardCb).then(res => {
            this.broadcast({
              type: 'server:recent_projects_updated',
              projects: getRecentProjects(this.workspaceManager.listWorkspaces()),
            });
          });
        }
        break;

      case 'client:close_ide': {
        const result = closeProvider(msg.providerId || 'antigravity');
        this.broadcast({
          type: 'server:ide_status',
          status: 'dormant',
        });
        this.broadcast({
          type: 'server:host_telemetry',
          telemetry: getHostTelemetry('dormant', msg.providerId || 'antigravity'),
        });
        const activeWs = this.workspaceManager.listWorkspaces()[0];
        const freedText = result.ramFreedMb ? ` (~${result.ramFreedMb} MB RAM freed)` : '';
        this.broadcast({
          type: 'server:chat_message',
          workspaceId: activeWs?.id || 'default',
          message: {
            id: `close_ide_${Date.now()}`,
            role: 'system',
            content: `**Host IDE Closed:** ${result.message}${freedText}. Background daemon remains active and listening.`,
            timestamp: Date.now(),
          },
        });
        break;
      }

      case 'client:restart_ide': {
        const targetPath = this.resolveTargetWorkspace(msg.workspacePath);
        this.extensionClients.clear();
        this.extensionWorkspaces.clear();
        this.broadcast({ type: 'server:ide_status', status: 'dormant' });
        const activeWs = this.workspaceManager.listWorkspaces()[0];
        this.broadcast({
          type: 'server:chat_message',
          workspaceId: activeWs?.id || 'default',
          message: {
            id: `restart_ide_${Date.now()}`,
            role: 'system',
            content: `**Host IDE Restarting:** Executing detached batch restart script for Antigravity IDE...`,
            timestamp: Date.now(),
          },
        });
        restartProvider(msg.providerId || 'antigravity', targetPath).then(result => {
          this.broadcast({
            type: 'server:ide_status',
            status: result.ok ? 'active' : 'dormant',
          });
          this.broadcast({
            type: 'server:host_telemetry',
            telemetry: getHostTelemetry(result.ok ? 'active' : 'dormant', msg.providerId || 'antigravity'),
          });
          this.broadcast({
            type: 'server:recent_projects_updated',
            projects: getRecentProjects(this.workspaceManager.listWorkspaces()),
          });
        });
        break;
      }

      case 'client:get_telemetry': {
        ws.send(
          JSON.stringify({
            type: 'server:host_telemetry',
            telemetry: getHostTelemetry(this.isIdeActive() ? 'active' : 'dormant'),
          })
        );
        break;
      }

      case 'client:send_prompt': {
        const imgs = msg.images || (msg.imageBase64 ? [{ base64: msg.imageBase64, name: msg.imageName || 'photo.png' }] : []);
        this.handleSendPrompt(msg.prompt, msg.workspaceId, imgs, msg.audio, msg.model);
        break;
      }

      default:
        break;
    }
  }

  private resolveTargetWorkspace(explicitPath?: string): string | undefined {
    if (explicitPath) {
      const norm = path.resolve(explicitPath);
      if (
        fs.existsSync(norm) &&
        fs.statSync(norm).isDirectory() &&
        !norm.includes('node_modules') &&
        !norm.endsWith(path.join('packages', 'cli', 'dist', 'bin'))
      ) {
        return norm;
      }
    }
    const list = this.workspaceManager.listWorkspaces();
    for (const ws of list) {
      if (ws.path) {
        const norm = path.resolve(ws.path);
        if (fs.existsSync(norm) && fs.statSync(norm).isDirectory()) {
          return norm;
        }
      }
    }
    const recents = getRecentProjects();
    if (recents.length > 0 && recents[0].path && fs.existsSync(recents[0].path)) {
      return path.resolve(recents[0].path);
    }
    return undefined;
  }

  private recentPrompts: Map<string, number> = new Map();

  public handleSendPrompt(
    prompt: string,
    workspaceId?: string,
    images?: { base64: string; name: string }[],
    audio?: AudioAttachment,
    model?: string
  ): boolean {
    this.lastPhoneActivity = Date.now();
    const wsState = (workspaceId ? this.workspaceManager.getWorkspace(workspaceId) : null) || this.workspaceManager.listWorkspaces()[0];
    if (!wsState) return false;

    const trimmedPrompt = (prompt || '').trim();
    const imgs = images || [];
    if (!trimmedPrompt && imgs.length === 0 && !audio) return false;

    // Deduplicate rapid identical submissions
    const dedupeKey = `${trimmedPrompt}_${imgs.length}_${audio?.name || audio?.base64?.slice(0, 32) || ''}`;
    const now = Date.now();
    const lastTime = this.recentPrompts.get(dedupeKey);
    if (lastTime && now - lastTime < 2000) {
      return true;
    }
    this.recentPrompts.set(dedupeKey, now);
    for (const [p, t] of this.recentPrompts.entries()) {
      if (now - t > 60000) this.recentPrompts.delete(p);
    }

    let fullPrompt = trimmedPrompt;
    if (imgs.length > 0) {
      const savedPaths = this.ideWatcher.saveUploadedImages(imgs);
      if (savedPaths.length > 0) {
        fullPrompt += (fullPrompt ? '\n\n' : '') + savedPaths.map(p => `[Attached Media]: file:///${p.replace(/\\/g, '/')}`).join('\n');
      }
    }

    if (audio && audio.base64) {
      const audioSavedPath = this.ideWatcher.saveUploadedAudio(audio);
      if (audioSavedPath) {
        const audioMediaLine = `[Attached Media]: file:///${audioSavedPath.replace(/\\/g, '/')}`;
        if (!fullPrompt) {
          fullPrompt = `[Voice Note Attached]: Please listen to the attached audio note and follow its instructions.\n\n${audioMediaLine}`;
        } else {
          fullPrompt += `\n\n${audioMediaLine}`;
        }
      }
    }

    const dataUrls = imgs.map(i => `data:image/png;base64,${i.base64}`);
    const displayContent = trimmedPrompt || (audio ? '🎙️ Voice Note' : '');

    // 1. Broadcast user message bubble to mobile UI immediately
    this.broadcast({
      type: 'server:chat_message',
      workspaceId: wsState.id,
      message: {
        id: `msg_u_${Date.now()}`,
        role: 'user',
        content: displayContent,
        timestamp: Date.now(),
        images: dataUrls,
        imageUrl: dataUrls[0],
        audio: audio ? {
          base64: audio.base64,
          mimeType: audio.mimeType || 'audio/webm',
          duration: audio.duration,
          name: audio.name || 'Voice Note',
        } : undefined,
      },
    });

    // 2. PRIMARY PATH: Direct WebSocket dispatch to VS Code Extension Host (Layer 4 Master)
    let targetExtension: WebSocket | undefined;
    if (wsState && wsState.path) {
      const targetNorm = path.resolve(wsState.path).toLowerCase();
      for (const [clientWs, clientPath] of this.extensionWorkspaces.entries()) {
        if (clientWs.readyState === WebSocket.OPEN && clientPath.toLowerCase() === targetNorm) {
          targetExtension = clientWs;
          break;
        }
      }
    }
    if (!targetExtension) {
      targetExtension = Array.from(this.extensionClients).reverse().find(c => c.readyState === WebSocket.OPEN);
    }

    if (targetExtension) {
      console.log(`[WsGateway] Forwarding prompt directly to Extension Host (${wsState.name}): "${fullPrompt.slice(0, 40)}..."`);
      targetExtension.send(
        JSON.stringify({
          type: 'server:forward_prompt',
          prompt: fullPrompt,
          workspaceId: wsState.id,
          images: imgs,
          audio: audio,
          model: model,
        })
      );
      return true;
    }

    // 3. DORMANT BUFFER: If Extension Host is dormant (closed/reloading), buffer in memory (capped at 5 items)
    console.log(`[WsGateway] Antigravity IDE is dormant. Buffering prompt in memory (${this.pendingHostPrompts.length + 1} queued).`);
    if (this.pendingHostPrompts.length >= 5) {
      this.pendingHostPrompts.shift();
    }
    this.pendingHostPrompts.push({
      prompt: fullPrompt,
      workspaceId: wsState.id,
      images: imgs,
      audio: audio,
      model: model,
    });

    this.broadcast({
      type: 'server:chat_message',
      workspaceId: wsState.id,
      message: {
        id: `msg_sys_${Date.now()}`,
        role: 'system',
        content: '⏳ Antigravity IDE is currently dormant (window closed/reloading). Prompt safely held in daemon memory and will auto-submit the instant the IDE attaches.',
        timestamp: Date.now(),
      },
    });
    return true;
  }

  public broadcast(msg: WsServerMessage): void {
    const serialized = JSON.stringify(msg);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(serialized);
      }
    }
  }

  public stop(): Promise<void> {
    return new Promise(resolve => {
      for (const client of this.clients) {
        client.close();
      }
      this.clients.clear();
      if (this.httpServer) {
        this.httpServer.close(() => resolve());
      } else {
        resolve();
      }
    });
  }
}
