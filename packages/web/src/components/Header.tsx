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
  MessageSquare,
  GitBranch,
  Monitor,
} from 'lucide-react';
import { CompanionMode, ExecutionPolicy, WorkspaceState, HostTelemetry } from '@agy-companion/protocol';
import { triggerHaptic, KyberLogo } from './CommonUI';

interface HeaderProps {
  activeSegment?: 'chat' | 'workspace';
  onSelectSegment?: (segment: 'chat' | 'workspace') => void;
  openTabsCount?: number;
  modifiedCount?: number;
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
  tailscaleIp?: string | null;
}

export const Header: React.FC<HeaderProps> = ({
  activeSegment = 'chat',
  onSelectSegment,
  openTabsCount = 0,
  modifiedCount = 0,
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
  tailscaleIp,
}) => {
  const [showWorkspaceDropdown, setShowWorkspaceDropdown] = useState(false);
  const cleanWorkspaces = (workspaces || []).filter(
    w => w.name !== 'bin' && !w.path.toLowerCase().replace(/\\/g, '/').endsWith('/dist/bin') && !w.path.toLowerCase().replace(/\\/g, '/').includes('/packages/cli')
  );
  const activeWs = cleanWorkspaces.find(w => w.id === activeWorkspaceId) || cleanWorkspaces[0];

  return (
    <>
      <header
        style={{
          background: '#000000',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          flexDirection: 'column',
          paddingTop: 'max(env(safe-area-inset-top, 0px), 8px)',
          paddingBottom: '8px',
          paddingLeft: 'max(14px, env(safe-area-inset-left, 0px))',
          paddingRight: 'max(14px, env(safe-area-inset-right, 0px))',
          boxSizing: 'border-box',
          zIndex: 40,
          flexShrink: 0,
          gap: '8px',
        }}
      >
        {/* Tier 1: Brand & Global Status */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
          }}
        >
          {/* Brand Mark */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <KyberLogo size={18} />
            <span
              style={{
                fontSize: '15px',
                fontWeight: 600,
                letterSpacing: '-0.02em',
                color: '#ffffff',
                fontFamily: "'Geist Mono', Consolas, monospace",
              }}
            >
              kyber.
            </span>
          </div>

          {/* Right Controls: Mode Toggle + Options [...] */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Mode Toggle Pill */}
            <button
              onClick={() => {
                triggerHaptic(20);
                const isRemote = companionMode === 'remote' || companionMode === 'autonomous';
                onToggleMode(isRemote ? 'desk' : 'remote');
              }}
              title="Toggle Desk/Remote Approval Mode"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                borderRadius: '20px',
                border: (companionMode === 'remote' || companionMode === 'autonomous')
                  ? '1px solid rgba(255, 255, 255, 0.3)'
                  : '1px solid rgba(255, 255, 255, 0.08)',
                background: (companionMode === 'remote' || companionMode === 'autonomous')
                  ? '#161618'
                  : '#0d0d0e',
                color: (companionMode === 'remote' || companionMode === 'autonomous')
                  ? '#ffffff'
                  : '#71717a',
                fontSize: '11px',
                fontWeight: 500,
                fontFamily: "'Geist Mono', monospace",
                cursor: 'pointer',
                transition: 'background 120ms ease, border-color 120ms ease, color 120ms ease',
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: (companionMode === 'remote' || companionMode === 'autonomous') ? '#ffffff' : '#52525b',
                  boxShadow: (companionMode === 'remote' || companionMode === 'autonomous') ? '0 0 6px rgba(255, 255, 255, 0.7)' : 'none',
                }}
              />
              <span>{(companionMode === 'remote' || companionMode === 'autonomous') ? 'remote' : 'desk'}</span>
            </button>

            {/* Options Dropdown */}
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
                position: 'relative',
              }}
            >
              <MoreHorizontal size={16} />
              {(apkUpdateAvailable || apkUpdateProgress?.inProgress) && (
                <span
                  style={{
                    position: 'absolute',
                    top: '7px',
                    right: '7px',
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: '#ffffff',
                    boxShadow: '0 0 6px rgba(255, 255, 255, 0.8)',
                  }}
                />
              )}
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
                    background: '#181818',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '12px',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
                    width: '210px',
                    zIndex: 95,
                    overflow: 'hidden',
                    padding: '5px',
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
                  <Folder size={14} color="#a1a1aa" />
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
                    <Smartphone size={14} color="#ffffff" />
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

                {/* In-App Update or Download Android APK with Live Progress Bar */}
                {apkUpdateProgress?.inProgress ? (
                  <div
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: '6px',
                      padding: '8px 10px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px' }}>
                      <span style={{ color: '#ffffff', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <RefreshCw size={12} className="animate-spin" />
                        Downloading Update...
                      </span>
                      <span style={{ color: '#ffffff', fontFamily: 'monospace', fontWeight: 700 }}>
                        {apkUpdateProgress.percent}%
                      </span>
                    </div>
                    {/* Progress Track */}
                    <div
                      style={{
                        width: '100%',
                        height: '4px',
                        background: 'rgba(255, 255, 255, 0.1)',
                        borderRadius: '2px',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${Math.min(100, Math.max(5, apkUpdateProgress.percent))}%`,
                          background: '#ffffff',
                          borderRadius: '2px',
                          transition: 'width 200ms ease',
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      onInstallApk();
                      triggerHaptic(25);
                    }}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      background: apkUpdateAvailable ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                      border: apkUpdateAvailable ? '1px solid rgba(255, 255, 255, 0.2)' : 'none',
                      borderRadius: '6px',
                      padding: '8px 10px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '12.5px',
                      color: apkUpdateAvailable ? '#ffffff' : '#cccccc',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Download size={14} color={apkUpdateAvailable ? '#ffffff' : 'currentColor'} />
                      <span style={{ fontWeight: apkUpdateAvailable ? 600 : 400 }}>
                        {isNativeApp ? 'In-App Update APK' : 'Download Android APK'}
                      </span>
                    </div>
                    {apkUpdateAvailable && (
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          color: '#000000',
                          background: '#ffffff',
                          padding: '1px 6px',
                          borderRadius: '4px',
                        }}
                      >
                        NEW
                      </span>
                    )}
                  </button>
                )}
              </div>
            </>
          )}
          </div>
          </div>
        </div>

        {/* Tier 2: Workspace Dropdown + Unified 2-Pillar Switcher (Chat | Workspace) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            width: '100%',
          }}
        >
          <div style={{ position: 'relative', minWidth: 0, flex: 1 }}>
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
                background: showWorkspaceDropdown ? '#222224' : '#181818',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                padding: '5px 10px',
                borderRadius: '8px',
                transition: 'background 120ms ease',
                maxWidth: '100%',
                userSelect: 'none',
              }}
            >
              <div
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background:
                    activeWs?.status === 'waiting_approval'
                      ? '#f59e0b'
                      : activeWs?.status === 'busy'
                      ? '#ffffff'
                      : ideStatus === 'dormant'
                      ? '#f59e0b'
                      : '#10b981',
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
                    background: '#181818',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '12px',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ color: ideStatus === 'dormant' ? '#fbbf24' : '#10b981', fontWeight: 600 }}>
                      {ideStatus === 'dormant' ? 'Dormant' : 'Active & Synced'}
                    </span>
                    {ideStatus === 'dormant' && onRestartIde && (
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          triggerHaptic(30);
                          onRestartIde();
                        }}
                        style={{
                          background: '#ffffff',
                          border: 'none',
                          borderRadius: '4px',
                          color: '#000000',
                          fontSize: '10.5px',
                          fontWeight: 700,
                          padding: '2px 8px',
                          cursor: 'pointer',
                        }}
                      >
                        Launch
                      </button>
                    )}
                  </div>
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
                  Active Containers ({cleanWorkspaces.length})
                </div>

                {cleanWorkspaces && cleanWorkspaces.length > 0 ? (
                  cleanWorkspaces.map(ws => {
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
                                  ? '#ffffff'
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
                          <Check size={14} color="#ffffff" style={{ flexShrink: 0, marginLeft: '6px' }} />
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
                                color: '#ffffff',
                                background: 'rgba(255, 255, 255, 0.08)',
                                border: '1px solid rgba(255, 255, 255, 0.15)',
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
        {/* Center/Right: Unified 2-Pillar Switcher (Chat | Workspace) */}
        {onSelectSegment && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              background: '#141416',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '8px',
              padding: '2px',
              gap: '2px',
              flexShrink: 0,
              userSelect: 'none',
            }}
          >
            {/* Chat Tab */}
            <button
              onClick={() => {
                triggerHaptic(15);
                onSelectSegment('chat');
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '4px 10px',
                borderRadius: '6px',
                border: 'none',
                background: activeSegment === 'chat' ? '#242426' : 'transparent',
                color: activeSegment === 'chat' ? '#ffffff' : '#858585',
                fontSize: '11px',
                fontWeight: activeSegment === 'chat' ? 600 : 500,
                cursor: 'pointer',
                transition: 'background 120ms ease, color 120ms ease',
              }}
            >
              <MessageSquare size={12} color={activeSegment === 'chat' ? '#ffffff' : 'currentColor'} />
              <span>Chat</span>
            </button>

            {/* Workspace / Files Tab */}
            <button
              onClick={() => {
                triggerHaptic(15);
                onSelectSegment('workspace');
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '4px 10px',
                borderRadius: '6px',
                border: 'none',
                background: activeSegment === 'workspace' ? '#242426' : 'transparent',
                color: activeSegment === 'workspace' ? '#ffffff' : '#858585',
                fontSize: '11px',
                fontWeight: activeSegment === 'workspace' ? 600 : 500,
                cursor: 'pointer',
                transition: 'background 120ms ease, color 120ms ease',
              }}
            >
              <Folder size={12} color={activeSegment === 'workspace' ? '#ffffff' : 'currentColor'} />
              <span>Workspace</span>
              {(openTabsCount > 0 || modifiedCount > 0) && (
                <span
                  style={{
                    fontSize: '9.5px',
                    fontFamily: "'Geist Mono', Consolas, monospace",
                    fontWeight: 700,
                    background: activeSegment === 'workspace' ? '#ffffff' : 'rgba(255, 255, 255, 0.08)',
                    color: activeSegment === 'workspace' ? '#000000' : '#ffffff',
                    padding: '0 5px',
                    borderRadius: '8px',
                    lineHeight: '13px',
                  }}
                >
                  {modifiedCount > 0 ? `${modifiedCount}Δ` : openTabsCount}
                </span>
              )}
            </button>
          </div>
        )}
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
                onSelectHost('127.0.0.1', '4040');
                triggerHaptic(20);
              }}
              style={{
                background: host === '127.0.0.1' || host === 'localhost' ? '#ffffff' : '#262626',
                border: `1px solid ${host === '127.0.0.1' || host === 'localhost' ? '#ffffff' : 'rgba(255,255,255,0.08)'}`,
                borderRadius: '4px',
                color: host === '127.0.0.1' || host === 'localhost' ? '#000000' : '#ffffff',
                fontSize: '10.5px',
                fontWeight: 600,
                padding: '4px 8px',
                cursor: 'pointer',
              }}
            >
              Local
            </button>
            {(tailscaleIp || host.startsWith('100.')) && (
              <button
                onClick={() => {
                  onSelectHost(tailscaleIp || host, '4040');
                  triggerHaptic(20);
                }}
                style={{
                  background: (host === tailscaleIp || host.startsWith('100.')) ? '#ffffff' : '#262626',
                  border: `1px solid ${(host === tailscaleIp || host.startsWith('100.')) ? '#ffffff' : 'rgba(255,255,255,0.08)'}`,
                  borderRadius: '4px',
                  color: (host === tailscaleIp || host.startsWith('100.')) ? '#000000' : '#ffffff',
                  fontSize: '10.5px',
                  fontWeight: 600,
                  padding: '4px 8px',
                  cursor: 'pointer',
                }}
              >
                Tailscale
              </button>
            )}
            {typeof window !== 'undefined' && window.location.hostname && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1' && window.location.hostname !== tailscaleIp && (
              <button
                onClick={() => {
                  onSelectHost(window.location.hostname, window.location.port || '4040');
                  triggerHaptic(20);
                }}
                style={{
                  background: host === window.location.hostname ? '#ffffff' : '#262626',
                  border: `1px solid ${host === window.location.hostname ? '#ffffff' : 'rgba(255,255,255,0.08)'}`,
                  borderRadius: '4px',
                  color: host === window.location.hostname ? '#000000' : '#ffffff',
                  fontSize: '10.5px',
                  fontWeight: 600,
                  padding: '4px 8px',
                  cursor: 'pointer',
                }}
              >
                Host
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
};
