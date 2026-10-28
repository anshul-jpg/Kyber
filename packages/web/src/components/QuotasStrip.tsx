import React, { useState } from 'react';
import { AgentQuota } from '@agy-companion/protocol';
import { Zap, Clock, ShieldCheck, ChevronDown, ChevronUp } from 'lucide-react';
import { triggerHaptic } from './CommonUI';

interface QuotasStripProps {
  quotas: AgentQuota[];
}

export const QuotasStrip: React.FC<QuotasStripProps> = React.memo(({ quotas }) => {
  const [expanded, setExpanded] = useState<boolean>(false);

  if (!quotas || quotas.length === 0) return null;

  // Filter primary models (Flash, Sonnet, Opus, GPT-OSS)
  const displayQuotas = quotas.slice(0, 4);

  return (
    <div
      style={{
        width: '100%',
        boxSizing: 'border-box',
        background: '#121213',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        fontFamily: "'Geist Mono', Consolas, monospace",
        fontSize: '11px',
      }}
    >
      {/* Micro Strip */}
      <div
        onClick={() => {
          triggerHaptic(15);
          setExpanded(prev => !prev);
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 12px',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#71717a', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            <Zap size={11} color="#eab308" />
            <span>Quotas</span>
          </span>

          {displayQuotas.map(q => {
            const used = q.usedPercent || 0;
            const statusColor = used > 85 ? '#f87171' : used > 60 ? '#fbbf24' : '#4ade80';
            const shortName = q.name
              .replace(/Claude /i, '')
              .replace(/Gemini /i, '')
              .replace(/GPT-/i, '')
              .replace(/ \(Thinking\)| \(High\)| \(Medium\)/gi, '');

            return (
              <div
                key={q.id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  background: 'rgba(255, 255, 255, 0.04)',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    width: '5px',
                    height: '5px',
                    borderRadius: '50%',
                    background: statusColor,
                  }}
                />
                <span style={{ color: '#d4d4d8', fontSize: '10px', fontWeight: 600 }}>{shortName}</span>
                <span style={{ color: '#71717a', fontSize: '10px' }}>{100 - used}%</span>
              </div>
            );
          })}
        </div>

        <button
          style={{
            background: 'transparent',
            border: 'none',
            color: '#71717a',
            display: 'flex',
            alignItems: 'center',
            cursor: 'pointer',
            padding: '2px',
          }}
        >
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
      </div>

      {/* Expanded Details Drawer */}
      {expanded && (
        <div
          style={{
            padding: '8px 14px 12px',
            background: '#0d0d0e',
            borderTop: '1px solid rgba(255, 255, 255, 0.06)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10px', color: '#71717a' }}>
            <span>LIVE LANGUAGE SERVER TOKEN BUDGETS</span>
            <span>ROLLING LIMITS</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '6px' }}>
            {quotas.map(q => {
              const used = q.usedPercent || 0;
              const remaining = Math.max(0, 100 - used);
              const statusColor = used > 85 ? '#f87171' : used > 60 ? '#fbbf24' : '#4ade80';

              return (
                <div
                  key={q.id}
                  style={{
                    background: '#161618',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '6px',
                    padding: '8px 10px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#ffffff' }}>{q.name}</span>
                    <span style={{ fontSize: '10px', color: statusColor, fontWeight: 700 }}>{remaining}%</span>
                  </div>

                  {/* Progress bar */}
                  <div
                    style={{
                      width: '100%',
                      height: '3px',
                      background: 'rgba(255, 255, 255, 0.08)',
                      borderRadius: '2px',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${remaining}%`,
                        background: statusColor,
                        borderRadius: '2px',
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '9.5px', color: '#71717a', marginTop: '2px' }}>
                    <span>{q.usedUnits !== undefined && q.totalUnits ? `${q.totalUnits - q.usedUnits} left` : q.status}</span>
                    <span>{q.resetWindowText || '1h window'}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
});
