import http from 'http';
import { EventEmitter } from 'events';
import { execSync } from 'child_process';
import path from 'path';
import { ApprovalRequest, ApprovalDecisionPayload, GitFileChange, HOOK_IPC_PORT } from '@agy-companion/protocol';

interface PendingRequest {
  request: ApprovalRequest;
  resolve: (decision: { decision: 'allow' | 'deny' | 'force_ask'; reason?: string; permissionOverrides?: string[] }) => void;
  timer: NodeJS.Timeout;
}

function getWorkspaceGitChanges(cwd: string): GitFileChange[] {
  try {
    const numstat = execSync('git diff --numstat', { cwd, encoding: 'utf8', timeout: 2500 });
    const status = execSync('git status --porcelain', { cwd, encoding: 'utf8', timeout: 2500 });
    const changes: GitFileChange[] = [];
    const statusMap = new Map<string, string>();
    for (const line of status.trim().split('\n')) {
      if (!line) continue;
      const s = line.substring(0, 2).trim();
      const f = line.substring(3).trim();
      statusMap.set(f, s);
    }
    for (const line of numstat.trim().split('\n')) {
      if (!line) continue;
      const parts = line.split('\t');
      if (parts.length >= 3) {
        const ins = parseInt(parts[0], 10) || 0;
        const del = parseInt(parts[1], 10) || 0;
        const file = parts[2].trim();
        changes.push({
          file: path.basename(file),
          relativePath: file,
          insertions: ins,
          deletions: del,
          status: statusMap.get(file) || 'M',
        });
      }
    }
    return changes;
  } catch {
    return [];
  }
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
    const timeoutSeconds = 3600;
    const wsPath = (hookContext.workspacePaths && hookContext.workspacePaths[0]) || process.cwd();

    const toolCall = hookContext.toolCall || { name: 'unknown', args: {} };
    const toolAction = toolCall.args?.toolAction || toolCall.args?.toolSummary || toolCall.args?.Description;
    const cmd = toolCall.args?.CommandLine;
    const toolTitle = toolAction ? `Allow ${toolAction}?` : (cmd ? `Allow running ${cmd}?` : `Allow executing ${toolCall.name}?`);

    const gitChanges = getWorkspaceGitChanges(wsPath);

    const request: ApprovalRequest = {
      id: requestId,
      conversationId: hookContext.conversationId || 'default',
      workspacePath: wsPath,
      stepIdx: hookContext.stepIdx,
      toolCall,
      toolTitle,
      gitChanges,
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
      const cmd = pending.request.toolCall?.args?.CommandLine;
      const overrides = cmd ? [`command(${cmd})`] : undefined;
      pending.resolve({
        decision: 'allow',
        ...(overrides ? { permissionOverrides: overrides } : {}),
      });
    } else if (payload.decision === 'deny') {
      pending.resolve({
        decision: 'deny',
        reason: payload.reason || payload.interceptPrompt || 'Denied remotely via companion app',
      });
    } else if (payload.decision === 'intercept') {
      pending.resolve({
        decision: 'deny',
        reason: `User redirected agent: ${payload.interceptPrompt || 'Execution halted'}`,
      });
    }

    this.emit('approval_resolved', payload);
    return true;
  }

  public resolveByCommand(commandLine: string): void {
    for (const [id, pending] of this.pendingRequests.entries()) {
      if (pending.request.toolCall?.args?.CommandLine === commandLine) {
        pending.resolve({ decision: 'allow' });
        this.emit('approval_resolved', { requestId: id, decision: 'allow' });
        break;
      }
    }
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
