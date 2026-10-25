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
  ChatMessage,
} from '@agy-companion/protocol';
import { HookIpcServer, getWorkspaceGitChanges } from '../hooks/ipc-server.js';
import { WorkspaceManager } from '../session/workspace-manager.js';
import { IdeTranscriptWatcher } from '../session/ide-watcher.js';
import { getRecentProjects, launchRecentProject } from '../session/recent-projects.js';
import { closeProvider, restartProvider, getHostTelemetry } from '../provider/provider-lifecycle.js';
import { killStalePort } from './port-cleaner.js';
import { handleHttpRequest } from './http-api.js';
import { CodeRootsManager } from '../session/code-roots.js';

const _filename = typeof __filename !== 'undefined' ? __filename : fileURLToPath(import.meta.url);
const _dirname = typeof __dirname !== 'undefined' ? __dirname : path.dirname(_filename);

function getWebDistPath(): string {
  const candidates = [
    process.env.KYBER_WEB_DIST,
    path.resolve(_dirname, '../web'),
    path.resolve(_dirname, '../../web/dist'),
    path.resolve(_dirname, '../../../web/dist'),
  ].filter(Boolean) as string[];

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return path.resolve(_dirname, '../web');
}
const WEB_DIST_PATH = getWebDistPath();

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
  private codeRootsManager: CodeRootsManager;

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

  public setActiveTabs(tabs: EditorTab[]): void {
    this.activeTabs = tabs;
  }

  public getHookIpc(): HookIpcServer {
    return this.hookIpc;
  }

  public getWorkspaceManager(): WorkspaceManager {
    return this.workspaceManager;
  }

  public getIdeWatcher(): IdeTranscriptWatcher {
    return this.ideWatcher;
  }

  public getPhoneClients(): Set<WebSocket> {
    return this.phoneClients;
  }

  public getLastPhoneActivity(): number {
    return this.lastPhoneActivity;
  }

  public getExtensionClients(): Set<WebSocket> {
    return this.extensionClients;
  }

  public getExtensionWorkspaces(): Map<WebSocket, string> {
    return this.extensionWorkspaces;
  }

  public resolveWorkspace(workspaceId?: string | null): WorkspaceState {
    if (workspaceId) {
      const match = this.workspaceManager.getWorkspace(workspaceId);
      if (match) return match;
      try {
        const decoded = Buffer.from(workspaceId, 'base64url').toString('utf8');
        if (fs.existsSync(decoded) && fs.statSync(decoded).isDirectory()) {
          return this.workspaceManager.registerWorkspace(decoded);
        }
      } catch {}
      if (fs.existsSync(workspaceId) && fs.statSync(workspaceId).isDirectory()) {
        return this.workspaceManager.registerWorkspace(workspaceId);
      }
    }
    const extPaths = Array.from(this.extensionWorkspaces.values());
    if (extPaths.length > 0) {
      const activeFromExt = this.workspaceManager.getWorkspaceByPath(extPaths[0]);
      if (activeFromExt) return activeFromExt;
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
      const candidateApkPaths = [
        path.resolve(_dirname, '../apk/app-debug.apk'),
        path.resolve(_dirname, '../web/app-debug.apk'),
        path.resolve(_dirname, '../../../../packages/web/android/app/build/outputs/apk/debug/app-debug.apk'),
      ];
      const apkPath = candidateApkPaths.find(p => fs.existsSync(p));
      if (apkPath) {
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
    this.codeRootsManager = new CodeRootsManager();
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

  public getCodeRootsManager(): CodeRootsManager {
    return this.codeRootsManager;
  }

  public getAllProjects(): RecentProject[] {
    const extPaths = Array.from(this.extensionWorkspaces.values()).map(p => path.resolve(p).toLowerCase());
    let openWorkspaces: WorkspaceState[];
    if (extPaths.length > 0) {
      openWorkspaces = extPaths.map(p => ({
        id: Buffer.from(p).toString('base64url'),
        name: path.basename(p),
        path: p,
        status: 'idle',
        lastActive: Date.now(),
        pendingApprovals: [],
      }));
    } else {
      const activeWs = this.workspaceManager.listWorkspaces()[0];
      openWorkspaces = activeWs ? [activeWs] : [];
    }

    const ideRecents = getRecentProjects(openWorkspaces);
    const scanned = this.codeRootsManager.scanAllProjects(openWorkspaces);

    const seen = new Set<string>();
    const combined: RecentProject[] = [];

    for (const p of ideRecents) {
      const lower = path.resolve(p.path).toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        combined.push(p);
      }
    }

    for (const p of scanned) {
      const lower = path.resolve(p.path).toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        combined.push(p);
      }
    }

    return combined;
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

    // Tailscale mesh (100.64.0.0/10) is cryptographically authenticated & encrypted by the user's Tailnet
    if (cleanIp.startsWith('100.')) return true;

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
        option: payload.option,
        reason: payload.reason,
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

  public serveStatic(reqUrl: string, res: http.ServerResponse): boolean {
    if (!fs.existsSync(WEB_DIST_PATH)) {
      return false;
    }

    let filePath = path.join(WEB_DIST_PATH, reqUrl === '/' ? 'index.html' : reqUrl.split('?')[0]);
    const rel = path.relative(WEB_DIST_PATH, filePath);
    if (rel.startsWith('..') || path.isAbsolute(rel) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
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
        handleHttpRequest(this, req, res);
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
        const isTrustedClient = isLocal || clientIp.startsWith('100.');
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
          token: isTrustedClient ? (this.getAuthToken() || undefined) : undefined,
          recentProjects: this.getAllProjects(),
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
            const targetWs = this.workspaceManager.registerWorkspace(normalized);
            targetWs.lastActive = Date.now();
            console.log(`[WsGateway] VS Code Extension Host attached for workspace: ${normalized}`);

            this.ideWatcher.autoDiscoverActiveConversation(normalized);
            const history = this.ideWatcher.getHistory();

            this.broadcast({
              type: 'server:active_workspace',
              workspaceId: targetWs.id,
            });
            this.broadcast({
              type: 'server:history',
              workspaceId: targetWs.id,
              messages: history,
              conversationTitle: this.ideWatcher.getConversationTitle(),
            });
            this.broadcast({
              type: 'server:workspaces_updated',
              workspaces: this.workspaceManager.listWorkspaces(),
            });
            this.broadcast({
              type: 'server:recent_projects_updated',
              projects: getRecentProjects(this.workspaceManager.listWorkspaces()),
            });
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

      case 'client:prompt_dialog': {
        const dialogReq: ApprovalRequest = {
          id: msg.dialogId || `dialog_${Date.now()}`,
          conversationId: 'ide_dialog',
          workspacePath: msg.workspacePath || process.cwd(),
          toolTitle: msg.title,
          isDialog: true,
          dialogData: {
            type: msg.dialogType || 'warning',
            title: msg.title,
            message: msg.message,
            detail: msg.detail,
            options: msg.options || ['Save', "Don't Save", 'Cancel'],
          },
          toolCall: {
            name: 'ask_question',
            args: {
              questions: [{
                question: `${msg.title || ''}\n${msg.message || ''}`.trim(),
                options: msg.options || ['Save', "Don't Save", 'Cancel'],
                is_multi_select: false,
              }],
            },
          },
          timestamp: Date.now(),
          timeoutSeconds: 300,
        };
        this.hookIpc.registerSyntheticRequest(dialogReq);
        this.broadcast({
          type: 'server:approval_requested',
          request: dialogReq,
        });
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

      case 'client:open_editor_tab': {
        if (msg.path) {
          this.broadcast({
            type: 'server:open_editor_tab',
            path: msg.path,
          });
        }
        break;
      }

      case 'client:close_tab': {
        const targetPath = msg.path;
        const targetLabel = msg.label;
        this.activeTabs = this.activeTabs.filter(t => {
          if (targetPath && t.path) return t.path !== targetPath;
          if (targetLabel && t.label) return t.label !== targetLabel;
          return true;
        });
        this.broadcast({
          type: 'server:close_editor_tab',
          path: targetPath,
          label: targetLabel,
        });
        this.broadcast({
          type: 'server:tabs_updated',
          tabs: this.activeTabs,
        });
        break;
      }

      case 'client:close_all_tabs': {
        this.activeTabs = [];
        this.broadcast({
          type: 'server:close_all_editor_tabs',
        });
        this.broadcast({
          type: 'server:tabs_updated',
          tabs: this.activeTabs,
        });
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
          const targetWs = this.workspaceManager.registerWorkspace(msg.path);
          targetWs.lastActive = Date.now();
          this.broadcast({
            type: 'server:active_workspace',
            workspaceId: targetWs.id,
          });
          this.broadcast({
            type: 'server:workspaces_updated',
            workspaces: this.workspaceManager.listWorkspaces(),
          });
          this.broadcast({
            type: 'server:recent_projects_updated',
            projects: this.getAllProjects(),
          });
        }
        break;

      case 'client:switch_workspace': {
        const targetWs = this.workspaceManager.getWorkspace((msg as any).workspaceId);
        if (targetWs) {
          targetWs.lastActive = Date.now();
          let history: ChatMessage[] = [];
          let convTitle = targetWs.name;
          if (targetWs.path) {
            const activeConvId = this.ideWatcher.autoDiscoverActiveConversation(targetWs.path);
            if (activeConvId) {
              history = this.ideWatcher.getHistory();
              convTitle = this.ideWatcher.getConversationTitle();
            }
          }
          this.broadcast({
            type: 'server:active_workspace',
            workspaceId: targetWs.id,
          });
          this.broadcast({
            type: 'server:history',
            workspaceId: targetWs.id,
            messages: history,
            conversationTitle: convTitle,
          });
          this.broadcast({
            type: 'server:workspaces_updated',
            workspaces: this.workspaceManager.listWorkspaces(),
          });

          // Forward to extension so desktop IDE window switches too
          if (targetWs.path && this.isIdeActive()) {
            for (const extWs of this.extensionClients) {
              if (extWs.readyState === WebSocket.OPEN) {
                extWs.send(JSON.stringify({ type: 'server:open_workspace', path: targetWs.path }));
              }
            }
          }
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
        const wsId = (msg as any).workspaceId;
        const targetWs = wsId ? this.workspaceManager.getWorkspace(wsId) : null;
        ws.send(
          JSON.stringify({
            type: 'server:conversations_list',
            conversations: this.ideWatcher.getRecentConversations(targetWs?.path),
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
          const targetPath = path.resolve(msg.path);
          const targetWs = this.workspaceManager.registerWorkspace(targetPath);
          targetWs.lastActive = Date.now();

          // Immediately switch tracking and broadcast to clients
          const activeConvId = this.ideWatcher.autoDiscoverActiveConversation(targetPath);
          const history = activeConvId ? this.ideWatcher.getHistory() : [];
          const convTitle = activeConvId ? this.ideWatcher.getConversationTitle() : `Opening ${targetWs.name}...`;

          this.broadcast({
            type: 'server:active_workspace',
            workspaceId: targetWs.id,
          });
          this.broadcast({
            type: 'server:history',
            workspaceId: targetWs.id,
            messages: history,
            conversationTitle: convTitle,
          });
          this.broadcast({
            type: 'server:workspaces_updated',
            workspaces: this.workspaceManager.listWorkspaces(),
          });

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

          launchRecentProject(targetPath, forwardCb).then(res => {
            this.broadcast({
              type: 'server:recent_projects_updated',
              projects: this.getAllProjects(),
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

  public resolveTargetWorkspace(explicitPath?: string): string | undefined {
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
