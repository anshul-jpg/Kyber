import http from 'http';
import { EventEmitter } from 'events';
import { execSync, execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { ApprovalRequest, ApprovalDecisionPayload, GitFileChange, HOOK_IPC_PORT } from '@agy-companion/protocol';
import { killStalePort } from '../server/port-cleaner.js';

interface PendingRequest {
  request: ApprovalRequest;
  resolve: (decision: { decision: 'allow' | 'deny' | 'force_ask'; reason?: string; permissionOverrides?: string[] }) => void;
  timer: NodeJS.Timeout;
}

function loadCompanionIgnorePatterns(cwd: string): string[] {
  const defaults = ['node_modules', '.git', 'dist', 'build', '.next', '.turbo', '*.log', '*.lock'];
  try {
    const ignoreFile = path.join(cwd, '.companionignore');
    if (fs.existsSync(ignoreFile)) {
      const lines = fs.readFileSync(ignoreFile, 'utf8')
        .split('\n')
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('#'));
      return [...defaults, ...lines];
    }
  } catch {}
  return defaults;
}

function isPathIgnored(relPath: string, patterns: string[]): boolean {
  const norm = relPath.replace(/\\/g, '/');
  for (const pat of patterns) {
    const cleanPat = pat.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
    if (!cleanPat) continue;
    if (cleanPat.startsWith('*.')) {
      if (norm.endsWith(cleanPat.slice(1))) return true;
    } else if (norm.includes(cleanPat)) {
      return true;
    }
  }
  return false;
}

interface GitCacheEntry {
  changes: GitFileChange[];
  time: number;
  updating?: boolean;
}

const gitCache = new Map<string, GitCacheEntry>();

function parseGitOutput(cwd: string, numstat: string, status: string): GitFileChange[] {
  const ignorePatterns = loadCompanionIgnorePatterns(cwd);
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
      if (isPathIgnored(file, ignorePatterns)) continue;
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
}

function refreshGitChangesAsync(normCwd: string): void {
  execFile('git', ['diff', '--numstat'], { cwd: normCwd, encoding: 'utf8', timeout: 2500, windowsHide: true }, (err1, numstat) => {
    if (err1) return;
    execFile('git', ['status', '--porcelain'], { cwd: normCwd, encoding: 'utf8', timeout: 2500, windowsHide: true }, (err2, status) => {
      if (err2) return;
      try {
        const changes = parseGitOutput(normCwd, numstat || '', status || '');
        gitCache.set(normCwd, { changes, time: Date.now(), updating: false });
      } catch {}
    });
  });
}

export function getWorkspaceGitChanges(cwd: string): GitFileChange[] {
  const normCwd = path.resolve(cwd);
  const now = Date.now();
  const cached = gitCache.get(normCwd);

  if (cached) {
    if (now - cached.time < 3000) {
      return cached.changes;
    }
    // Stale: trigger background async refresh without blocking event loop
    if (!cached.updating) {
      cached.updating = true;
      refreshGitChangesAsync(normCwd);
    }
    return cached.changes;
  }

  // First time for this cwd: sync fallback with 1500ms timeout
  try {
    const numstat = execSync('git diff --numstat', { cwd: normCwd, encoding: 'utf8', timeout: 1500, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
    const status = execSync('git status --porcelain', { cwd: normCwd, encoding: 'utf8', timeout: 1500, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
    const changes = parseGitOutput(normCwd, numstat, status);
    gitCache.set(normCwd, { changes, time: now, updating: false });
    return changes;
  } catch {
    gitCache.set(normCwd, { changes: [], time: now, updating: false });
    return [];
  }
}

export class HookIpcServer extends EventEmitter {
  private server: http.Server | null = null;
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private pausedRequests: Map<string, ApprovalRequest> = new Map();
  private resolvedHistory: Map<string, { decision: string; timestamp: number }> = new Map();

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

      try {
        killStalePort(this.port);
      } catch {}

      this.server.listen(this.port, '127.0.0.1', () => {
        resolve();
      });

      this.server.on('error', reject);
    });
  }

  private handlePreToolUse(hookContext: any, res: http.ServerResponse) {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const timeoutSeconds = 120; // 2-minute fail-closed timeout before desktop prompt fallback
    const wsPath = (hookContext.workspacePaths && hookContext.workspacePaths[0]) || process.cwd();

    const toolCall = hookContext.toolCall || { name: 'unknown', args: {} };
    const toolAction = toolCall.args?.toolAction || toolCall.args?.toolSummary || toolCall.args?.Description;
    const cmd = toolCall.args?.CommandLine;
    let toolTitle = `Allow executing ${toolCall.name}?`;
    if (toolCall.name === 'run_command' && cmd) {
      toolTitle = `Run: ${cmd}`;
    } else if (toolCall.name === 'write_to_file') {
      const target = toolCall.args?.TargetFile ? path.basename(toolCall.args.TargetFile) : 'file';
      toolTitle = `Write File: ${target}`;
    } else if (toolCall.name === 'replace_file_content' || toolCall.name === 'multi_replace_file_content') {
      const target = toolCall.args?.TargetFile ? path.basename(toolCall.args.TargetFile) : 'file';
      toolTitle = `Edit File: ${target}${toolAction ? ` (${toolAction})` : ''}`;
    } else if (toolCall.name === 'ask_question') {
      const q = toolCall.args?.questions?.[0]?.question || toolAction || 'Question from Agent';
      toolTitle = q;
    } else if (toolAction) {
      toolTitle = `Allow ${toolAction}?`;
    }

    const gitChanges = getWorkspaceGitChanges(wsPath);

    let gitDiff: string | undefined;
    if (toolCall.name === 'replace_file_content' && toolCall.args?.TargetContent !== undefined && toolCall.args?.ReplacementContent !== undefined) {
      const targetLines = String(toolCall.args.TargetContent).split('\n');
      const replacementLines = String(toolCall.args.ReplacementContent).split('\n');
      const targetName = toolCall.args.TargetFile ? path.basename(toolCall.args.TargetFile) : 'file';
      const startLine = Number(toolCall.args.StartLine) || 1;
      gitDiff = [
        `--- a/${targetName}`,
        `+++ b/${targetName}`,
        `@@ -${startLine},${targetLines.length} +${startLine},${replacementLines.length} @@`,
        ...targetLines.map((l: string) => `-${l}`),
        ...replacementLines.map((l: string) => `+${l}`),
      ].join('\n');
    } else if (toolCall.name === 'multi_replace_file_content' && Array.isArray(toolCall.args?.ReplacementChunks)) {
      const targetName = toolCall.args.TargetFile ? path.basename(toolCall.args.TargetFile) : 'file';
      const diffChunks: string[] = [`--- a/${targetName}`, `+++ b/${targetName}`];
      for (const chunk of toolCall.args.ReplacementChunks) {
        const targetLines = String(chunk.TargetContent || '').split('\n');
        const repLines = String(chunk.ReplacementContent || '').split('\n');
        const startLine = Number(chunk.StartLine) || 1;
        diffChunks.push(`@@ -${startLine},${targetLines.length} +${startLine},${repLines.length} @@`);
        targetLines.forEach(l => diffChunks.push(`-${l}`));
        repLines.forEach(l => diffChunks.push(`+${l}`));
      }
      gitDiff = diffChunks.join('\n');
    } else if (toolCall.name === 'write_to_file' && toolCall.args?.CodeContent !== undefined) {
      const targetFile = toolCall.args.TargetFile ? path.resolve(toolCall.args.TargetFile) : '';
      const targetName = targetFile ? path.basename(targetFile) : 'file';
      const newLines = String(toolCall.args.CodeContent).split('\n');

      if (targetFile && fs.existsSync(targetFile)) {
        try {
          const oldContent = fs.readFileSync(targetFile, 'utf8');
          const oldLines = oldContent.split('\n');
          gitDiff = [
            `--- a/${targetName}`,
            `+++ b/${targetName}`,
            `@@ -1,${oldLines.length} +1,${newLines.length} @@`,
            ...oldLines.map((l: string) => `-${l}`),
            ...newLines.map((l: string) => `+${l}`),
          ].join('\n');
        } catch {
          gitDiff = [
            `--- /dev/null`,
            `+++ b/${targetName}`,
            `@@ -0,0 +1,${newLines.length} @@`,
            ...newLines.map((l: string) => `+${l}`),
          ].join('\n');
        }
      } else {
        gitDiff = [
          `--- /dev/null`,
          `+++ b/${targetName}`,
          `@@ -0,0 +1,${newLines.length} @@`,
          ...newLines.map((l: string) => `+${l}`),
        ].join('\n');
      }
    } else if (gitChanges.length > 0 && !gitDiff) {
      try {
        const fullDiff = execSync('git diff -U3', { cwd: wsPath, encoding: 'utf8', timeout: 1500, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
        if (fullDiff && fullDiff.trim()) {
          gitDiff = fullDiff.trim();
        }
      } catch {}
    }

    const request: ApprovalRequest = {
      id: requestId,
      conversationId: hookContext.conversationId || 'default',
      workspacePath: wsPath,
      stepIdx: hookContext.stepIdx,
      toolCall,
      toolTitle,
      gitChanges,
      gitDiff,
      timestamp: Date.now(),
      timeoutSeconds,
    };

    const timer = setTimeout(() => {
      if (this.pendingRequests.has(requestId)) {
        this.pendingRequests.delete(requestId);

        const pausedReq: ApprovalRequest = { ...request, isPaused: true };
        this.pausedRequests.set(requestId, pausedReq);
        this.resolvedHistory.set(requestId, { decision: 'deny', timestamp: Date.now() });
        this.emit('approval_paused', pausedReq);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          decision: 'deny',
          reason: 'Execution Paused: Waiting for mobile companion approval. Session frozen safely without desktop prompt.'
        }));
      }
    }, timeoutSeconds * 1000);

    this.pendingRequests.set(requestId, {
      request,
      resolve: decision => {
        clearTimeout(timer);
        this.pendingRequests.delete(requestId);
        this.resolvedHistory.set(requestId, { decision: decision.decision, timestamp: Date.now() });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(decision));
      },
      timer,
    });

    // Clean old history entries (>15 mins)
    const cutoff = Date.now() - 15 * 60 * 1000;
    for (const [id, entry] of this.resolvedHistory.entries()) {
      if (entry.timestamp < cutoff) this.resolvedHistory.delete(id);
    }

    // Emit event so WebSocket Gateway can push to mobile
    this.emit('approval_requested', request, hookContext);
  }

  public resolveApproval(payload: ApprovalDecisionPayload): boolean {
    const pending = this.pendingRequests.get(payload.requestId);
    if (!pending) {
      return false;
    }
    clearTimeout(pending.timer);
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
    this.pendingRequests.delete(payload.requestId);
    this.pausedRequests.delete(payload.requestId);
    this.resolvedHistory.set(payload.requestId, { decision: payload.decision, timestamp: Date.now() });
    this.emit('approval_resolved', payload);
    return true;
  }

  public getPausedRequest(requestId: string): ApprovalRequest | undefined {
    return this.pausedRequests.get(requestId);
  }

  public clearPausedRequest(requestId: string): void {
    this.pausedRequests.delete(requestId);
  }

  public registerSyntheticRequest(request: ApprovalRequest): void {
    const timer = setTimeout(() => {
      this.pendingRequests.delete(request.id);
      this.emit('approval_resolved', { requestId: request.id, decision: 'deny', reason: 'Dialog timed out' });
    }, (request.timeoutSeconds || 300) * 1000);

    this.pendingRequests.set(request.id, {
      request,
      resolve: () => {
        clearTimeout(timer);
        this.pendingRequests.delete(request.id);
      },
      timer,
    });
  }

  public clearAllApprovals(reason: string = 'Cleared by user'): void {
    for (const [id, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timer);
      pending.resolve({ decision: 'deny', reason });
      this.emit('approval_resolved', { requestId: id, decision: 'deny', reason });
    }
    this.pendingRequests.clear();
  }

  public resolveLatest(decision: 'allow' | 'deny'): boolean {
    const entries = Array.from(this.pendingRequests.entries());
    if (entries.length === 0) return false;
    const [latestId] = entries[entries.length - 1];
    return this.resolveApproval({ requestId: latestId, decision });
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
    const active = Array.from(this.pendingRequests.values()).map(p => p.request);
    const paused = Array.from(this.pausedRequests.values());
    return [...active, ...paused];
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
