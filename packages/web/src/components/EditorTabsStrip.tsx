import React from 'react';
import { Folder, Circle } from 'lucide-react';
import { EditorTab } from '@agy-companion/protocol';
import { FileTypeBadge, triggerHaptic } from './CommonUI';

interface EditorTabsStripProps {
  tabs: EditorTab[];
  activeWorkspaceName?: string;
  onSelectTab: (tab: EditorTab) => void;
  onInspectTab?: (tab: EditorTab) => void;
  onOpenExplorer?: () => void;
  modifiedFiles?: { file: string; fullPath?: string }[];
}

export const EditorTabsStrip: React.FC<EditorTabsStripProps> = React.memo(({
  tabs,
  activeWorkspaceName,
  onSelectTab,
  onInspectTab,
  onOpenExplorer,
  modifiedFiles = [],
}) => {
  const activeTabRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (activeTabRef.current) {
      activeTabRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  }, [tabs]);

  if (tabs.length === 0) {
    return (
      <div
        style={{
          background: '#181818',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          height: '34px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 14px',
          fontSize: '11.5px',
          color: '#71717a',
          flexShrink: 0,
          userSelect: 'none',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {activeWorkspaceName ? `${activeWorkspaceName} • No open editor tabs` : 'No open editor tabs'}
        </span>
        {onOpenExplorer && (
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
            <span>Files</span>
          </button>
        )}
      </div>
    );
  }

  const modifiedSet = new Set(modifiedFiles.map(f => f.file));

  return (
    <div
      style={{
        background: '#181818',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        height: '36px',
        display: 'flex',
        alignItems: 'stretch',
        overflowX: 'auto',
        overflowY: 'hidden',
        scrollbarWidth: 'none',
        WebkitOverflowScrolling: 'touch',
        flexShrink: 0,
        userSelect: 'none',
      }}
    >
      {tabs.map((tab, idx) => {
        const isModified = modifiedSet.has(tab.label);
        const isActive = Boolean(tab.isActive);

        return (
          <div
            key={`${tab.path || tab.label}-${idx}`}
            ref={isActive ? activeTabRef : undefined}
            onClick={() => {
              triggerHaptic(15);
              if (isActive && onInspectTab) {
                onInspectTab(tab);
              } else {
                onSelectTab(tab);
              }
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '0 12px',
              background: isActive ? '#1f1f1f' : 'transparent',
              color: isActive ? '#ffffff' : '#858585',
              borderRight: '1px solid rgba(255, 255, 255, 0.05)',
              borderBottom: isActive ? '2px solid #0078d4' : '2px solid transparent',
              fontSize: '12px',
              fontFamily: "'Inter', -apple-system, sans-serif",
              fontWeight: isActive ? 600 : 400,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              transition: 'background 100ms ease, color 100ms ease',
            }}
          >
            <FileTypeBadge name={tab.label} />
            <span style={{ maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {tab.label}
            </span>

            {/* Dirty or Modified Indicator */}
            {tab.isDirty ? (
              <Circle size={6} fill="#ffffff" color="#ffffff" style={{ opacity: 0.8 }} />
            ) : isModified ? (
              <span
                style={{
                  fontSize: '10px',
                  fontFamily: 'monospace',
                  color: '#fbbf24',
                  fontWeight: 700,
                  marginLeft: '2px',
                }}
              >
                M
              </span>
            ) : null}
          </div>
        );
      })}

      {/* Explorer shortcut pinned at the end */}
      {onOpenExplorer && (
        <button
          onClick={() => {
            triggerHaptic(15);
            onOpenExplorer();
          }}
          title="Browse workspace files"
          style={{
            background: 'transparent',
            border: 'none',
            color: '#71717a',
            fontSize: '11px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '0 12px',
            flexShrink: 0,
            borderLeft: '1px solid rgba(255, 255, 255, 0.05)',
          }}
        >
          <Folder size={12} />
          <span>Files</span>
        </button>
      )}
    </div>
  );
});
