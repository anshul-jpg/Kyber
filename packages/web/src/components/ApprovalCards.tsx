import React, { useState } from 'react';
import {
  Terminal,
  CheckCheck,
  X,
  ChevronDown,
  ChevronRight,
  GitBranch,
  CornerDownLeft,
} from 'lucide-react';
import { ApprovalRequest } from '@agy-companion/protocol';
import { triggerHaptic } from './CommonUI';

interface ApprovalCardsProps {
  pendingApprovals: ApprovalRequest[];
  onSendDecision: (requestId: string, decision: 'allow' | 'deny', option?: number, reason?: string) => void;
  onClearAll?: () => void;
}

export const ApprovalCards = React.memo<ApprovalCardsProps>(({
  pendingApprovals,
  onSendDecision,
  onClearAll,
}) => {
  const [selectedOptions, setSelectedOptions] = useState<Record<string, number>>({});
  const [option4Inputs, setOption4Inputs] = useState<Record<string, string>>({});
  const [showAdvancedApproval, setShowAdvancedApproval] = useState<Record<string, boolean>>({});

  if (pendingApprovals.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
      {onClearAll && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '2px 4px',
          }}
        >
          <span style={{ fontSize: '11.5px', color: '#fbbf24', fontWeight: 600, letterSpacing: '0.02em' }}>
            {pendingApprovals.length > 1 ? `${pendingApprovals.length} Approvals Pending` : 'Approval Pending'}
          </span>
          <button
            onClick={() => {
              triggerHaptic(30);
              onClearAll();
            }}
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#a1a1aa',
              borderRadius: '5px',
              fontSize: '11px',
              fontWeight: 500,
              padding: '3px 8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            Clear All
          </button>
        </div>
      )}
      {pendingApprovals.map(req => {
        const selected = selectedOptions[req.id] || 1;
        const showAdvanced = !!showAdvancedApproval[req.id];
        const cmd = req.toolCall?.args?.CommandLine;
        const toolAction =
          req.toolCall?.args?.toolAction ||
          req.toolCall?.args?.toolSummary ||
          req.toolCall?.args?.Description;
        const hasGitChanges = req.gitChanges && req.gitChanges.length > 0;

        return (
          <div
            key={req.id}
            style={{
              background: '#1e1e1e',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '10px',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              boxShadow: '0 8px 30px rgba(0, 0, 0, 0.6)',
            }}
          >
            {/* Header: Terminal icon, Title & Badge */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Terminal size={15} color="#007acc" />
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#ffffff' }}>
                  Tool Execution Request
                </span>
              </div>
              <span
                style={{
                  background: '#262626',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '4px',
                  padding: '2px 6px',
                  fontSize: '11px',
                  fontFamily: "'Geist Mono', monospace",
                  color: '#858585',
                }}
              >
                {req.toolCall?.name || 'run_command'}
              </span>
            </div>

            {toolAction && (
              <div style={{ fontSize: '12.5px', color: '#cccccc' }}>
                {toolAction}
              </div>
            )}

            {/* Command Monospace Preview */}
            {cmd && (
              <div
                style={{
                  background: '#141414',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '6px',
                  padding: '10px 12px',
                  fontFamily: "'Geist Mono', Consolas, monospace",
                  fontSize: '12px',
                  color: '#cccccc',
                  overflowWrap: 'anywhere',
                  whiteSpace: 'pre-wrap',
                  lineHeight: '1.45',
                }}
              >
                {cmd}
              </div>
            )}

            {/* Git changes badge if attached */}
            {hasGitChanges && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', color: '#94a3b8' }}>
                <GitBranch size={13} />
                <span>{req.gitChanges!.length} modified workspace file(s)</span>
              </div>
            )}

            {/* Immediate 1-Tap Allow & Deny Controls */}
            <div style={{ display: 'flex', gap: '8px', paddingTop: '2px' }}>
              <button
                onClick={() => {
                  onSendDecision(req.id, 'allow', 1);
                  triggerHaptic([30, 50, 30]);
                }}
                style={{
                  flex: 1,
                  background: '#10b981',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#ffffff',
                  fontSize: '13px',
                  fontWeight: 600,
                  padding: '10px 14px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)',
                  minHeight: '42px',
                }}
              >
                <CheckCheck size={16} />
                <span>Allow</span>
              </button>

              <button
                onClick={() => {
                  onSendDecision(req.id, 'deny', 4, 'Denied by user');
                  triggerHaptic(50);
                }}
                style={{
                  flex: 1,
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '6px',
                  color: '#f87171',
                  fontSize: '13px',
                  fontWeight: 600,
                  padding: '10px 14px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  minHeight: '42px',
                }}
              >
                <X size={16} />
                <span>Deny</span>
              </button>
            </div>

            {/* Advanced Options Accordion Toggle */}
            <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.06)', paddingTop: '6px' }}>
              <button
                onClick={() => setShowAdvancedApproval(prev => ({ ...prev, [req.id]: !prev[req.id] }))}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#64748b',
                  fontSize: '11.5px',
                  cursor: 'pointer',
                  padding: '4px 0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <span>{showAdvanced ? 'Hide advanced options' : 'More approval options...'}</span>
                {showAdvanced ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </button>

              {showAdvanced && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                  {[
                    { id: 1, label: 'Allow once' },
                    { id: 2, label: 'Always allow in this conversation' },
                    { id: 3, label: `Always allow '${req.toolCall?.name}'` },
                    { id: 4, label: 'Deny & tell the agent what to do instead' },
                  ].map(opt => {
                    const isOptSelected = selected === opt.id;
                    return (
                      <div
                        key={opt.id}
                        onClick={() => {
                          setSelectedOptions({ ...selectedOptions, [req.id]: opt.id });
                          triggerHaptic(20);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '6px 8px',
                          borderRadius: '6px',
                          background: isOptSelected ? '#2d2d2d' : 'transparent',
                          border: isOptSelected ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid transparent',
                          cursor: 'pointer',
                          fontSize: '12px',
                          color: isOptSelected ? '#ffffff' : '#94a3b8',
                        }}
                      >
                        <span
                          style={{
                            width: '16px',
                            height: '16px',
                            borderRadius: '3px',
                            background: isOptSelected ? '#3a3a3a' : '#262626',
                            color: isOptSelected ? '#ffffff' : '#858585',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '10px',
                            fontWeight: 700,
                          }}
                        >
                          {opt.id}
                        </span>
                        <span>{opt.label}</span>
                      </div>
                    );
                  })}

                  {selected === 4 && (
                    <input
                      type="text"
                      placeholder="Tell the agent what to do instead..."
                      value={option4Inputs[req.id] || ''}
                      onChange={e => setOption4Inputs({ ...option4Inputs, [req.id]: e.target.value })}
                      style={{
                        background: '#141414',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        borderRadius: '6px',
                        color: '#ffffff',
                        padding: '8px 10px',
                        fontSize: '12px',
                        outline: 'none',
                        marginTop: '4px',
                      }}
                    />
                  )}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
                    <button
                      onClick={() => {
                        if (selected === 4) {
                          onSendDecision(req.id, 'deny', 4, option4Inputs[req.id] || '');
                        } else {
                          onSendDecision(req.id, 'allow', selected);
                        }
                      }}
                      style={{
                        background: '#0078d4',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '6px 14px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <span>Submit Option</span>
                      <CornerDownLeft size={12} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
});
