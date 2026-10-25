import path from 'path';
import { EventEmitter } from 'events';
import { WorkspaceState, WorkspaceStatus, ApprovalRequest } from '@agy-companion/protocol';

export class WorkspaceManager extends EventEmitter {
  private workspaces: Map<string, WorkspaceState> = new Map();

  constructor() {
    super();
  }

  private getNormalizedId(workspacePath: string): { id: string; resolvedPath: string } {
    const resolvedPath = path.resolve(workspacePath);
    const key = process.platform === 'win32' ? resolvedPath.toLowerCase() : resolvedPath;
    const id = Buffer.from(key).toString('base64url');
    return { id, resolvedPath };
  }

  private isInternalPath(resolvedPath: string): boolean {
    const base = path.basename(resolvedPath).toLowerCase();
    const norm = resolvedPath.toLowerCase().replace(/\\/g, '/');
    return (
      base === 'bin' ||
      norm.endsWith('/dist/bin') ||
      norm.includes('/packages/cli/dist') ||
      norm.includes('/node_modules/')
    );
  }

  public registerWorkspace(workspacePath: string, name?: string): WorkspaceState {
    const { id, resolvedPath } = this.getNormalizedId(workspacePath);
    const existing = this.workspaces.get(id);

    if (existing) {
      existing.lastActive = Date.now();
      return existing;
    }

    if (this.isInternalPath(resolvedPath)) {
      // Internal CLI path - do not register as a user workspace
      return {
        id,
        name: name || path.basename(resolvedPath) || 'root',
        path: resolvedPath,
        status: 'idle',
        lastActive: Date.now(),
        pendingApprovals: [],
      };
    }

    const state: WorkspaceState = {
      id,
      name: name || path.basename(resolvedPath) || 'root',
      path: resolvedPath,
      status: 'idle',
      lastActive: Date.now(),
      pendingApprovals: [],
    };

    this.workspaces.set(id, state);
    this.emit('workspaces_changed', this.listWorkspaces());
    return state;
  }

  public removeWorkspace(idOrPath: string): void {
    const { id } = this.getNormalizedId(idOrPath);
    if (this.workspaces.delete(id)) {
      this.emit('workspaces_changed', this.listWorkspaces());
    }
  }

  public getWorkspace(id: string): WorkspaceState | undefined {
    let ws = this.workspaces.get(id);
    if (!ws && id) {
      try {
        const decoded = Buffer.from(id, 'base64url').toString('utf8');
        ws = this.getWorkspaceByPath(decoded);
      } catch {}
    }
    if (!ws && id) {
      ws = this.getWorkspaceByPath(id);
    }
    return ws;
  }

  public getWorkspaceByPath(workspacePath: string): WorkspaceState | undefined {
    const { id } = this.getNormalizedId(workspacePath);
    return this.workspaces.get(id);
  }

  public updateStatus(id: string, status: WorkspaceStatus): void {
    const ws = this.workspaces.get(id);
    if (ws) {
      ws.status = status;
      ws.lastActive = Date.now();
      this.emit('workspaces_changed', this.listWorkspaces());
    }
  }

  public setConversationId(id: string, conversationId: string): void {
    const ws = this.workspaces.get(id);
    if (ws) {
      ws.currentConversationId = conversationId;
      ws.lastActive = Date.now();
      this.emit('workspaces_changed', this.listWorkspaces());
    }
  }

  public addPendingApproval(request: ApprovalRequest): void {
    let ws = this.getWorkspaceByPath(request.workspacePath);
    if (!ws) {
      ws = this.registerWorkspace(request.workspacePath);
    }
    ws.pendingApprovals.push(request);
    ws.status = 'waiting_approval';
    this.emit('workspaces_changed', this.listWorkspaces());
  }

  public removePendingApproval(requestId: string): void {
    for (const ws of this.workspaces.values()) {
      const idx = ws.pendingApprovals.findIndex(r => r.id === requestId);
      if (idx !== -1) {
        ws.pendingApprovals.splice(idx, 1);
        if (ws.pendingApprovals.length === 0 && ws.status === 'waiting_approval') {
          ws.status = 'busy';
        }
        this.emit('workspaces_changed', this.listWorkspaces());
        break;
      }
    }
  }

  public listWorkspaces(): WorkspaceState[] {
    const list = Array.from(this.workspaces.values()).filter(w => !this.isInternalPath(w.path));
    return list.sort((a, b) => (b.lastActive || 0) - (a.lastActive || 0));
  }
}
