import http from 'http';
import { EventEmitter } from 'events';
import { ApprovalRequest, ApprovalDecisionPayload, HOOK_IPC_PORT } from '@agy-companion/protocol';

interface PendingRequest {
  request: ApprovalRequest;
  resolve: (decision: { decision: 'allow' | 'deny' | 'force_ask'; reason?: string }) => void;
  timer: NodeJS.Timeout;
}

export class HookIpcServer extends EventEmitter {
  private server: http.Server | null = null;
  private pendingRequests: Map<string, PendingRequest> = new Map();

  constructor(private port: number = HOOK_IPC_PORT) {
    super();
  }

  public start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        if (req.method === 'POST' && req.url === '/api/hook/pre-tool-use') {
          let body = '';
          req.on('data', chunk => (body += chunk));
          req.on('end', () => {
            try {
              const hookContext = JSON.parse(body);
              this.handlePreToolUse(hookContext, res);
            } catch (err: any) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ decision: 'ask', reason: `Bad payload: ${err.message}` }));
            }
          });
        } else {
          res.writeHead(404);
          res.end();
        }
      });

      this.server.listen(this.port, '127.0.0.1', () => {
        resolve();
      });

      this.server.on('error', reject);
    });
  }

  private handlePreToolUse(hookContext: any, res: http.ServerResponse) {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const timeoutSeconds = 300;

    const request: ApprovalRequest = {
      id: requestId,
      conversationId: hookContext.conversationId || 'default',
      workspacePath: (hookContext.workspacePaths && hookContext.workspacePaths[0]) || process.cwd(),
      stepIdx: hookContext.stepIdx,
      toolCall: hookContext.toolCall || { name: 'unknown', args: {} },
      timestamp: Date.now(),
      timeoutSeconds,
    };

    const timer = setTimeout(() => {
      if (this.pendingRequests.has(requestId)) {
        this.pendingRequests.delete(requestId);
        this.emit('approval_timeout', request);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ decision: 'ask', reason: 'Mobile approval timed out' }));
      }
    }, timeoutSeconds * 1000);

    this.pendingRequests.set(requestId, {
      request,
      resolve: decision => {
        clearTimeout(timer);
        this.pendingRequests.delete(requestId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(decision));
      },
      timer,
    });

    // Emit event so WebSocket Gateway can push to mobile
    this.emit('approval_requested', request, hookContext);
  }

  public resolveApproval(payload: ApprovalDecisionPayload): boolean {
    const pending = this.pendingRequests.get(payload.requestId);
    if (!pending) return false;

    if (payload.decision === 'allow') {
      pending.resolve({ decision: 'allow' });
    } else if (payload.decision === 'deny') {
      pending.resolve({
        decision: 'deny',
        reason: payload.reason || 'Denied remotely via companion app',
      });
    } else if (payload.decision === 'intercept') {
      pending.resolve({
        decision: 'deny',
        reason: `Intercepted by user: ${payload.interceptPrompt || 'Execution halted'}`,
      });
    }

    this.emit('approval_resolved', payload);
    return true;
  }

  public getPendingRequests(): ApprovalRequest[] {
    return Array.from(this.pendingRequests.values()).map(p => p.request);
  }

  public stop(): Promise<void> {
    return new Promise(resolve => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }
}
