import React from 'react';
import { EditorTab } from '@agy-companion/protocol';
import { FileCode, Monitor, Eye, Circle, ExternalLink, Folder } from 'lucide-react';
import { FileTypeBadge, triggerHaptic } from './CommonUI';

interface WorkspaceTabsViewProps {
  tabs: EditorTab[];
  activeWorkspaceName?: string;
  onSelectTab: (tab: EditorTab) => void;
  onInspectTab: (tab: EditorTab) => void;
  onOpenExplorer: () => void;
  modifiedFiles?: { file: string; fullPath?: string }[];
}

export const WorkspaceTabsView: React.FC<WorkspaceTabsViewProps> = React.memo(({
  tabs,
  activeWorkspaceName,
  onSelectTab,
  onInspectTab,
  onOpenExplorer,
  modifiedFiles = [],
}) => {
  const modifiedSet = new Set(modifiedFiles.map(f => f.file));

  if (tabs.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '48px 20px',
          textAlign: 'center',
          gap: '14px',
        }}
      >
        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: '#1c1c1d',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#71717a',
          }}
        >
          <FileCode size={24} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '14px', fontWeight: 600, color: '#ffffff' }}>
            No Open Tabs
          </span>
          <span style={{ fontSize: '12px', color: '#71717a', maxWidth: '280px', lineHeight: '1.45' }}>
            {activeWorkspaceName ? `No open editor tabs detected in ${activeWorkspaceName}.` : 'No open editor tabs detected in the host IDE.'}
          </span>
        </div>
        <button
          onClick={() => {
            triggerHaptic(15);
            onOpenExplorer();
          }}
          style={{
            marginTop: '8px',
            background: '#0078d4',
            border: 'none',
            borderRadius: '6px',
            padding: '8px 16px',
            color: '#ffffff',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: '0 2px 8px rgba(0, 120, 212, 0.3)',
          }}
        >
          <Folder size={14} />
          <span>Browse Workspace Files</span>
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        paddingBottom: '24px',
      }}
    >
      {/* Overview Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 2px',
          fontSize: '11.5px',
          color: '#71717a',
        }}
      >
        <span>
          <strong style={{ color: '#ffffff' }}>{tabs.length}</strong> open tab{tabs.length === 1 ? '' : 's'} in {activeWorkspaceName || 'Workspace'}
        </span>
        <button
          onClick={() => {
            triggerHaptic(15);
            onOpenExplorer();
          }}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#0078d4',
            fontSize: '11px',
            fontWeight: 500,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '2px 4px',
          }}
        >
          <Folder size={12} />
          <span>Browse Files</span>
        </button>
      </div>

      {/* Tabs List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {tabs.map((tab, idx) => {
          const isModified = modifiedSet.has(tab.label);
          const isActive = Boolean(tab.isActive);

          return (
            <div
              key={`${tab.path || tab.label}-${idx}`}
              style={{
                background: isActive ? '#1c1c1e' : '#181819',
                border: isActive ? '1px solid rgba(0, 120, 212, 0.4)' : '1px solid rgba(255, 255, 255, 0.06)',
                borderRadius: '8px',
                padding: '10px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                transition: 'border-color 150ms ease, background 150ms ease',
              }}
            >
              {/* File Info Row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                  <FileTypeBadge name={tab.label} />
                  <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span
                        style={{
                          fontSize: '13px',
                          fontWeight: isActive ? 600 : 500,
                          color: isActive ? '#ffffff' : '#d4d4d8',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {tab.label}
                      </span>
                      {tab.isDirty && (
                        <Circle size={6} fill="#ffffff" color="#ffffff" style={{ opacity: 0.8 }} />
                      )}
                      {isModified && (
                        <span
                          style={{
                            fontSize: '9.5px',
                            fontFamily: 'monospace',
                            color: '#fbbf24',
                            fontWeight: 700,
                            background: 'rgba(251, 191, 36, 0.1)',
                            border: '1px solid rgba(251, 191, 36, 0.25)',
                            padding: '1px 4px',
                            borderRadius: '3px',
                          }}
                        >
                          MODIFIED
                        </span>
                      )}
                    </div>
                    {tab.path && tab.path !== tab.label && (
                      <span
                        style={{
                          fontSize: '11px',
                          fontFamily: 'monospace',
                          color: '#71717a',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          marginTop: '1px',
                        }}
                      >
                        {tab.path}
                      </span>
                    )}
                  </div>
                </div>

                {/* State Badge */}
                {isActive && (
                  <span
                    style={{
                      background: 'rgba(34, 197, 94, 0.12)',
                      border: '1px solid rgba(34, 197, 94, 0.28)',
                      color: '#4ade80',
                      fontSize: '10px',
                      fontWeight: 600,
                      borderRadius: '4px',
                      padding: '2px 6px',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                  >
                    Active on PC
                  </span>
                )}
              </div>

              {/* Action Buttons Row */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  paddingTop: '4px',
                  borderTop: '1px solid rgba(255, 255, 255, 0.04)',
                }}
              >
                <button
                  onClick={() => {
                    triggerHaptic(15);
                    onSelectTab(tab);
                  }}
                  style={{
                    flex: 1,
                    background: isActive ? '#242426' : '#222224',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '6px',
                    padding: '6px 10px',
                    color: isActive ? '#0078d4' : '#e4e4e7',
                    fontSize: '11.5px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '5px',
                  }}
                >
                  <Monitor size={12} />
                  <span>{isActive ? 'Focused on PC' : 'Focus on PC'}</span>
                </button>

                <button
                  onClick={() => {
                    triggerHaptic(15);
                    onInspectTab(tab);
                  }}
                  style={{
                    flex: 1,
                    background: '#222224',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '6px',
                    padding: '6px 10px',
                    color: '#e4e4e7',
                    fontSize: '11.5px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '5px',
                  }}
                >
                  <Eye size={12} />
                  <span>Preview Code</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});
