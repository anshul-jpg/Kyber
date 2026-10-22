import { ApprovalRequest, PairingTicket, QuickAction, CompanionMode } from '@agy-companion/protocol';

export type DaemonStatus = 'stopped' | 'starting' | 'running' | 'error';
export type { CompanionMode };

export interface PairingEndpoint {
  type: 'local' | 'tailscale' | 'cloudflare';
  title: string;
  url: string;
  ticket: string;
  isAvailable: boolean;
}

export interface ConnectedDevice {
  deviceId: string;
  name: string;
  ip?: string;
  lastPing: number;
}

export interface MeshStatus {
  tailscaleMeshed: boolean;
  tailscaleIp?: string | null;
  cloudflareRouting: boolean;
  cloudflareUrl?: string | null;
  phoneConnected: boolean;
  phoneCount: number;
}

export interface LogLine {
  id: string;
  text: string;
  level: 'info' | 'warn' | 'error' | 'ws' | 'ipc';
  timestamp: number;
}

export interface ExtensionState {
  daemonStatus: DaemonStatus;
  mode: CompanionMode;
  endpoints: PairingEndpoint[];
  activeEndpointType: 'local' | 'tailscale' | 'cloudflare';
  connectedDevices: ConnectedDevice[];
  pendingApprovals: ApprovalRequest[];
  isHookInstalledInWorkspace: boolean;
  workspacePath?: string;
  daemonPort: number;
  ipcPort: number;
  meshStatus: MeshStatus;
  quickActions: QuickAction[];
}
