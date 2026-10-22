import React from 'react';
import { X } from 'lucide-react';
import { ConversationSummary } from '@agy-companion/protocol';

interface HistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  conversations: ConversationSummary[];
  onSelectConversation: (id: string) => void;
}

export const HistoryDrawer: React.FC<HistoryDrawerProps> = ({
  isOpen,
  onClose,
  conversations,
  onSelectConversation,
}) => {
  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 70,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        justifyContent: 'flex-end',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '80%',
          maxWidth: '300px',
          height: '100%',
          background: '#1e1e1e',
          borderLeft: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-8px 0 24px rgba(0,0,0,0.5)',
          padding: '16px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#ffffff' }}>Session History</span>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: '#858585', cursor: 'pointer' }}
          >
            <X size={15} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {conversations.length === 0 ? (
            <div style={{ fontSize: '12px', color: '#858585', padding: '10px 0' }}>No past sessions found.</div>
          ) : (
            conversations.map(conv => (
              <button
                key={conv.id}
                onClick={() => onSelectConversation(conv.id)}
                style={{
                  background: '#252525',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '6px',
                  padding: '10px 12px',
                  color: '#ffffff',
                  fontSize: '12px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                }}
              >
                <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {conv.title}
                </span>
                <span style={{ fontSize: '10px', color: '#858585' }}>
                  {new Date(conv.timestamp).toLocaleDateString()} {new Date(conv.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
