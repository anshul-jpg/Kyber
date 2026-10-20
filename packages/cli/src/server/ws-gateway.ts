import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import {
  DEFAULT_DAEMON_PORT,
  WsClientMessage,
  WsServerMessage,
  ApprovalRequest,
  ApprovalDecisionPayload,
  WorkspaceState,
} from '@agy-companion/protocol';
import { HookIpcServer } from '../hooks/ipc-server.js';
import { WorkspaceManager } from '../session/workspace-manager.js';
import { AgyEngine } from '../engine/agy-engine.js';
import { IdeTranscriptWatcher } from '../session/ide-watcher.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Resolve path to packages/web/dist
const WEB_DIST_PATH = path.resolve(__dirname, '../../../web/dist');

export class WsGateway {
  private httpServer: http.Server | null = null;
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();
  private ideWatcher: IdeTranscriptWatcher;

  constructor(
    private hookIpc: HookIpcServer,
    private workspaceManager: WorkspaceManager,
    private agyEngine: AgyEngine,
    private port: number = DEFAULT_DAEMON_PORT
  ) {
    this.ideWatcher = new IdeTranscriptWatcher();
    this.setupHookListeners();
    this.setupIdeWatcher();
  }

  private getGlobalModeFilePath(): string {
    return path.resolve(os.homedir(), '.agy-companion-mode');
  }

  public getMode(): 'desk' | 'remote' {
    try {
      // 1. Check workspace-specific override if present
      const cwdPath = path.resolve(process.cwd(), '.agents/companion-mode');
      if (fs.existsSync(cwdPath)) {
        const val = fs.readFileSync(cwdPath, 'utf8').trim().toLowerCase();
        if (val === 'desk' || val === 'remote') return val;
      }
      // 2. Check global ~/.agy-companion-mode
      const globalPath = this.getGlobalModeFilePath();
      if (fs.existsSync(globalPath)) {
        const val = fs.readFileSync(globalPath, 'utf8').trim().toLowerCase();
        if (val === 'desk' || val === 'remote') return val;
      }
    } catch {}
    return 'remote';
  }

  public setMode(mode: 'desk' | 'remote'): void {
    try {
      // Always write to global file so all workspaces stay in sync
      const globalPath = this.getGlobalModeFilePath();
      fs.writeFileSync(globalPath, mode, 'utf8');

      // Also sync to workspace .agents/companion-mode if directory exists
      const cwdPath = path.resolve(process.cwd(), '.agents/companion-mode');
      if (fs.existsSync(path.dirname(cwdPath))) {
        fs.writeFileSync(cwdPath, mode, 'utf8');
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
        // Simple HTTP CORS & Health check
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        const url = req.url || '/';

        if (url === '/health' || url === '/api/health') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              status: 'ok',
              version: '0.1.0',
              workspacesCount: this.workspaceManager.listWorkspaces().length,
              pendingApprovals: this.hookIpc.getPendingRequests().length,
              mode: this.getMode(),
            })
          );
          return;
        }

        if (url === '/api/mode' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ mode: this.getMode() }));
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
              if (data.mode === 'desk' || data.mode === 'remote') {
                this.setMode(data.mode);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, mode: data.mode }));
              } else {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Mode must be desk or remote' }));
              }
            } catch (err: any) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        // Serve built web companion UI
        if (this.serveStatic(url, res)) {
          return;
        }

        res.writeHead(404);
        res.end();
      });

      this.wss = new WebSocketServer({ server: this.httpServer });

      this.wss.on('connection', (ws: WebSocket) => {
        this.clients.add(ws);

        // Send initial state & full conversation history on connection
        const helloMsg: WsServerMessage = {
          type: 'server:hello',
          daemonVersion: '0.1.0',
          workspaces: this.workspaceManager.listWorkspaces(),
          history: this.ideWatcher.getHistory(),
          mode: this.getMode(),
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

        ws.on('close', () => {
          this.clients.delete(ws);
        });

        ws.on('error', err => {
          console.error('[WsGateway] Client socket error:', err);
          this.clients.delete(ws);
        });
      });

      this.httpServer.listen(this.port, '0.0.0.0', () => {
        resolve();
      });

      this.httpServer.on('error', reject);
    });
  }

  private handleClientMessage(ws: WebSocket, msg: WsClientMessage): void {
    switch (msg.type) {
      case 'client:hello':
        // Acknowledge client connection
        break;

      case 'client:respond_approval':
        this.hookIpc.resolveApproval(msg.payload);
        break;

      case 'client:set_mode':
        if (msg.mode === 'desk' || msg.mode === 'remote') {
          this.setMode(msg.mode);
        }
        break;

      case 'client:list_workspaces':
        ws.send(
          JSON.stringify({
            type: 'server:workspaces_updated',
            workspaces: this.workspaceManager.listWorkspaces(),
          })
        );
        break;

      case 'client:send_prompt': {
        const wsState = this.workspaceManager.getWorkspace(msg.workspaceId) || this.workspaceManager.listWorkspaces()[0];
        if (!wsState) return;

        // If no active IDE conversation is yet attached, attempt auto-discovery
        if (!this.ideWatcher.getActiveConversationId()) {
          this.ideWatcher.autoDiscoverActiveConversation();
        }

        // If an active Antigravity IDE conversation is being tracked, inject into this IDE chat!
        if (this.ideWatcher.getActiveConversationId()) {
          const injected = this.ideWatcher.injectMessageToIde(msg.prompt);
          if (injected) {
            // Optimistically show user message on phone
            this.broadcast({
              type: 'server:chat_message',
              workspaceId: wsState.id,
              message: {
                id: `msg_u_${Date.now()}`,
                role: 'user',
                content: msg.prompt,
                timestamp: Date.now(),
              },
            });
            return;
          }
        }

        this.workspaceManager.updateStatus(wsState.id, 'busy');

        // Broadcast user's sent message to all connected devices
        this.broadcast({
          type: 'server:chat_message',
          workspaceId: wsState.id,
          message: {
            id: `msg_u_${Date.now()}`,
            role: 'user',
            content: msg.prompt,
            timestamp: Date.now(),
          },
        });

        // Fallback: Run turn with session continuity in CLI mode
        const turn = this.agyEngine.runTurn(wsState.path, msg.prompt, wsState.currentConversationId);

        turn.on('init', data => {
          this.workspaceManager.setConversationId(wsState.id, data.conversationId);
        });

        turn.on('step', step => {
          if (step.textDelta) {
            this.broadcast({
              type: 'server:stream_token',
              workspaceId: wsState.id,
              token: step.textDelta,
            });
          }
        });

        turn.on('result', res => {
          this.workspaceManager.updateStatus(wsState.id, 'idle');
          this.broadcast({
            type: 'server:chat_message',
            workspaceId: wsState.id,
            message: {
              id: `msg_a_${Date.now()}`,
              role: 'assistant',
              content: res.response || (res.status === 'ERROR' ? `Error: ${res.error}` : ''),
              timestamp: Date.now(),
            },
          });
        });

        turn.on('close', () => {
          if (wsState.status === 'busy') {
            this.workspaceManager.updateStatus(wsState.id, 'idle');
          }
        });
        break;
      }

      default:
        break;
    }
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
