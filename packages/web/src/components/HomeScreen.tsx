import React from 'react';
import { Folder, GitBranch, Layers } from 'lucide-react';
import { WorkspaceState } from '@agy-companion/protocol';
import { KyberLogo, triggerHaptic } from './CommonUI';

interface HomeScreenProps {
  workspaces: WorkspaceState[];
  activeWorkspaceId: string;
  onSelectWorkspace: (id: string) => void;
  onOpenExplorer: () => void;
}

export const HomeScreen = React.memo<HomeScreenProps>(({
  workspaces,
  activeWorkspaceId,
  onSelectWorkspace,
  onOpenExplorer,
}) => {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        padding: '30px 10px',
        maxWidth: '520px',
        margin: '0 auto',
        width: '100%',
      }}
    >
      {/* KYBER Minimal Vector Mark */}
      <div style={{ marginBottom: '14px' }}>
        <KyberLogo size={52} />
      </div>

      <h1
        style={{
          fontSize: '19px',
          fontWeight: 700,
          color: '#ffffff',
          letterSpacing: '0.04em',
          marginBottom: '24px',
        }}
      >
        KYBER
      </h1>

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
        <span>Open Folder</span>
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
          marginBottom: '32px',
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
          }}
        >
          Workspaces
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {workspaces.map(ws => (
            <button
              key={ws.id}
              onClick={() => {
                onSelectWorkspace(ws.id);
                triggerHaptic(20);
              }}
              style={{
                background: ws.id === activeWorkspaceId ? '#252525' : '#1e1e1e',
                border: `1px solid ${ws.id === activeWorkspaceId ? '#007acc' : 'rgba(255, 255, 255, 0.08)'}`,
                borderRadius: '6px',
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#ffffff' }}>
                {ws.name}
              </span>
              <span style={{ fontSize: '11px', color: '#71717a', fontFamily: 'monospace' }}>
                {ws.path}
              </span>
            </button>
          ))}
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
                Antigravity Extension Service
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
