import React, { useState } from 'react';
import {
  ChevronDown,
  Plus,
  History,
  MoreHorizontal,
  X,
  Folder,
  Smartphone,
  Laptop,
  Radio,
  OctagonAlert,
  Settings,
  Download,
  RefreshCw,
  Zap,
  Check,
  Power,
  Cpu,
} from 'lucide-react';
import { CompanionMode, ExecutionPolicy, WorkspaceState, HostTelemetry } from '@agy-companion/protocol';
import { triggerHaptic } from './CommonUI';

interface HeaderProps {
  conversationTitle: string;
  hasMessages: boolean;
  activeActionModal: string | null;
  onToggleExplorer: () => void;
  onNewChat: () => void;
  onOpenHistory: () => void;
  showOptionsDropdown: boolean;
  setShowOptionsDropdown: (show: boolean) => void;
  companionMode: CompanionMode;
  onToggleMode: (mode: CompanionMode) => void;
  executionPolicy?: ExecutionPolicy;
  onTogglePolicy?: (policy: ExecutionPolicy) => void;
  onEmergencyStop: () => void;
  onOpenSettings: () => void;
  connected: boolean;
  host: string;
  onSelectHost: (host: string, port: string) => void;
  ideStatus?: 'active' | 'dormant';
  isNativeApp?: boolean;
  apkUpdateAvailable?: boolean;
  apkUpdateProgress?: { inProgress: boolean; percent: number; status: string } | null;
  onInstallApk: () => void;
  workspaces?: WorkspaceState[];
  activeWorkspaceId?: string;
  onSelectWorkspace?: (id: string) => void;
  recentProjects?: import('@agy-companion/protocol').RecentProject[];
  onLaunchRecentProject?: (path: string) => void;
  hostTelemetry?: HostTelemetry | null;
  onCloseIde?: (providerId?: string) => void;
  onRestartIde?: (providerId?: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  conversationTitle,
  hasMessages,
  activeActionModal,
  onToggleExplorer,
  onNewChat,
  onOpenHistory,
  showOptionsDropdown,
  setShowOptionsDropdown,
  companionMode,
  onToggleMode,
  executionPolicy = 'force_ask',
  onTogglePolicy,
  onEmergencyStop,
  onOpenSettings,
  connected,
  host,
  onSelectHost,
  ideStatus = 'active',
  isNativeApp = false,
  apkUpdateAvailable = false,
  apkUpdateProgress = null,
  onInstallApk,
  workspaces = [],
  activeWorkspaceId,
  onSelectWorkspace,
  recentProjects = [],
  onLaunchRecentProject,
  hostTelemetry = null,
  onCloseIde,
  onRestartIde,
}) => {
  const [showWorkspaceDropdown, setShowWorkspaceDropdown] = useState(false);
  const activeWs = workspaces.find(w => w.id === activeWorkspaceId) || workspaces[0];

  return (
    <>
      <header
        style={{
          background: '#181818',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: 'max(env(safe-area-inset-top, 0px), 8px)',
          paddingBottom: '8px',
          paddingLeft: 'max(14px, env(safe-area-inset-left, 0px))',
          paddingRight: 'max(14px, env(safe-area-inset-right, 0px))',
          minHeight: 'calc(48px + max(env(safe-area-inset-top, 0px), 0px))',
          boxSizing: 'border-box',
          zIndex: 40,
          flexShrink: 0,
        }}
      >
        {/* Left: Active Workspace Pill / Multi-Window Switcher */}
        <div style={{ position: 'relative', maxWidth: '62%', minWidth: 0, flexShrink: 1 }}>
          <div
            onClick={() => {
              const next = !showWorkspaceDropdown;
              setShowWorkspaceDropdown(next);
              if (next) {
                setShowOptionsDropdown(false);
              }
              triggerHaptic(20);
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '7px',
              cursor: 'pointer',
              background: showWorkspaceDropdown ? '#252528' : 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              padding: '5px 10px',
              borderRadius: '8px',
              transition: 'all 120ms ease',
              maxWidth: '100%',
              userSelect: 'none',
            }}
          >
            <div
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background:
                  activeWs?.status === 'waiting_approval'
                    ? '#f59e0b'
                    : activeWs?.status === 'busy'
                    ? '#0078d4'
                    : ideStatus === 'dormant'
                    ? '#f59e0b'
                    : '#10b981',
                boxShadow:
                  ideStatus === 'dormant'
                    ? '0 0 6px rgba(245, 158, 11, 0.5)'
                    : activeWs?.status === 'busy'
                    ? '0 0 6px rgba(0, 120, 212, 0.5)'
                    : '0 0 6px rgba(16, 185, 129, 0.4)',
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: '#ffffff',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                letterSpacing: '-0.01em',
              }}
            >
              {activeWs?.name || (!hasMessages ? 'Agent' : conversationTitle)}
            </span>
            <ChevronDown
              size={12}
              color="#858585"
              style={{
                transform: showWorkspaceDropdown ? 'rotate(180deg)' : 'none',
                transition: 'transform 150ms ease',
                flexShrink: 0,
              }}
            />
          </div>

          {/* Workspace Switcher Modal Dropdown */}
          {showWorkspaceDropdown && (
            <>
              <div
                onClick={() => setShowWorkspaceDropdown(false)}
                style={{ position: 'fixed', inset: 0, zIndex: 90 }}
              />
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  left: 0,
                  width: '280px',
                  background: '#1c1c1f',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '10px',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
                  zIndex: 95,
                  padding: '6px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                }}
              >
                {/* IDE Session Status Banner inside dropdown */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '7px 9px',
                    background: 'rgba(255, 255, 255, 0.03)',
                    borderRadius: '7px',
                    fontSize: '11px',
                    marginBottom: '4px',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                  }}
                >
                  <span style={{ color: '#858585', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span
                      style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        background: ideStatus === 'dormant' ? '#f59e0b' : '#10b981',
                        boxShadow: ideStatus === 'dormant' ? '0 0 5px rgba(245, 158, 11, 0.5)' : '0 0 5px rgba(16, 185, 129, 0.4)',
                      }}
                    />
                    IDE Session
                  </span>
                  <span style={{ color: ideStatus === 'dormant' ? '#fbbf24' : '#10b981', fontWeight: 600 }}>
                    {ideStatus === 'dormant' ? 'Dormant (Buffering)' : 'Active & Synced'}
                  </span>
                </div>

                <div
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    color: '#71717a',
                    padding: '4px 8px 3px 8px',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                  }}
                >
                  Active Containers ({workspaces.length})
                </div>

                {workspaces && workspaces.length > 0 ? (
                  workspaces.map(ws => {
                    const isSelected = ws.id === (activeWorkspaceId || activeWs?.id);
                    return (
                      <div
                        key={ws.id}
                        onClick={() => {
                          onSelectWorkspace?.(ws.id);
                          setShowWorkspaceDropdown(false);
                          triggerHaptic(20);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '7px 10px',
                          borderRadius: '6px',
                          background: isSelected ? '#2a2a2e' : 'transparent',
                          cursor: 'pointer',
                          color: '#ffffff',
                          fontSize: '12.5px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                          <div
                            style={{
                              width: '6px',
                              height: '6px',
                              borderRadius: '50%',
                              background:
                                ws.status === 'waiting_approval'
                                  ? '#f59e0b'
                                  : ws.status === 'busy'
                                  ? '#007acc'
                                  : '#10b981',
                              flexShrink: 0,
                            }}
                          />
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontWeight: isSelected ? 600 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {ws.name}
                            </div>
                            <div style={{ fontSize: '10.5px', color: '#71717a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {ws.path}
                            </div>
                          </div>
                        </div>

                        {ws.pendingApprovals?.length > 0 ? (
                          <span
                            style={{
                              background: 'rgba(245, 158, 11, 0.2)',
                              color: '#fbbf24',
                              fontSize: '10px',
                              fontWeight: 700,
                              padding: '2px 6px',
                              borderRadius: '4px',
                              marginLeft: '6px',
                            }}
                          >
                            {ws.pendingApprovals.length} pending
                          </span>
                        ) : isSelected ? (
                          <Check size={14} color="#007acc" style={{ flexShrink: 0, marginLeft: '6px' }} />
                        ) : null}
                      </div>
                    );
                  })
                ) : (
                  <div style={{ padding: '8px', fontSize: '11.5px', color: '#71717a', fontStyle: 'italic' }}>
                    Single workspace active
                  </div>
                )}

                {recentProjects && recentProjects.filter(p => !p.isOpen).length > 0 && (
                  <>
                    <div
                      style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        color: '#71717a',
                        padding: '8px 8px 3px 8px',
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                        marginTop: '4px',
                      }}
                    >
                      Recent Projects ({recentProjects.filter(p => !p.isOpen).length})
                    </div>
                    <div style={{ maxHeight: '160px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      {recentProjects
                        .filter(p => !p.isOpen)
                        .map(p => (
                          <div
                            key={p.path}
                            onClick={() => {
                              onLaunchRecentProject?.(p.path);
                              setShowWorkspaceDropdown(false);
                              triggerHaptic(25);
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '6px 8px',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              color: '#d4d4d8',
                              fontSize: '12px',
                              background: 'transparent',
                              transition: 'background 120ms ease',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flex: 1 }}>
                              <Folder size={12} color="#71717a" style={{ flexShrink: 0 }} />
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
                                  {p.name}
                                </div>
                                <div style={{ fontSize: '9.5px', color: '#71717a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {p.path}
                                </div>
                              </div>
                            </div>
                            <span
                              style={{
                                fontSize: '10px',
                                color: '#0078d4',
                                background: 'rgba(0, 120, 212, 0.12)',
                                border: '1px solid rgba(0, 120, 212, 0.25)',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontWeight: 600,
                                flexShrink: 0,
                                marginLeft: '6px',
                              }}
                            >
                              Launch
                            </span>
                          </div>
                        ))}
                    </div>
                  </>
                )}

              </div>
            </>
          )}
        </div>

        {/* If IDE is Dormant: Compact warning chip */}
        {ideStatus === 'dormant' && (
          <div
            title="Antigravity IDE window is closed or reloading. Tap to launch and reconnect."
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 7px',
              borderRadius: '6px',
              background: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid rgba(245, 158, 11, 0.28)',
              fontSize: '10.5px',
              fontWeight: 600,
              color: '#fbbf24',
              flexShrink: 0,
              userSelect: 'none',
              marginLeft: '6px',
              cursor: onRestartIde ? 'pointer' : 'default',
            }}
            onClick={() => {
              if (onRestartIde) {
                triggerHaptic(30);
                onRestartIde();
              }
            }}
          >
            <span
              style={{
                width: '5px',
                height: '5px',
                borderRadius: '50%',
                background: '#f59e0b',
                boxShadow: '0 0 5px rgba(245, 158, 11, 0.6)',
              }}
            />
            <span style={{ letterSpacing: '0.01em' }}>Dormant · Launch</span>
          </div>
        )}

        {/* Right Header Icons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginLeft: 'auto', flexShrink: 0 }}>
          {/* In-App Update Progress / Update Available Pill */}
          {apkUpdateProgress?.inProgress ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '3px 7px',
                borderRadius: '6px',
                background: 'rgba(0, 122, 204, 0.15)',
                border: '1px solid rgba(0, 122, 204, 0.35)',
                fontSize: '10.5px',
                fontWeight: 600,
                color: '#38bdf8',
                marginRight: '3px',
              }}
            >
              <RefreshCw size={10} className="animate-spin" />
              <span>{apkUpdateProgress.percent}%</span>
            </div>
          ) : apkUpdateAvailable ? (
            <button
              onClick={() => {
                onInstallApk();
                triggerHaptic(30);
              }}
              title="A new APK build is ready. Tap to install directly."
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '3px 7px',
                borderRadius: '6px',
                background: 'rgba(56, 189, 248, 0.12)',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                fontSize: '10.5px',
                fontWeight: 600,
                color: '#38bdf8',
                marginRight: '3px',
                cursor: 'pointer',
              }}
            >
              <Download size={11} />
              <span>Update</span>
            </button>
          ) : null}

          {/* [...] More Options */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => {
                const next = !showOptionsDropdown;
                setShowOptionsDropdown(next);
                if (next) {
                  setShowWorkspaceDropdown(false);
                }
                triggerHaptic(20);
              }}
              title="More Options"
              style={{
                background: showOptionsDropdown ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                border: 'none',
                color: '#cccccc',
                width: '36px',
                height: '36px',
                borderRadius: '7px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'background 120ms ease',
              }}
            >
              <MoreHorizontal size={16} />
            </button>

            {/* Dropdown Menu */}
            {showOptionsDropdown && (
              <>
                <div
                  onClick={() => setShowOptionsDropdown(false)}
                  style={{ position: 'fixed', inset: 0, zIndex: 90 }}
                />
                <div
                  style={{
                    position: 'absolute',
                    top: '40px',
                    right: 0,
                    background: '#1e1e1e',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                    width: '210px',
                    zIndex: 95,
                    overflow: 'hidden',
                    padding: '4px',
                  }}
                >
                {/* New Conversation */}
                <button
                  onClick={() => {
                    onNewChat();
                    setShowOptionsDropdown(false);
                    triggerHaptic(20);
                  }}
                  style={{
                    width: '100%',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '8px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '12.5px',
                    color: '#ededed',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <Plus size={14} color="#10b981" />
                  <span>New Conversation</span>
                </button>

                {/* Session History */}
                <button
                  onClick={() => {
                    onOpenHistory();
                    setShowOptionsDropdown(false);
                    triggerHaptic(20);
                  }}
                  style={{
                    width: '100%',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '8px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '12.5px',
                    color: '#ededed',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <History size={14} color="#858585" />
                  <span>Session History</span>
                </button>

                <div style={{ height: '1px', background: 'rgba(255, 255, 255, 0.08)', margin: '3px 0' }} />

                {/* File Explorer Toggle */}
                <button
                  onClick={() => {
                    onToggleExplorer();
                    setShowOptionsDropdown(false);
                    triggerHaptic(20);
                  }}
                  style={{
                    width: '100%',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '8px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '12.5px',
                    color: '#ededed',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <Folder size={14} color="#007acc" />
                  <span>File Explorer</span>
                </button>

                {/* Mode Toggle Button */}
                <button
                  onClick={() => {
                    triggerHaptic(20);
                    const isAuto =
                      companionMode === 'auto' ||
                      companionMode === 'autonomous' ||
                      executionPolicy === 'always_proceed';

                    if (companionMode === 'remote' && !isAuto) {
                      // Remote -> Auto (Proceed)
                      if (onTogglePolicy) onTogglePolicy('always_proceed');
                      onToggleMode('auto');
                    } else if (isAuto) {
                      // Auto -> Desk
                      if (onTogglePolicy) onTogglePolicy('force_ask');
                      onToggleMode('desk');
                    } else {
                      // Desk -> Remote
                      if (onTogglePolicy) onTogglePolicy('force_ask');
                      onToggleMode('remote');
                    }
                    setShowOptionsDropdown(false);
                  }}
                  style={{
                    width: '100%',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '8px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '12.5px',
                    color: '#ededed',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  {companionMode === 'auto' ||
                  companionMode === 'autonomous' ||
                  executionPolicy === 'always_proceed' ? (
                    <Zap size={14} color="#eab308" />
                  ) : companionMode === 'desk' ? (
                    <Laptop size={14} color="#4ade80" />
                  ) : (
                    <Smartphone size={14} color="#007acc" />
                  )}
                  <span
                    style={{
                      color:
                        companionMode === 'auto' ||
                        companionMode === 'autonomous' ||
                        executionPolicy === 'always_proceed'
                          ? '#eab308'
                          : '#ededed',
                      fontWeight:
                        companionMode === 'auto' ||
                        companionMode === 'autonomous' ||
                        executionPolicy === 'always_proceed'
                          ? 600
                          : 400,
                    }}
                  >
                    Mode:{' '}
                    {companionMode === 'auto' ||
                    companionMode === 'autonomous' ||
                    executionPolicy === 'always_proceed'
                      ? 'Auto (Proceed)'
                      : companionMode === 'desk'
                      ? 'Desk (PC)'
                      : 'Remote (Phone)'}
                  </span>
                </button>

                {/* Settings */}
                <button
                  onClick={() => {
                    onOpenSettings();
                    setShowOptionsDropdown(false);
                    triggerHaptic(20);
                  }}
                  style={{
                    width: '100%',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '8px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '12.5px',
                    color: '#cccccc',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <Settings size={14} />
                  <span>Connection Settings</span>
                </button>

                {/* In-App Update or Download Android APK */}
                <button
                  onClick={() => {
                    onInstallApk();
                    setShowOptionsDropdown(false);
                    triggerHaptic(25);
                  }}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '8px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '12.5px',
                    color: '#cccccc',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <Download size={14} />
                  <span>
                    {isNativeApp
                      ? (apkUpdateProgress?.inProgress ? `Installing (${apkUpdateProgress.percent}%)` : 'In-App Update APK')
                      : 'Download Android APK'}
                  </span>
                </button>
              </div>
            </>
          )}
          </div>
        </div>
      </header>

      {/* Disconnected Quick-Connect Bar */}
      {!connected && (
        <div
          style={{
            background: '#121824',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            padding: '8px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: '#f87171',
                boxShadow: '0 0 6px rgba(248, 113, 113, 0.4)',
              }}
            />
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>
              Connecting to <strong style={{ color: '#e2e8f0' }}>{host}</strong>...
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              onClick={() => {
                onSelectHost('100.107.129.104', '4040');
                triggerHaptic(20);
              }}
              style={{
                background: host === '100.107.129.104' ? '#007acc' : '#262626',
                border: `1px solid ${host === '100.107.129.104' ? 'rgba(0, 122, 204, 0.6)' : 'rgba(255,255,255,0.08)'}`,
                borderRadius: '4px',
                color: '#ffffff',
                fontSize: '10.5px',
                fontWeight: 500,
                padding: '4px 8px',
                cursor: 'pointer',
              }}
            >
              Tailscale (100.107.129.104)
            </button>
            <button
              onClick={() => {
                onSelectHost('subsidiaries-dish-hang-suits.trycloudflare.com', '443');
                triggerHaptic(20);
              }}
              style={{
                background: host.includes('trycloudflare') ? '#007acc' : '#262626',
                border: `1px solid ${host.includes('trycloudflare') ? 'rgba(0, 122, 204, 0.6)' : 'rgba(255,255,255,0.08)'}`,
                borderRadius: '4px',
                color: '#ffffff',
                fontSize: '10.5px',
                fontWeight: 500,
                padding: '4px 8px',
                cursor: 'pointer',
              }}
            >
              Cloudflare
            </button>
            <button
              onClick={() => {
                onSelectHost('192.168.1.37', '4040');
                triggerHaptic(20);
              }}
              style={{
                background: host === '192.168.1.37' ? '#007acc' : '#262626',
                border: `1px solid ${host === '192.168.1.37' ? 'rgba(0, 122, 204, 0.6)' : 'rgba(255,255,255,0.08)'}`,
                borderRadius: '4px',
                color: '#ffffff',
                fontSize: '10.5px',
                fontWeight: 500,
                padding: '4px 8px',
                cursor: 'pointer',
              }}
            >
              Wi-Fi
            </button>
          </div>
        </div>
      )}
    </>
  );
};
