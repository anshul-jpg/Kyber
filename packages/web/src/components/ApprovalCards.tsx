import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Terminal,
  CheckCheck,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  GitBranch,
  CornerDownLeft,
  Pause,
  Play,
  FileCode,
} from 'lucide-react';
import { ApprovalRequest } from '@agy-companion/protocol';
import { triggerHaptic, FileTypeBadge, CopyButton } from './CommonUI';
import { isIdeSystemDialog } from './IdeSystemDialogModal';

interface ApprovalCardsProps {
  pendingApprovals: ApprovalRequest[];
  onSendDecision: (requestId: string, decision: 'allow' | 'deny', option?: number, reason?: string) => void;
  onClearAll?: () => void;
  onResolveFileDiff?: (fileUri: string, action: 'accept' | 'reject') => void;
}

interface QuestionItem {
  question: string;
  options: string[];
  is_multi_select?: boolean;
}

const QuestionCard: React.FC<{
  req: ApprovalRequest;
  onSendDecision: (requestId: string, decision: 'allow' | 'deny', option?: number, reason?: string) => void;
}> = ({ req, onSendDecision }) => {
  const rawQuestions = req.toolCall?.args?.questions;
  const questionList: QuestionItem[] = useMemo(() => {
    if (Array.isArray(rawQuestions) && rawQuestions.length > 0) {
      return rawQuestions.map((q: any) => ({
        question: q.question || 'Question',
        options: Array.isArray(q.options) && q.options.length > 0 ? q.options : ['Yes', 'No'],
        is_multi_select: Boolean(q.is_multi_select),
      }));
    }
    if (req.toolCall?.args?.question) {
      return [{
        question: req.toolCall.args.question,
        options: Array.isArray(req.toolCall.args.options) && req.toolCall.args.options.length > 0
          ? req.toolCall.args.options
          : ['Yes', 'No'],
        is_multi_select: Boolean(req.toolCall.args.is_multi_select),
      }];
    }
    return [{
      question: req.toolTitle || 'Question from Agent',
      options: ['Option 1', 'Option 2'],
      is_multi_select: false,
    }];
  }, [rawQuestions, req.toolCall?.args, req.toolTitle]);

  // Ensure "Other (write your answer)" exists for every question
  const questionOptions = useMemo(() => {
    return questionList.map(q => {
      const hasOther = q.options.some(o => typeof o === 'string' && o.toLowerCase().startsWith('other'));
      return hasOther ? q.options : [...q.options, 'Other (write your answer)'];
    });
  }, [questionList]);

  // Per-question selected indices (default [0] for each question)
  const [selectedMap, setSelectedMap] = useState<Record<number, number[]>>(() => {
    const init: Record<number, number[]> = {};
    questionList.forEach((_, idx) => {
      init[idx] = [0];
    });
    return init;
  });

  // Per-question other text input
  const [otherTextMap, setOtherTextMap] = useState<Record<number, string>>({});

  const handleToggle = (qIdx: number, optIdx: number, isMulti: boolean) => {
    triggerHaptic(20);
    setSelectedMap(prev => {
      const current = prev[qIdx] || [0];
      if (isMulti) {
        const next = current.includes(optIdx)
          ? current.filter(i => i !== optIdx)
          : [...current, optIdx];
        return { ...prev, [qIdx]: next.length > 0 ? next : [optIdx] };
      } else {
        return { ...prev, [qIdx]: [optIdx] };
      }
    });
  };

  const handleSubmit = () => {
    triggerHaptic([30, 50, 30]);

    const formattedAnswers = questionList.map((q, qIdx) => {
      const opts = questionOptions[qIdx];
      const otherIdx = opts.length - 1;
      const chosen = selectedMap[qIdx] || [0];
      const writeIn = (otherTextMap[qIdx] || '').trim();

      const ansStrings = chosen.map(i => {
        if (i === otherIdx && writeIn) return writeIn;
        return opts[i] || `Option ${i + 1}`;
      });

      return {
        question: q.question,
        answer: ansStrings.join(', '),
      };
    });

    let finalReason = '';
    if (formattedAnswers.length === 1) {
      finalReason = `User responded from mobile companion: ${formattedAnswers[0].answer || 'Option 1'}`;
    } else {
      finalReason =
        `User responded from mobile companion:\n` +
        formattedAnswers.map((item, idx) => `${idx + 1}. ${item.question}: ${item.answer || 'Option 1'}`).join('\n');
    }

    const firstOpt = (selectedMap[0]?.[0] ?? 0) + 1;
    onSendDecision(req.id, 'deny', firstOpt, finalReason);
  };

  const handleSkip = () => {
    triggerHaptic(30);
    onSendDecision(req.id, 'deny', 0, 'User skipped question from mobile companion.');
  };

  const hasMultipleQuestions = questionList.length > 1;

  return (
    <div
      style={{
        background: '#181818',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '12px',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.7)',
      }}
    >
      {questionList.map((qItem, qIdx) => {
        const opts = questionOptions[qIdx];
        const otherIdx = opts.length - 1;
        const chosen = selectedMap[qIdx] || [0];
        const isMulti = qItem.is_multi_select;
        const otherVal = otherTextMap[qIdx] || '';

        return (
          <div
            key={qIdx}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              paddingTop: qIdx > 0 ? '12px' : '0',
              borderTop: qIdx > 0 ? '1px solid rgba(255, 255, 255, 0.08)' : 'none',
            }}
          >
            {/* Question Header: [?] badge + Title */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <div
                style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '4px',
                  background: '#262626',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#a1a1aa',
                  fontSize: '11px',
                  fontWeight: 700,
                  flexShrink: 0,
                  marginTop: '1px',
                }}
              >
                ?
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {hasMultipleQuestions && (
                  <span style={{ fontSize: '10.5px', color: '#858585', fontWeight: 600, textTransform: 'uppercase' }}>
                    Question {qIdx + 1} of {questionList.length} {isMulti ? '(Multi-Select)' : ''}
                  </span>
                )}
                <div
                  style={{
                    fontSize: '13.5px',
                    fontWeight: 600,
                    color: '#ffffff',
                    lineHeight: '1.4',
                  }}
                >
                  {qItem.question}
                </div>
              </div>
            </div>

            {/* Options Stack */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '2px' }}>
              {opts.map((opt, optIdx) => {
                const isSelected = chosen.includes(optIdx);
                const isOther = optIdx === otherIdx;

                return (
                  <div key={optIdx} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div
                      onClick={() => handleToggle(qIdx, optIdx, Boolean(isMulti))}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '12px',
                        padding: '9px 12px',
                        borderRadius: '6px',
                        background: isSelected ? '#1c1c1f' : '#141416',
                        border: isSelected ? '1px solid rgba(255, 255, 255, 0.3)' : '1px solid rgba(255, 255, 255, 0.08)',
                        cursor: 'pointer',
                        transition: 'background 120ms ease, border-color 120ms ease',
                      }}
                    >
                      {/* Number Badge */}
                      <div
                        style={{
                          minWidth: '20px',
                          height: '20px',
                          borderRadius: '4px',
                          background: isSelected ? '#ffffff' : '#222222',
                          border: isSelected ? '1px solid #ffffff' : '1px solid rgba(255, 255, 255, 0.08)',
                          color: isSelected ? '#000000' : '#858585',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '11px',
                          fontWeight: 700,
                          flexShrink: 0,
                          marginTop: '1px',
                        }}
                      >
                        {optIdx + 1}
                      </div>

                      {/* Option Text */}
                      <div
                        style={{
                          fontSize: '12.5px',
                          color: isSelected ? '#ffffff' : '#cccccc',
                          lineHeight: '1.45',
                          wordBreak: 'break-word',
                          flex: 1,
                        }}
                      >
                        {opt}
                      </div>
                    </div>

                    {/* Inline input for Other */}
                    {isOther && isSelected && (
                      <input
                        type="text"
                        placeholder="Write your answer..."
                        value={otherVal}
                        onChange={e => setOtherTextMap(prev => ({ ...prev, [qIdx]: e.target.value }))}
                        autoFocus
                        style={{
                          background: '#141414',
                          border: '1px solid rgba(255, 255, 255, 0.15)',
                          borderRadius: '6px',
                          color: '#ffffff',
                          padding: '8px 12px',
                          fontSize: '12.5px',
                          outline: 'none',
                          width: '100%',
                          boxSizing: 'border-box',
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Footer: Skip + Submit ↵ */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: '12px',
          marginTop: '6px',
          paddingTop: '6px',
        }}
      >
        <button
          onClick={handleSkip}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#858585',
            fontSize: '13px',
            fontWeight: 500,
            cursor: 'pointer',
            padding: '8px 14px',
            borderRadius: '8px',
            minHeight: '44px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          Skip
        </button>

        <button
          onClick={handleSubmit}
          style={{
            background: '#ffffff',
            border: 'none',
            borderRadius: '8px',
            color: '#000000',
            fontSize: '13px',
            fontWeight: 700,
            padding: '10px 20px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            minHeight: '44px',
            boxShadow: '0 1px 4px rgba(0, 0, 0, 0.5)',
          }}
        >
          <span>Submit</span>
          <CornerDownLeft size={13} strokeWidth={2.5} color="#000000" />
        </button>
      </div>
    </div>
  );
};

export const DiffViewer: React.FC<{ diff: string; maxHeight?: string }> = ({ diff, maxHeight = '260px' }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollLeft = 0;
      containerRef.current.scrollTop = 0;
    }
  }, [diff]);

  if (!diff) return null;
  const rawLines = diff.split('\n');

  let oldLineCounter = 0;
  let newLineCounter = 0;
  let inHunk = false;

  const parsedLines = rawLines.map((line, idx) => {
    const isAdd = line.startsWith('+') && !line.startsWith('+++');
    const isDel = line.startsWith('-') && !line.startsWith('---');
    const isHunk = line.startsWith('@@');
    const isHeader = line.startsWith('---') || line.startsWith('+++') || line.startsWith('diff ') || line.startsWith('index ');

    let lineNumText = '';
    let sign = ' ';
    let content = line;

    if (isHunk) {
      inHunk = true;
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        oldLineCounter = parseInt(match[1], 10);
        newLineCounter = parseInt(match[2], 10);
      }
      lineNumText = '...';
      sign = '@';
    } else if (isHeader) {
      lineNumText = '';
      sign = ' ';
    } else if (isAdd) {
      lineNumText = String(newLineCounter++);
      sign = '+';
      content = line.slice(1);
    } else if (isDel) {
      lineNumText = String(oldLineCounter++);
      sign = '-';
      content = line.slice(1);
    } else if (inHunk && line.length > 0) {
      lineNumText = String(newLineCounter++);
      oldLineCounter++;
      sign = ' ';
      content = line.startsWith(' ') ? line.slice(1) : line;
    }

    return {
      idx,
      line,
      content,
      lineNumText,
      sign,
      isAdd,
      isDel,
      isHunk,
      isHeader,
    };
  });

  return (
    <div
      ref={containerRef}
      style={{
        background: '#0d0d0e',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '8px',
        overflowX: 'auto',
        overflowY: 'auto',
        maxHeight,
        fontSize: '11px',
        fontFamily: "'Geist Mono', 'SF Mono', Consolas, monospace",
        lineHeight: '1.5',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', width: 'max-content', minWidth: '100%' }}>
        {parsedLines.map(item => {
          let bg = 'transparent';
          let textColor = '#d4d4d8';
          let gutterBg = '#0d0d0e';
          let signColor = '#636366';

          if (item.isAdd) {
            bg = 'rgba(34, 197, 94, 0.12)';
            textColor = '#4ade80';
            gutterBg = '#122617';
            signColor = '#22c55e';
          } else if (item.isDel) {
            bg = 'rgba(239, 68, 68, 0.12)';
            textColor = '#f87171';
            gutterBg = '#2b1414';
            signColor = '#ef4444';
          } else if (item.isHunk) {
            bg = 'rgba(59, 130, 246, 0.08)';
            textColor = '#60a5fa';
            gutterBg = '#101d2a';
            signColor = '#3b82f6';
          } else if (item.isHeader) {
            textColor = '#858585';
            gutterBg = '#0d0d0e';
          }

          return (
            <div
              key={item.idx}
              style={{
                display: 'flex',
                alignItems: 'stretch',
                background: bg,
                width: '100%',
                minWidth: '100%',
                boxSizing: 'border-box',
                whiteSpace: 'pre',
              }}
            >
              {/* Sticky Gutter: Line Number + Sign */}
              <div
                style={{
                  position: 'sticky',
                  left: 0,
                  zIndex: 2,
                  display: 'flex',
                  alignItems: 'center',
                  background: gutterBg,
                  borderRight: '1px solid rgba(255, 255, 255, 0.07)',
                  padding: '1px 6px 1px 4px',
                  userSelect: 'none',
                  flexShrink: 0,
                  gap: '4px',
                }}
              >
                <span
                  style={{
                    width: '32px',
                    textAlign: 'right',
                    color: '#636366',
                    fontSize: '10px',
                    fontFamily: 'inherit',
                  }}
                >
                  {item.lineNumText}
                </span>
                <span
                  style={{
                    width: '12px',
                    textAlign: 'center',
                    fontWeight: 700,
                    color: signColor,
                    fontSize: '11px',
                    fontFamily: 'inherit',
                  }}
                >
                  {item.sign}
                </span>
              </div>

              {/* Diff Line Content */}
              <span
                style={{
                  flex: 1,
                  color: textColor,
                  padding: '1px 12px 1px 8px',
                  fontFamily: 'inherit',
                }}
              >
                {item.content || ' '}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const ApprovalCards = React.memo<ApprovalCardsProps>(({
  pendingApprovals,
  onSendDecision,
  onClearAll,
  onResolveFileDiff,
}) => {
  const [selectedOptions, setSelectedOptions] = useState<Record<string, number>>({});
  const [option4Inputs, setOption4Inputs] = useState<Record<string, string>>({});
  const [showAdvancedApproval, setShowAdvancedApproval] = useState<Record<string, boolean>>({});
  const [expandedDiffs, setExpandedDiffs] = useState<Record<string, boolean>>({});

  // Filter out system modal dialogs (rendered as popups, never in-feed text cards)
  const filteredApprovals = useMemo(
    () => pendingApprovals.filter(req => !isIdeSystemDialog(req)),
    [pendingApprovals]
  );

  if (filteredApprovals.length === 0) return null;

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
            {filteredApprovals.length > 1 ? `${filteredApprovals.length} Approvals Pending` : 'Approval Pending'}
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
      {filteredApprovals.map(req => {
        if (req.toolCall?.name === 'ask_question') {
          return (
            <QuestionCard
              key={req.id}
              req={req}
              onSendDecision={onSendDecision}
            />
          );
        }

        const selected = selectedOptions[req.id] || 1;
        const showAdvanced = !!showAdvancedApproval[req.id];
        const cmd = req.toolCall?.args?.CommandLine;
        const targetFile = req.toolCall?.args?.TargetFile;
        const toolAction =
          req.toolCall?.args?.toolAction ||
          req.toolCall?.args?.toolSummary ||
          req.toolCall?.args?.Description;
        const hasGitChanges = req.gitChanges && req.gitChanges.length > 0;

        return (
          <div
            key={req.id}
            style={{
              background: '#0a0a0c',
              border: '1px solid #1f1f1f',
              borderRadius: '12px',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.7)',
            }}
          >
            {/* Header: Terminal icon, Title & Badge */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {targetFile ? <FileCode size={15} color="#ffffff" /> : <Terminal size={15} color="#ffffff" />}
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#ffffff' }}>
                  {targetFile ? 'File Edit Request' : 'Tool Execution Request'}
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

            {/* Target File Monospace Preview if file tool */}
            {targetFile && (
              <div
                style={{
                  background: '#141414',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '6px',
                  padding: '8px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '12px',
                }}
              >
                <FileTypeBadge name={targetFile} />
                <span
                  style={{
                    fontFamily: "'Geist Mono', Consolas, monospace",
                    color: '#e4e4e7',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {targetFile}
                </span>
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

            {/* Diff Inspection Card / Toggle */}
            {(req.gitDiff || hasGitChanges) && (() => {
              const isFileMutation = req.toolCall?.name === 'replace_file_content' || req.toolCall?.name === 'multi_replace_file_content' || req.toolCall?.name === 'write_to_file';
              const isExpanded = expandedDiffs[req.id] ?? isFileMutation;
              let ins = 0;
              let del = 0;
              if (req.gitDiff) {
                for (const l of req.gitDiff.split('\n')) {
                  if (l.startsWith('+') && !l.startsWith('+++')) ins++;
                  if (l.startsWith('-') && !l.startsWith('---')) del++;
                }
              }
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <button
                      onClick={() => {
                        triggerHaptic(15);
                        setExpandedDiffs(prev => ({ ...prev, [req.id]: !isExpanded }));
                      }}
                      style={{
                        background: 'rgba(255, 255, 255, 0.04)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '5px',
                        padding: '4px 8px',
                        color: '#a1a1aa',
                        fontSize: '11px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        cursor: 'pointer',
                      }}
                    >
                      <GitBranch size={12} color="#ededed" />
                      <span>{isExpanded ? 'Hide Diff' : 'Inspect Diff'}</span>
                      {(ins > 0 || del > 0) && (
                        <span style={{ display: 'inline-flex', gap: '4px', fontSize: '10px', fontFamily: "'Geist Mono', monospace" }}>
                          <span style={{ color: '#4ade80' }}>+{ins}</span>
                          <span style={{ color: '#f87171' }}>-{del}</span>
                        </span>
                      )}
                      <ChevronDown
                        size={12}
                        style={{
                          transform: isExpanded ? 'rotate(180deg)' : 'none',
                          transition: 'transform 150ms ease',
                        }}
                      />
                    </button>

                    {req.gitDiff ? (
                      <CopyButton text={req.gitDiff} />
                    ) : hasGitChanges ? (
                      <span style={{ fontSize: '11px', color: '#858585' }}>
                        {req.gitChanges!.length} modified file(s)
                      </span>
                    ) : null}
                  </div>

                  {isExpanded && (
                    <div style={{ marginTop: '2px' }}>
                      {req.gitDiff ? (
                        <DiffViewer diff={req.gitDiff} maxHeight="300px" />
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {req.gitChanges?.map((c, idx) => (
                            <div
                              key={idx}
                              style={{
                                background: '#141414',
                                border: '1px solid rgba(255, 255, 255, 0.06)',
                                borderRadius: '4px',
                                padding: '6px 10px',
                                fontSize: '11.5px',
                                fontFamily: "'Geist Mono', monospace",
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <FileTypeBadge name={c.file} />
                                <span style={{ color: '#e4e4e7' }}>{c.file}</span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                  <span style={{ color: '#4ade80' }}>+{c.insertions}</span>
                                  <span style={{ color: '#f87171' }}>-{c.deletions}</span>
                                </div>
                                {onResolveFileDiff && (
                                  <div style={{ display: 'flex', gap: '4px', marginLeft: '4px' }}>
                                    <button
                                      type="button"
                                      onClick={e => {
                                        e.stopPropagation();
                                        triggerHaptic(20);
                                        onResolveFileDiff(c.file, 'accept');
                                      }}
                                      title="Accept edits in file"
                                      style={{
                                        background: 'rgba(34, 197, 94, 0.15)',
                                        border: '1px solid rgba(34, 197, 94, 0.3)',
                                        borderRadius: '4px',
                                        color: '#4ade80',
                                        padding: '2px 6px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '2px',
                                        fontSize: '10px',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                      }}
                                    >
                                      <Check size={11} />
                                      <span>Accept</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={e => {
                                        e.stopPropagation();
                                        triggerHaptic(20);
                                        onResolveFileDiff(c.file, 'reject');
                                      }}
                                      title="Reject edits in file"
                                      style={{
                                        background: 'rgba(239, 68, 68, 0.15)',
                                        border: '1px solid rgba(239, 68, 68, 0.3)',
                                        borderRadius: '4px',
                                        color: '#f87171',
                                        padding: '2px 6px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '2px',
                                        fontSize: '10px',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                      }}
                                    >
                                      <X size={11} />
                                      <span>Reject</span>
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Paused state banner */}
            {req.isPaused && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(245, 158, 11, 0.12)',
                  border: '1px solid rgba(245, 158, 11, 0.25)',
                  borderRadius: '6px',
                  padding: '7px 10px',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  color: '#f59e0b',
                }}
              >
                <Pause size={13} color="#f59e0b" />
                <span>Execution Paused • Tap Resume & Allow to continue</span>
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
                  background: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#000000',
                  fontSize: '13px',
                  fontWeight: 700,
                  padding: '10px 14px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  boxShadow: '0 1px 4px rgba(0, 0, 0, 0.5)',
                  minHeight: '44px',
                  transition: 'transform 100ms cubic-bezier(0.2, 0, 0, 1), opacity 100ms ease',
                }}
              >
                {req.isPaused ? <Play size={15} fill="#000000" color="#000000" /> : <CheckCheck size={16} color="#000000" />}
                <span>{req.isPaused ? 'Resume & Allow' : 'Allow'}</span>
              </button>

              <button
                onClick={() => {
                  onSendDecision(req.id, 'deny', 4, 'Denied by user');
                  triggerHaptic(50);
                }}
                style={{
                  flex: 1,
                  background: '#141416',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '8px',
                  color: '#f87171',
                  fontSize: '13px',
                  fontWeight: 600,
                  padding: '10px 14px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  minHeight: '44px',
                  transition: 'transform 100ms cubic-bezier(0.2, 0, 0, 1), background 120ms ease',
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
                        background: '#ffffff',
                        color: '#000000',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '8px 14px',
                        fontSize: '12px',
                        fontWeight: 700,
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
