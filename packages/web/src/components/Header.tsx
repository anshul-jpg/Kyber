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
} from 'lucide-react';
import { CompanionMode, ExecutionPolicy, WorkspaceState } from '@agy-companion/protocol';
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
        <div style={{ position: 'relative', maxWidth: '55%' }}>
          <div
            onClick={() => {
              setShowWorkspaceDropdown(prev => !prev);
              triggerHaptic(20);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              background: showWorkspaceDropdown ? '#252528' : 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              padding: '4px 10px',
              borderRadius: '8px',
              transition: 'background 120ms ease',
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
                    ? '#007acc'
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
                <div
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    color: '#71717a',
                    padding: '6px 8px 4px 8px',
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

                <div style={{ height: '1px', background: 'rgba(255, 255, 255, 0.08)', margin: '4px 0' }} />

                <div
                  onClick={() => {
                    setShowWorkspaceDropdown(false);
                    onToggleExplorer();
                    triggerHaptic(20);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '7px 10px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    color: '#cbd5e1',
                    fontSize: '12px',
                  }}
                >
                  <Folder size={14} color="#007acc" />
                  <span>Browse Workspace Files</span>
                </div>

                <div
                  onClick={() => {
                    setShowWorkspaceDropdown(false);
                    onNewChat();
                    triggerHaptic(20);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '7px 10px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    color: '#cbd5e1',
                    fontSize: '12px',
                  }}
                >
                  <Plus size={14} color="#10b981" />
                  <span>New Conversation</span>
                </div>

                <div
                  onClick={() => {
                    setShowWorkspaceDropdown(false);
                    onOpenHistory();
                    triggerHaptic(20);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '7px 10px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    color: '#cbd5e1',
                    fontSize: '12px',
                  }}
                >
                  <History size={14} color="#858585" />
                  <span>Conversation History</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* In-App Update Progress / Update Available Pill */}
        {apkUpdateProgress?.inProgress ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '3px 8px',
              borderRadius: '12px',
              background: 'rgba(0, 122, 204, 0.15)',
              border: '1px solid rgba(0, 122, 204, 0.35)',
              fontSize: '11px',
              fontWeight: 500,
              color: '#38bdf8',
              marginRight: '6px',
              flexShrink: 0,
            }}
          >
            <RefreshCw size={11} className="animate-spin" />
            <span>Updating {apkUpdateProgress.percent}%</span>
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
              gap: '5px',
              padding: '3px 8px',
              borderRadius: '12px',
              background: 'rgba(56, 189, 248, 0.12)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              fontSize: '11px',
              fontWeight: 500,
              color: '#38bdf8',
              marginRight: '6px',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <Download size={11} />
            <span>Update APK</span>
          </button>
        ) : null}

        {/* Center/Right: IDE Status Indicator Badge */}
        <div
          title={ideStatus === 'dormant' ? 'Antigravity IDE window is closed or reloading. Messages will buffer safely in daemon memory.' : 'Antigravity IDE is connected and active. Turns execute immediately.'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            padding: '3px 8px',
            borderRadius: '12px',
            background: ideStatus === 'dormant' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(255, 255, 255, 0.04)',
            border: `1px solid ${ideStatus === 'dormant' ? 'rgba(245, 158, 11, 0.25)' : 'rgba(255, 255, 255, 0.08)'}`,
            fontSize: '11px',
            fontWeight: 500,
            color: ideStatus === 'dormant' ? '#fbbf24' : '#9ca3af',
            marginLeft: 'auto',
            marginRight: '6px',
            flexShrink: 0,
            userSelect: 'none',
          }}
        >
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: ideStatus === 'dormant' ? '#f59e0b' : '#4ade80',
              boxShadow: ideStatus === 'dormant' ? '0 0 5px rgba(245, 158, 11, 0.5)' : '0 0 5px rgba(74, 222, 128, 0.5)',
            }}
          />
          <span style={{ letterSpacing: '-0.01em' }}>
            {ideStatus === 'dormant' ? 'IDE Dormant' : 'IDE Active'}
          </span>
        </div>

        {/* Right Header Icons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {/* [+] New Chat */}
          <button
            onClick={() => {
              onNewChat();
              triggerHaptic(25);
            }}
            title="New Conversation"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#cccccc',
              width: '34px',
              height: '34px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <Plus size={16} />
          </button>

          {/* [🕒] History Drawer */}
          <button
            onClick={() => {
              onOpenHistory();
              triggerHaptic(25);
            }}
            title="Session History"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#cccccc',
              width: '34px',
              height: '34px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <History size={16} />
          </button>

          {/* [...] More Options */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => {
                setShowOptionsDropdown(!showOptionsDropdown);
                triggerHaptic(20);
              }}
              title="More Options"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#cccccc',
                width: '34px',
                height: '34px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <MoreHorizontal size={16} />
            </button>

            {/* Dropdown Menu */}
            {showOptionsDropdown && (
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
                  zIndex: 100,
                  overflow: 'hidden',
                  padding: '4px',
                }}
              >
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
                    const isAutonomous =
                      companionMode === 'autonomous' ||
                      (companionMode === 'remote' && executionPolicy === 'always_proceed');

                    if (companionMode === 'remote' || companionMode === 'autonomous') {
                      if (!isAutonomous) {
                        // Remote Supervised -> Remote Autonomous
                        if (onTogglePolicy) onTogglePolicy('always_proceed');
                        onToggleMode('remote');
                      } else {
                        // Remote Autonomous -> Desk
                        onToggleMode('desk');
                      }
                    } else {
                      // Desk -> Remote Supervised
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
                  {companionMode === 'autonomous' ||
                  (companionMode === 'remote' && executionPolicy === 'always_proceed') ? (
                    <Zap size={14} color="#eab308" />
                  ) : companionMode === 'remote' ? (
                    <Smartphone size={14} color="#007acc" />
                  ) : companionMode === 'desk' ? (
                    <Laptop size={14} color="#4ade80" />
                  ) : (
                    <Radio size={14} color="#38bdf8" />
                  )}
                  <span
                    style={{
                      color:
                        companionMode === 'autonomous' ||
                        (companionMode === 'remote' && executionPolicy === 'always_proceed')
                          ? '#eab308'
                          : '#ededed',
                      fontWeight:
                        companionMode === 'autonomous' ||
                        (companionMode === 'remote' && executionPolicy === 'always_proceed')
                          ? 600
                          : 400,
                    }}
                  >
                    Mode:{' '}
                    {companionMode === 'autonomous' ||
                    (companionMode === 'remote' && executionPolicy === 'always_proceed')
                      ? 'Remote · Auto'
                      : companionMode === 'remote'
                      ? 'Remote · Ask'
                      : companionMode === 'desk'
                      ? 'Desk (PC)'
                      : 'Auto'}
                  </span>
                </button>

                {/* Emergency Stop / Kill Switch */}
                <button
                  onClick={() => {
                    onEmergencyStop();
                    setShowOptionsDropdown(false);
                  }}
                  style={{
                    width: '100%',
                    background: 'rgba(241, 76, 76, 0.1)',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '8px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '12.5px',
                    color: '#f87171',
                    cursor: 'pointer',
                    textAlign: 'left',
                    marginTop: '2px',
                  }}
                >
                  <OctagonAlert size={14} />
                  <span>Emergency Stop</span>
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
            )}
          </div>

          {/* [✕] Close / Minimize App */}
          <button
            onClick={() => {
              if ((window as any).AndroidHost?.minimizeApp) {
                (window as any).AndroidHost.minimizeApp();
              } else {
                onNewChat();
              }
              setShowOptionsDropdown(false);
              triggerHaptic(20);
            }}
            title={isNativeApp ? "Minimize to Background" : "Reset Session"}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#cccccc',
              width: '34px',
              height: '34px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <X size={16} />
          </button>
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
