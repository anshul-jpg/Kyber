import React from 'react';
import { Folder, GitBranch, Layers, MessageSquare, ArrowRight } from 'lucide-react';
import { WorkspaceState } from '@agy-companion/protocol';
import { KyberLogo, triggerHaptic } from './CommonUI';

interface HomeScreenProps {
  workspaces: WorkspaceState[];
  activeWorkspaceId: string;
  onSelectWorkspace: (id: string) => void;
  onOpenExplorer: () => void;
  activeConversation?: {
    id?: string;
    title?: string;
    messageCount?: number;
  } | null;
  onResumeActiveChat?: () => void;
}

export const HomeScreen = React.memo<HomeScreenProps>(({
  workspaces,
  activeWorkspaceId,
  onSelectWorkspace,
  onOpenExplorer,
  activeConversation,
  onResumeActiveChat,
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
          fontSize: '18px',
          fontWeight: 700,
          color: '#ffffff',
          letterSpacing: '0.04em',
          marginBottom: '20px',
        }}
      >
        KYBER
      </h1>

      {/* Prominent Resume Active Session Card (Prevents Navigation Trap) */}
      {activeConversation && onResumeActiveChat && (
        <div
          onClick={() => {
            onResumeActiveChat();
            triggerHaptic(20);
          }}
          style={{
            width: '100%',
            background: 'linear-gradient(180deg, rgba(0, 122, 204, 0.16) 0%, rgba(0, 122, 204, 0.06) 100%)',
            border: '1px solid rgba(0, 122, 204, 0.4)',
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
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#38bdf8', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                Active Session
              </span>
            </div>
            <span style={{ fontSize: '11px', color: '#38bdf8', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '3px' }}>
              <span>Resume Chat</span>
              <ArrowRight size={12} />
            </span>
          </div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
          background: '#007acc',
          border: 'none',
          borderRadius: '6px',
          height: '42px',
          color: '#ffffff',
          fontSize: '13.5px',
          fontWeight: 600,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          marginBottom: '10px',
        }}
      >
        <Folder size={16} />
        <span>Open Workspace Explorer</span>
      </button>

      {/* Secondary Action Button: Clone Repository */}
      <button
        onClick={() => triggerHaptic(20)}
        style={{
          width: '100%',
          background: '#252525',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '6px',
          height: '42px',
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
                ? '#007acc'
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
                  border: `1px solid ${isSelected ? '#007acc' : 'rgba(255, 255, 255, 0.08)'}`,
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
                    <span style={{ fontSize: '11px', color: '#007acc', fontWeight: 600 }}>
                      Active
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

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
            <Layers size={20} color="#007acc" />
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
