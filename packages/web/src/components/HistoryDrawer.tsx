import React, { useState, useMemo } from 'react';
import { X, Search } from 'lucide-react';
import { ConversationSummary } from '@agy-companion/protocol';
import { triggerHaptic } from './CommonUI';

interface HistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  conversations: ConversationSummary[];
  onSelectConversation: (id: string) => void;
  onSearchConversations?: (query: string) => void;
}

export const HistoryDrawer: React.FC<HistoryDrawerProps> = ({
  isOpen,
  onClose,
  conversations,
  onSelectConversation,
  onSearchConversations,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase().trim();
    return conversations.filter(c => c.title.toLowerCase().includes(q) || c.id.toLowerCase().includes(q));
  }, [conversations, searchQuery]);

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
          width: '85%',
          maxWidth: '320px',
          height: '100%',
          background: '#181818',
          borderLeft: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-8px 0 24px rgba(0,0,0,0.7)',
          padding: '16px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '13.5px', fontWeight: 600, color: '#ffffff' }}>Session History</span>
            <span style={{ fontSize: '11px', color: '#858585', background: '#222222', padding: '2px 6px', borderRadius: '4px' }}>
              {filteredConversations.length}
            </span>
          </div>
          <button
            onClick={() => {
              triggerHaptic(10);
              onClose();
            }}
            style={{ background: 'transparent', border: 'none', color: '#858585', cursor: 'pointer', padding: '6px' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Global Remote Conversation Search Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: '#212121',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '6px',
            padding: '6px 10px',
            marginBottom: '12px',
          }}
        >
          <Search size={14} color="#858585" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => {
              const val = e.target.value;
              setSearchQuery(val);
              if (onSearchConversations) {
                onSearchConversations(val);
              }
            }}
            placeholder="Search conversations..."
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              color: '#ffffff',
              fontSize: '12px',
              outline: 'none',
            }}
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery('');
                if (onSearchConversations) onSearchConversations('');
              }}
              style={{ background: 'transparent', border: 'none', color: '#858585', cursor: 'pointer', padding: '2px' }}
            >
              <X size={12} />
            </button>
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filteredConversations.length === 0 ? (
            <div style={{ fontSize: '12px', color: '#858585', padding: '16px 0', textAlign: 'center' }}>
              {searchQuery ? 'No matching conversations.' : 'No past sessions found.'}
            </div>
          ) : (
            filteredConversations.map(conv => (
              <button
                key={conv.id}
                onClick={() => {
                  triggerHaptic(20);
                  onSelectConversation(conv.id);
                  onClose();
                }}
                style={{
                  background: '#212121',
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
                  transition: 'background 0.15s ease',
                }}
              >
                <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {conv.title}
                </span>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '10px', color: '#858585' }}>
                    {new Date(conv.timestamp).toLocaleDateString()} {new Date(conv.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span style={{ fontSize: '9.5px', color: '#555555', fontFamily: 'monospace' }}>
                    {conv.id.slice(0, 8)}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
