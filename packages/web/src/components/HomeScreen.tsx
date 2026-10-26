import React from 'react';
import { Folder, GitBranch, Layers, MessageSquare, ArrowRight, Play } from 'lucide-react';
import { WorkspaceState, RecentProject } from '@agy-companion/protocol';
import { KyberLogo, triggerHaptic } from './CommonUI';

interface HomeScreenProps {
  workspaces: WorkspaceState[];
  activeWorkspaceId: string;
  onSelectWorkspace: (id: string) => void;
  onOpenExplorer: () => void;
  recentProjects?: RecentProject[];
  onLaunchRecentProject?: (path: string) => void;
  activeConversation?: {
    id?: string;
    title?: string;
    messageCount?: number;
  } | null;
  onResumeActiveChat?: () => void;
  ideStatus?: 'active' | 'dormant';
  onLaunchIde?: () => void;
}

export const HomeScreen = React.memo<HomeScreenProps>(({
  workspaces,
  activeWorkspaceId,
  onSelectWorkspace,
  onOpenExplorer,
  recentProjects = [],
  onLaunchRecentProject,
  activeConversation,
  onResumeActiveChat,
  ideStatus = 'active',
  onLaunchIde,
}) => {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        padding: '24px 10px',
        maxWidth: '520px',
        margin: '0 auto',
        width: '100%',
      }}
    >
      {/* KYBER Minimal Vector Mark */}
      <div style={{ marginBottom: '12px' }}>
        <KyberLogo size={48} />
      </div>

      <h1
        style={{
          fontSize: '20px',
          fontWeight: 600,
          color: '#ffffff',
          letterSpacing: '-0.02em',
          marginBottom: '20px',
          fontFamily: "'Geist Mono', Consolas, monospace",
        }}
      >
        kyber.
      </h1>

      {/* Prominent Launch Antigravity IDE Card if PC is Online but IDE is Dormant */}
      {ideStatus === 'dormant' && onLaunchIde && (
        <div
          style={{
            width: '100%',
            background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, rgba(34, 197, 94, 0.08) 100%)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: '8px',
            padding: '12px 14px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#fbbf24', boxShadow: '0 0 6px rgba(251, 191, 36, 0.6)' }} />
            <div>
              <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#ffffff' }}>PC Online • Antigravity IDE Dormant</div>
              <div style={{ fontSize: '10.5px', color: '#a1a1aa' }}>Desktop IDE is closed. Tap to launch it on PC.</div>
            </div>
          </div>
          <button
            onClick={() => {
              triggerHaptic(35);
              onLaunchIde();
            }}
            style={{
              background: '#22c55e',
              color: '#000000',
              border: 'none',
              borderRadius: '6px',
              padding: '7px 12px',
              fontSize: '11.5px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              flexShrink: 0,
            }}
          >
            <Play size={12} fill="#000000" />
            <span>Launch IDE</span>
          </button>
        </div>
      )}

      {/* Prominent Resume Active Session Card (Prevents Navigation Trap) */}
      {activeConversation && onResumeActiveChat && (
        <div
          onClick={() => {
            onResumeActiveChat();
            triggerHaptic(20);
          }}
          style={{
            width: '100%',
            background: '#0d0d0e',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderLeft: '3px solid #ffffff',
            borderRadius: '8px',
            padding: '12px 14px',
            marginBottom: '16px',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            boxSizing: 'border-box',
            transition: 'border-color 0.15s ease, background 0.15s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#ffffff', display: 'inline-block' }} />
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#ffffff', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                Active Session
              </span>
            </div>
            <span style={{ fontSize: '11px', color: '#ffffff', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '3px' }}>
              <span>Resume Chat</span>
              <ArrowRight size={12} />
            </span>
          </div>
          <div style={{ fontSize: '13.5px', fontWeight: 600, color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {activeConversation.title || 'Ongoing Conversation'}
          </div>
          <div style={{ fontSize: '11px', color: '#a1a1aa' }}>
            {activeConversation.messageCount ? `${activeConversation.messageCount} messages • ` : ''}Tap to return to conversation
          </div>
        </div>
      )}

      {/* Primary Action Button: Open Folder */}
      <button
        onClick={() => {
          onOpenExplorer();
          triggerHaptic(20);
        }}
        style={{
          width: '100%',
          background: '#ffffff',
          border: 'none',
          borderRadius: '8px',
          height: '44px',
          color: '#000000',
          fontSize: '13.5px',
          fontWeight: 700,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          marginBottom: '10px',
          boxShadow: '0 1px 4px rgba(0, 0, 0, 0.5)',
        }}
      >
        <Folder size={16} color="#000000" />
        <span>Open Workspace Explorer</span>
      </button>

      {/* Secondary Action Button: Clone Repository */}
      <button
        onClick={() => triggerHaptic(20)}
        style={{
          width: '100%',
          background: '#222224',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '8px',
          height: '44px',
          color: '#ffffff',
          fontSize: '13.5px',
          fontWeight: 500,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          marginBottom: '26px',
        }}
      >
        <GitBranch size={16} />
        <span>Clone Repository</span>
      </button>

      {/* Workspaces Section */}
      <div style={{ width: '100%', marginBottom: '28px' }}>
        <div
          style={{
            fontSize: '12px',
            fontWeight: 600,
            color: '#858585',
            marginBottom: '10px',
            textTransform: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>Running Workspaces ({workspaces.length})</span>
          <span style={{ fontSize: '10.5px', color: '#71717a' }}>Click to switch context</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {workspaces.map(ws => {
            const isSelected = ws.id === activeWorkspaceId;
            const statusColor =
              ws.status === 'waiting_approval'
                ? '#f59e0b'
                : ws.status === 'busy'
                ? '#ffffff'
                : '#10b981';

            return (
              <button
                key={ws.id}
                onClick={() => {
                  onSelectWorkspace(ws.id);
                  triggerHaptic(20);
                }}
                style={{
                  background: isSelected ? '#252528' : '#1e1e1e',
                  border: `1px solid ${isSelected ? '#ffffff' : 'rgba(255, 255, 255, 0.08)'}`,
                  borderRadius: '8px',
                  padding: '12px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s ease, background 0.15s ease',
                  boxSizing: 'border-box',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: statusColor,
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ws.name}
                    </div>
                    <div style={{ fontSize: '11px', color: '#71717a', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ws.path}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                  {ws.pendingApprovals?.length > 0 && (
                    <span
                      style={{
                        background: 'rgba(245, 158, 11, 0.2)',
                        color: '#fbbf24',
                        fontSize: '10px',
                        fontWeight: 700,
                        padding: '2px 6px',
                        borderRadius: '4px',
                      }}
                    >
                      {ws.pendingApprovals.length} pending
                    </span>
                  )}
                  {isSelected && (
                    <span style={{ fontSize: '11px', color: '#ffffff', fontWeight: 600 }}>
                      Active
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Recent Projects Section */}
      {recentProjects && recentProjects.filter(p => !p.isOpen).length > 0 && (
        <div style={{ width: '100%', marginBottom: '28px' }}>
          <div
            style={{
              fontSize: '12px',
              fontWeight: 600,
              color: '#858585',
              marginBottom: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>Recent Projects ({recentProjects.filter(p => !p.isOpen).length})</span>
            <span style={{ fontSize: '10.5px', color: '#71717a' }}>1-tap launch & hook</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {recentProjects
              .filter(p => !p.isOpen)
              .map(project => (
                <div
                  key={project.path}
                  onClick={() => {
                    onLaunchRecentProject?.(project.path);
                    triggerHaptic(25);
                  }}
                  style={{
                    background: '#1e1e1e',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '8px',
                    padding: '12px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    transition: 'border-color 0.15s ease, background 0.15s ease',
                    boxSizing: 'border-box',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
                    <Folder size={16} color="#71717a" style={{ flexShrink: 0 }} />
                    <div style={{ overflow: 'hidden' }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {project.name}
                      </div>
                      <div style={{ fontSize: '11px', color: '#71717a', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {project.path}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    {project.hasHook && (
                      <span
                        style={{
                          fontSize: '9.5px',
                          color: '#10b981',
                          background: 'rgba(16, 185, 129, 0.12)',
                          padding: '2px 5px',
                          borderRadius: '3px',
                          fontWeight: 600,
                        }}
                      >
                        Hooked
                      </span>
                    )}
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        color: '#ffffff',
                        background: 'rgba(255, 255, 255, 0.08)',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        padding: '4px 10px',
                        borderRadius: '4px',
                      }}
                    >
                      Launch
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Core Extensions Section */}
      <div style={{ width: '100%' }}>
        <div
          style={{
            fontSize: '12px',
            fontWeight: 600,
            color: '#858585',
            marginBottom: '10px',
          }}
        >
          Core Extensions
        </div>

        <div
          style={{
            background: '#1e1e1e',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '6px',
            padding: '12px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Layers size={20} color="#ffffff" />
            <div>
              <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#ffffff' }}>
                KYBER Extension Service
              </div>
              <div style={{ fontSize: '11px', color: '#858585' }}>
                Autonomous coding companion and remote approval daemon.
              </div>
            </div>
          </div>

          <button
            style={{
              background: '#252525',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '4px',
              color: '#ffffff',
              fontSize: '11.5px',
              padding: '6px 12px',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            Enabled
          </button>
        </div>
      </div>
    </div>
  );
});
