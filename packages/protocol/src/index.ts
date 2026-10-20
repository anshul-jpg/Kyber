/**
 * @agy-companion/protocol
 * Shared type definitions and protocol contracts between CLI daemon and mobile client.
 */

export type ToolDecision = 'allow' | 'deny' | 'force_ask';

export interface ToolCallData {
  name: string;
  args: Record<string, any>;
}

export interface GitFileChange {
  file: string;
  relativePath: string;
  insertions: number;
  deletions: number;
  status: string; // 'M' | 'A' | 'D' | '??'
}

export interface ApprovalRequest {
  id: string;
  conversationId: string;
  workspacePath: string;
  stepIdx?: number;
  toolCall: ToolCallData;
  timestamp: number;
  timeoutSeconds: number;
  toolTitle?: string;
  gitChanges?: GitFileChange[];
}

export interface ApprovalDecisionPayload {
  requestId: string;
  decision: 'allow' | 'deny' | 'intercept';
  reason?: string;
  interceptPrompt?: string;
  selectedOption?: number; // 1 | 2 | 3 | 4
  permissionOverrides?: string[];
}

export type WorkspaceStatus = 'idle' | 'busy' | 'waiting_approval' | 'offline';

export interface WorkspaceState {
  id: string;
  name: string;
  path: string;
  status: WorkspaceStatus;
  currentConversationId?: string;
  lastActive: number;
  pendingApprovals: ApprovalRequest[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: number;
  thought?: string;
  toolCall?: ToolCallData;
  toolResult?: any;
  imageUrl?: string;
  images?: string[];
}

// WebSocket message envelope
export type WsClientMessage =
  | { type: 'client:hello'; deviceId: string; name?: string }
  | { type: 'client:respond_approval'; payload: ApprovalDecisionPayload }
  | {
      type: 'client:send_prompt';
      workspaceId: string;
      prompt: string;
      imageBase64?: string;
      imageName?: string;
      images?: { base64: string; name: string }[];
    }
  | { type: 'client:switch_workspace'; workspaceId: string }
  | { type: 'client:register_workspace'; path: string }
  | { type: 'client:set_mode'; mode: 'desk' | 'remote' }
  | { type: 'client:list_workspaces' }
  | { type: 'client:ping' };

export type WsServerMessage =
  | { type: 'server:hello'; daemonVersion: string; workspaces: WorkspaceState[]; history?: ChatMessage[]; mode?: 'desk' | 'remote' }
  | { type: 'server:workspaces_updated'; workspaces: WorkspaceState[] }
  | { type: 'server:approval_requested'; request: ApprovalRequest }
  | { type: 'server:approval_resolved'; requestId: string; decision: string }
  | { type: 'server:stream_token'; workspaceId: string; token: string }
  | { type: 'server:stream_thought'; workspaceId: string; thought: string }
  | { type: 'server:chat_message'; workspaceId: string; message: ChatMessage }
  | { type: 'server:history'; workspaceId: string; messages: ChatMessage[] }
  | { type: 'server:status_change'; workspaceId: string; status: WorkspaceStatus }
  | { type: 'server:mode_updated'; mode: 'desk' | 'remote' }
  | { type: 'server:pong'; timestamp?: number };

export const DEFAULT_DAEMON_PORT = 4040;
export const HOOK_IPC_PORT = 4041;
