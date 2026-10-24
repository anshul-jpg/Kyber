import React from 'react';
import { MessageSquare, Layers, Folder } from 'lucide-react';
import { triggerHaptic } from './CommonUI';

export type WorkspaceViewSegment = 'chat' | 'tabs' | 'explorer';

interface SegmentedNavProps {
  activeSegment: WorkspaceViewSegment;
  onSelectSegment: (segment: WorkspaceViewSegment) => void;
  tabsCount?: number;
}

export const SegmentedNav: React.FC<SegmentedNavProps> = React.memo(({
  activeSegment,
  onSelectSegment,
  tabsCount = 0,
}) => {
  return (
    <div
      style={{
        background: '#121213',
        borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
        padding: '6px 14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        userSelect: 'none',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          background: '#18181a',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '8px',
          padding: '2px',
          width: '100%',
          maxWidth: '440px',
        }}
      >
        {/* Chat Segment */}
        <button
          onClick={() => {
            triggerHaptic(15);
            onSelectSegment('chat');
          }}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            padding: '6px 8px',
            minHeight: '32px',
            background: activeSegment === 'chat' ? '#27272a' : 'transparent',
            border: 'none',
            borderRadius: '6px',
            color: activeSegment === 'chat' ? '#ffffff' : '#858585',
            fontSize: '11.5px',
            fontWeight: activeSegment === 'chat' ? 600 : 500,
            cursor: 'pointer',
            transition: 'background 120ms ease, color 120ms ease',
            boxShadow: activeSegment === 'chat' ? '0 1px 3px rgba(0, 0, 0, 0.4)' : 'none',
          }}
        >
          <MessageSquare size={13} color={activeSegment === 'chat' ? '#0078d4' : 'currentColor'} />
          <span>Chat</span>
        </button>

        {/* Open Tabs Segment */}
        <button
          onClick={() => {
            triggerHaptic(15);
            onSelectSegment('tabs');
          }}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            padding: '6px 8px',
            minHeight: '32px',
            background: activeSegment === 'tabs' ? '#27272a' : 'transparent',
            border: 'none',
            borderRadius: '6px',
            color: activeSegment === 'tabs' ? '#ffffff' : '#858585',
            fontSize: '11.5px',
            fontWeight: activeSegment === 'tabs' ? 600 : 500,
            cursor: 'pointer',
            transition: 'background 120ms ease, color 120ms ease',
            boxShadow: activeSegment === 'tabs' ? '0 1px 3px rgba(0, 0, 0, 0.4)' : 'none',
          }}
        >
          <Layers size={13} color={activeSegment === 'tabs' ? '#0078d4' : 'currentColor'} />
          <span>Tabs</span>
          {tabsCount > 0 && (
            <span
              style={{
                fontSize: '10px',
                fontFamily: 'monospace',
                fontWeight: 700,
                background: activeSegment === 'tabs' ? '#0078d4' : 'rgba(255, 255, 255, 0.08)',
                color: '#ffffff',
                padding: '0 5px',
                borderRadius: '10px',
                lineHeight: '15px',
                minWidth: '15px',
                textAlign: 'center',
              }}
            >
              {tabsCount}
            </span>
          )}
        </button>

        {/* Explorer Segment */}
        <button
          onClick={() => {
            triggerHaptic(15);
            onSelectSegment('explorer');
          }}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            padding: '6px 8px',
            minHeight: '32px',
            background: activeSegment === 'explorer' ? '#27272a' : 'transparent',
            border: 'none',
            borderRadius: '6px',
            color: activeSegment === 'explorer' ? '#ffffff' : '#858585',
            fontSize: '11.5px',
            fontWeight: activeSegment === 'explorer' ? 600 : 500,
            cursor: 'pointer',
            transition: 'background 120ms ease, color 120ms ease',
            boxShadow: activeSegment === 'explorer' ? '0 1px 3px rgba(0, 0, 0, 0.4)' : 'none',
          }}
        >
          <Folder size={13} color={activeSegment === 'explorer' ? '#0078d4' : 'currentColor'} />
          <span>Explorer</span>
        </button>
      </div>
    </div>
  );
});
