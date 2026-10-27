import React from 'react';
import { AlertTriangle, AlertCircle, Info, X } from 'lucide-react';
import { ApprovalRequest } from '@agy-companion/protocol';
import { triggerHaptic } from './CommonUI';

interface IdeSystemDialogModalProps {
  request: ApprovalRequest;
  onSendDecision: (requestId: string, decision: 'allow' | 'deny', option?: number, reason?: string) => void;
}

export function isIdeSystemDialog(req: ApprovalRequest): boolean {
  return Boolean(
    req.isDialog ||
    req.conversationId === 'ide_dialog' ||
    req.id.startsWith('dialog_') ||
    (req.toolCall?.name === 'ask_question' && req.toolTitle?.toLowerCase().includes('save progress'))
  );
}

export function parseDialogContent(request: ApprovalRequest): {
  title: string;
  detail: string;
  options: string[];
  type: 'warning' | 'info' | 'error';
} {
  const data = request.dialogData;
  let title = data?.title || '';
  let detail = data?.message || data?.detail || '';
  let options = data?.options;
  let type: 'warning' | 'info' | 'error' = data?.type || 'warning';

  if (!title) {
    const rawQuestion =
      request.toolCall?.args?.questions?.[0]?.question ||
      request.toolCall?.args?.question ||
      request.toolTitle ||
      '';

    const lines = rawQuestion.split('\n').map((l: string) => l.trim()).filter(Boolean);
    if (lines.length > 1) {
      title = lines[0];
      detail = lines.slice(1).join('\n');
    } else if (rawQuestion.includes('unsaved changes in:')) {
      const match = rawQuestion.match(/unsaved changes in:\s*([^.]+)\.?\s*(Do you want to save[^?]*\??)/i);
      if (match) {
        title = `Do you want to save the changes you made to ${match[1].trim()}?`;
        detail = "Your changes will be lost if you don't save them.";
      } else {
        title = rawQuestion;
      }
    } else {
      title = rawQuestion || 'System Confirmation';
    }
  }

  // Strip numbered prefixes like "1. " from title
  title = title.replace(/^\d+\.\s*/, '');

  if (!options || options.length === 0) {
    const rawOpts =
      request.toolCall?.args?.questions?.[0]?.options ||
      request.toolCall?.args?.options;
    if (Array.isArray(rawOpts) && rawOpts.length > 0) {
      // Filter out write-in option if present
      options = rawOpts.filter((o: string) => !o.toLowerCase().startsWith('other'));
    } else {
      options = ['Save', "Don't Save", 'Cancel'];
    }
  }

  // Normalize option labels if they are the long verbose ones
  const normalizedOptions = options.map(opt => {
    const lower = opt.toLowerCase();
    if (lower.includes('save all') || lower === 'save') return 'Save';
    if (lower.includes("don't save") || lower.includes('dont save')) return "Don't Save";
    if (lower.includes('cancel')) return 'Cancel';
    return opt;
  });

  return { title, detail, options: normalizedOptions, type };
}

export const IdeSystemDialogModal: React.FC<IdeSystemDialogModalProps> = ({
  request,
  onSendDecision,
}) => {
  const { title, detail, options, type } = parseDialogContent(request);

  const isUntitled = title.toLowerCase().includes('untitled') || detail.toLowerCase().includes('untitled');
  const [customFileName, setCustomFileName] = React.useState<string>(() => {
    const match = title.match(/untitled[-\w]*/i) || detail.match(/untitled[-\w]*/i);
    return match ? `${match[0]}.txt` : 'Untitled-1.txt';
  });

  const handleAction = (optLabel: string, index: number) => {
    triggerHaptic([30, 40]);
    const lower = optLabel.toLowerCase();
    const isSave = lower.includes('save') && !lower.includes("don't") && !lower.includes('dont');
    const isDontSave = lower.includes("don't save") || lower.includes('dont save');
    const isCancel = lower.includes('cancel');

    if (isSave) {
      const reasonText = isUntitled && customFileName.trim() ? `Save:${customFileName.trim()}` : optLabel;
      onSendDecision(request.id, 'allow', index + 1, reasonText);
    } else if (isDontSave) {
      onSendDecision(request.id, 'deny', index + 1, optLabel);
    } else if (isCancel) {
      onSendDecision(request.id, 'deny', index + 1, 'Cancel');
    } else {
      // Fallback
      const decision = index === 0 ? 'allow' : 'deny';
      onSendDecision(request.id, decision, index + 1, optLabel);
    }
  };

  const handleClose = () => {
    triggerHaptic(20);
    // Finding cancel option index if present
    const cancelIdx = options.findIndex(o => o.toLowerCase().includes('cancel'));
    const optIdx = cancelIdx >= 0 ? cancelIdx + 1 : options.length;
    onSendDecision(request.id, 'deny', optIdx, 'User closed dialog');
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        boxSizing: 'border-box',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        style={{
          width: '100%',
          maxWidth: '430px',
          backgroundColor: '#1f1f1f',
          border: '1px solid rgba(255, 255, 255, 0.14)',
          borderRadius: '6px',
          boxShadow: '0 24px 50px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(0, 0, 0, 0.4)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Top bar with close icon */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            padding: '10px 10px 0 0',
          }}
        >
          <button
            onClick={handleClose}
            aria-label="Close dialog"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#858585',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Content body: Icon + Title + Detail */}
        <div
          style={{
            padding: '4px 22px 20px 22px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '16px',
          }}
        >
          <div style={{ flexShrink: 0, marginTop: '2px' }}>
            {type === 'error' ? (
              <AlertCircle size={30} color="#f87171" />
            ) : type === 'info' ? (
              <Info size={30} color="#ffffff" />
            ) : (
              <AlertTriangle size={30} color="#cca700" />
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
            <h3
              style={{
                margin: 0,
                fontSize: '14.5px',
                fontWeight: 600,
                color: '#ffffff',
                lineHeight: 1.35,
                letterSpacing: '-0.01em',
              }}
            >
              {title}
            </h3>

            {detail && (
              <p
                style={{
                  margin: 0,
                  fontSize: '12.5px',
                  color: '#cccccc',
                  lineHeight: 1.45,
                }}
              >
                {detail}
              </p>
            )}

            {isUntitled && (
              <div style={{ marginTop: '10px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: '#a1a1aa',
                    marginBottom: '4px',
                    letterSpacing: '0.02em',
                  }}
                >
                  Save as (file name):
                </label>
                <input
                  type="text"
                  value={customFileName}
                  onChange={e => setCustomFileName(e.target.value)}
                  placeholder="Untitled-1.txt"
                  style={{
                    width: '100%',
                    backgroundColor: '#141414',
                    border: '1px solid rgba(255, 255, 255, 0.16)',
                    borderRadius: '4px',
                    padding: '8px 10px',
                    color: '#ffffff',
                    fontSize: '13px',
                    fontFamily: 'inherit',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Action Button Bar */}
        <div
          style={{
            padding: '12px 20px',
            backgroundColor: '#181818',
            borderTop: '1px solid rgba(255, 255, 255, 0.06)',
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: '10px',
            flexWrap: 'wrap',
          }}
        >
          {options.map((optLabel, idx) => {
            const lower = optLabel.toLowerCase();
            const isPrimary =
              lower === 'save' ||
              lower.includes('save all') ||
              lower === 'yes' ||
              lower === 'ok' ||
              (idx === 0 && !lower.includes('cancel'));

            const isCancel = lower === 'cancel' || lower === 'close';

            return (
              <button
                key={idx}
                onClick={() => handleAction(optLabel, idx)}
                style={{
                  minHeight: '34px',
                  padding: '6px 16px',
                  fontSize: '13px',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  border: isPrimary
                    ? 'none'
                    : isCancel
                    ? '1px solid rgba(255, 255, 255, 0.1)'
                    : '1px solid rgba(255, 255, 255, 0.08)',
                  backgroundColor: isPrimary
                    ? '#ffffff'
                    : '#27272a',
                  color: isPrimary ? '#000000' : isCancel ? '#cccccc' : '#ffffff',
                  fontWeight: isPrimary ? 600 : 400,
                  outline: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: isPrimary ? '0 1px 3px rgba(0, 0, 0, 0.3)' : 'none',
                }}
              >
                {optLabel}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
