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
  gitDiff?: string;
  isPaused?: boolean;
}

export interface EditorTab {
  label: string;
  path: string;
  isActive: boolean;
  isDirty?: boolean;
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

export interface WorkspaceFileEntry {
  name: string;
  isDirectory: boolean;
  path: string;
  size?: number;
}

export interface AudioAttachment {
  base64: string;
  mimeType: string;
  duration?: number;
  name?: string;
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
  audio?: AudioAttachment;
}

export interface QuickAction {
  id: string;
  label: string;
  command: string;
}

export type CompanionMode = 'desk' | 'remote' | 'auto' | 'autonomous';
export type ExecutionPolicy = 'force_ask' | 'always_proceed' | 'autonomous';

export interface AgentQuota {
  id: string;
  name: string;
  provider: 'Google' | 'Anthropic' | 'OpenAI';
  badge: string;
  isActive: boolean;
  usedPercent: number; // 0 to 100
  usedUnits: number;
  totalUnits: number;
  unitLabel: string; // e.g. "reqs"
  resetTimestamp: number; // epoch ms
  resetWindowText: string; // e.g. "1h window"
  status: 'optimal' | 'moderate' | 'exhausted';
}

export interface HostTelemetry {
  cpuPercent: number;
  totalMemMb: number;
  usedMemMb: number;
  freeMemMb: number;
  usedMemPercent: number;
  platform: string;
  uptimeSeconds: number;
  activeProvider?: string;
  ideStatus: 'active' | 'dormant';
  hostIdePolicy?: 'always-proceed' | 'always-ask' | 'unknown';
  isGlobalHookInstalled?: boolean;
}

// WebSocket message envelope
export type WsClientMessage =
  | { type: 'client:hello'; deviceId: string; name?: string; workspacePath?: string; token?: string }
  | { type: 'client:respond_approval'; payload: ApprovalDecisionPayload }
  | {
      type: 'client:send_prompt';
      workspaceId: string;
      prompt: string;
      imageBase64?: string;
      imageName?: string;
      images?: { base64: string; name: string }[];
      audio?: AudioAttachment;
      model?: string;
    }
  | { type: 'client:switch_workspace'; workspaceId: string }
  | { type: 'client:register_workspace'; path: string }
  | { type: 'client:launch_project'; path: string }
  | { type: 'client:close_ide'; providerId?: string }
  | { type: 'client:restart_ide'; providerId?: string; workspacePath?: string }
  | { type: 'client:get_telemetry' }
  | { type: 'client:set_mode'; mode: CompanionMode }
  | { type: 'client:set_execution_policy'; policy: ExecutionPolicy }
  | { type: 'client:run_quick_action'; command: string; label?: string }
  | { type: 'client:list_workspaces' }
  | { type: 'client:emergency_stop'; workspaceId?: string }
  | { type: 'client:list_conversations' }
  | { type: 'client:switch_conversation'; conversationId: string }
  | { type: 'client:get_agent_quotas' }
  | { type: 'client:clear_approvals' }
  | { type: 'client:list_workspace_files'; workspaceId?: string; subPath?: string }
  | { type: 'client:update_tabs'; tabs: EditorTab[]; workspaceId?: string }
  | { type: 'client:ping' };

export interface ConversationSummary {
  id: string;
  title: string;
  timestamp: number;
}

export interface RecentProject {
  name: string;
  path: string;
  isOpen: boolean;
  hasHook: boolean;
  lastModified?: number;
}

export interface TerminalEntry {
  id: string;
  command?: string;
  output: string;
  exitCode?: number;
  timestamp: number;
}

export type WsServerMessage =
  | { type: 'server:hello'; daemonVersion: string; workspaces: WorkspaceState[]; history?: ChatMessage[]; mode?: CompanionMode; executionPolicy?: ExecutionPolicy; conversationTitle?: string; conversations?: ConversationSummary[]; tailscaleIp?: string | null; quickActions?: QuickAction[]; connectedPhoneCount?: number; ideStatus?: 'active' | 'dormant'; apkBuildTime?: number; agentQuotas?: AgentQuota[]; activeTabs?: EditorTab[]; token?: string; recentProjects?: RecentProject[]; terminalHistory?: TerminalEntry[]; telemetry?: HostTelemetry }
  | { type: 'server:workspaces_updated'; workspaces: WorkspaceState[] }
  | { type: 'server:workspace_files'; workspaceId: string; subPath: string; files: WorkspaceFileEntry[] }
  | { type: 'server:approval_requested'; request: ApprovalRequest }
  | { type: 'server:approval_paused'; request: ApprovalRequest }
  | { type: 'server:approval_resolved'; requestId: string; decision: string }
  | { type: 'server:stream_token'; workspaceId: string; token: string }
  | { type: 'server:stream_thought'; workspaceId: string; thought: string }
  | { type: 'server:chat_message'; workspaceId: string; message: ChatMessage; isIdeBusy?: boolean }
  | { type: 'server:history'; workspaceId: string; messages: ChatMessage[]; conversationTitle?: string }
  | { type: 'server:conversations_list'; conversations: ConversationSummary[] }
  | { type: 'server:status_change'; workspaceId: string; status: WorkspaceStatus }
  | { type: 'server:mode_updated'; mode: CompanionMode }
  | { type: 'server:execution_policy_updated'; policy: ExecutionPolicy }
  | { type: 'server:quick_actions_updated'; actions: QuickAction[] }
  | { type: 'server:device_count_updated'; count: number }
  | { type: 'server:run_quick_action'; command: string; label?: string }
  | { type: 'server:forward_prompt'; prompt: string; workspaceId?: string; images?: { base64: string; name: string }[]; audio?: AudioAttachment; model?: string }
  | { type: 'server:emergency_stop'; workspaceId?: string }
  | { type: 'server:ide_status'; status: 'active' | 'dormant' }
  | { type: 'server:apk_status'; hasApk: boolean; apkBuildTime?: number; size?: number; version?: string }
  | { type: 'server:agent_quotas'; quotas: AgentQuota[] }
  | { type: 'server:tabs_updated'; tabs: EditorTab[]; workspaceId?: string }
  | { type: 'server:terminal_output'; entry: TerminalEntry }
  | { type: 'server:recent_projects_updated'; projects: RecentProject[] }
  | { type: 'server:open_workspace'; path: string }
  | { type: 'server:host_telemetry'; telemetry: HostTelemetry }
  | { type: 'server:pong'; timestamp?: number };

export const DEFAULT_DAEMON_PORT = 4040;
export const HOOK_IPC_PORT = 4041;

export interface PairingTicket {
  version: 1;
  host: string;
  port: number;
  ssl: boolean;
  token: string;
  workspaceId?: string;
  tunnelUrl?: string;
}

export function encodePairingTicket(ticket: PairingTicket): string {
  const json = JSON.stringify(ticket);
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(json, 'utf8').toString('base64url');
  }
  return btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodePairingTicket(raw: string): PairingTicket | null {
  try {
    let clean = raw.trim();
    if (clean.includes('ticket=')) {
      const match = clean.match(/[?&]ticket=([a-zA-Z0-9_-]+)/);
      if (match) clean = match[1];
    }
    let base64 = clean.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) base64 += '=';
    let json: string;
    if (typeof Buffer !== 'undefined') {
      json = Buffer.from(base64, 'base64').toString('utf8');
    } else {
      json = decodeURIComponent(escape(atob(base64)));
    }
    const parsed = JSON.parse(json);
    if (parsed && parsed.host && parsed.port) {
      return parsed as PairingTicket;
    }
    return null;
  } catch {
    return null;
  }
}
