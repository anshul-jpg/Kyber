import React, { useState, useEffect, useRef } from 'react';
import {
  ApprovalRequest,
  GitFileChange,
  WorkspaceState,
  WsServerMessage,
  WsClientMessage,
  ChatMessage,
  ToolCallData,
} from '@agy-companion/protocol';
import {
  Terminal,
  FileCode,
  Search,
  Wrench,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  Copy,
  CheckCheck,
  ShieldAlert,
  Zap,
  Settings,
  Send,
  Sparkles,
  Folder,
  Plus,
  History,
  MoreHorizontal,
  Laptop,
  Smartphone,
} from 'lucide-react';

// --- Micro-helpers & Tactile Feedback ---
const triggerHaptic = (pattern: number | number[] = 40) => {
  if (typeof window !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {}
  }
};

// --- Copy to Clipboard Button ---
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopied(true);
    triggerHaptic(30);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      title="Copy"
      style={{
        background: 'rgba(255, 255, 255, 0.06)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '6px',
        color: copied ? '#34d399' : '#94a3b8',
        padding: '3px 7px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        fontSize: '11px',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
      }}
    >
      {copied ? <CheckCheck size={12} /> : <Copy size={12} />}
      <span>{copied ? 'Copied' : 'Copy'}</span>
    </button>
  );
}

// --- Exact Antigravity IDE Tool Activity Row (1-1 Match) ---
function ToolCallPill({ toolCall, summary }: { toolCall?: ToolCallData; summary: string }) {
  const [expanded, setExpanded] = useState(false);
  const name = toolCall?.name || 'tool';
  const args = toolCall?.args || {};

  // 1. File Edit Tools (replace_file_content, write_to_file, multi_replace_file_content)
  if (name === 'replace_file_content' || name === 'write_to_file' || name === 'multi_replace_file_content') {
    const filePath = (args.TargetFile || args.AbsolutePath || '').replace(/\\/g, '/');
    const fileName = filePath ? filePath.split('/').pop() : 'file';
    const ext = fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() : '';

    let badge = 'FILE';
    let badgeColor = '#94a3b8';
    let badgeBg = 'rgba(148, 163, 184, 0.15)';

    if (ext === 'ts') {
      badge = 'TS';
      badgeColor = '#3b82f6';
      badgeBg = 'rgba(59, 130, 246, 0.18)';
    } else if (ext === 'tsx') {
      badge = '⚛️';
      badgeColor = '#38bdf8';
      badgeBg = 'rgba(56, 189, 248, 0.18)';
    } else if (ext === 'js' || ext === 'mjs' || ext === 'cjs') {
      badge = 'JS';
      badgeColor = '#facc15';
      badgeBg = 'rgba(250, 204, 21, 0.18)';
    } else if (ext === 'json') {
      badge = '{}';
      badgeColor = '#fbbf24';
      badgeBg = 'rgba(251, 191, 36, 0.18)';
    } else if (ext === 'xml' || ext === 'html') {
      badge = '<>';
      badgeColor = '#34d399';
      badgeBg = 'rgba(52, 211, 153, 0.18)';
    }

    const newLines = (args.ReplacementContent || '').split('\n').length;
    const oldLines = (args.TargetContent || '').split('\n').length;
    const ins = Math.max(1, newLines);
    const del = Math.max(0, oldLines);

    return (
      <div style={{ margin: '3px 0' }}>
        <div
          onClick={() => {
            setExpanded(!expanded);
            triggerHaptic(20);
          }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '13px',
            color: '#a1a1aa',
            cursor: 'pointer',
            padding: '2px 4px',
            borderRadius: '4px',
            userSelect: 'none',
          }}
        >
          <span>Edited</span>
          <span
            style={{
              fontSize: '10px',
              fontWeight: 700,
              padding: '1px 5px',
              borderRadius: '3px',
              background: badgeBg,
              color: badgeColor,
            }}
          >
            {badge}
          </span>
          <span style={{ color: '#f4f4f5', fontWeight: 500 }}>{fileName}</span>
          <span style={{ color: '#22c55e', fontSize: '11.5px', fontWeight: 600 }}>+{ins}</span>
          <span style={{ color: '#ef4444', fontSize: '11.5px', fontWeight: 600 }}>-{del}</span>
          <ChevronRight
            size={12}
            color="#71717a"
            style={{
              transform: expanded ? 'rotate(90deg)' : 'none',
              transition: 'transform 0.15s ease',
            }}
          />
        </div>

        {expanded && (
          <div
            style={{
              marginTop: '4px',
              padding: '8px 12px',
              background: '#0d1117',
              borderRadius: '6px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              fontSize: '11.5px',
              fontFamily: 'Geist Mono, monospace',
              color: '#cbd5e1',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ color: '#71717a' }}>{filePath}</span>
              <CopyButton text={args.ReplacementContent || JSON.stringify(args, null, 2)} />
            </div>
            {args.Instruction && (
              <div style={{ color: '#94a3b8', marginBottom: '4px' }}>{args.Instruction}</div>
            )}
          </div>
        )}
      </div>
    );
  }

  // 2. Command Execution Tools (run_command)
  if (name === 'run_command') {
    const cmd = args.CommandLine || summary || 'command';
    return (
      <div style={{ margin: '3px 0' }}>
        <div
          onClick={() => {
            setExpanded(!expanded);
            triggerHaptic(20);
          }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '13px',
            color: '#a1a1aa',
            cursor: 'pointer',
            padding: '2px 4px',
            borderRadius: '4px',
            userSelect: 'none',
          }}
        >
          <span>{expanded ? `Run ${cmd}?` : `Ran ${cmd}`}</span>
          <ChevronRight
            size={12}
            color="#71717a"
            style={{
              transform: expanded ? 'rotate(90deg)' : 'none',
              transition: 'transform 0.15s ease',
            }}
          />
        </div>

        {expanded && (
          <div
            style={{
              marginTop: '4px',
              padding: '8px 12px',
              background: '#0d1117',
              borderRadius: '6px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              fontSize: '12px',
              fontFamily: 'Geist Mono, monospace',
              color: '#e2e8f0',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#71717a' }}>..\\antigravity compainion &gt; {cmd}</span>
              <CopyButton text={cmd} />
            </div>
          </div>
        )}
      </div>
    );
  }

  // 3. Exploration Tools (view_file, list_dir, grep_search)
  const isSearch = name === 'grep_search';
  const label = isSearch ? `Explored 1 search` : `Explored 1 file`;

  return (
    <div style={{ margin: '3px 0' }}>
      <div
        onClick={() => {
          setExpanded(!expanded);
          triggerHaptic(20);
        }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: '13px',
          color: '#a1a1aa',
          cursor: 'pointer',
          padding: '2px 4px',
          borderRadius: '4px',
          userSelect: 'none',
        }}
      >
        <span>{label}</span>
        <ChevronRight
          size={12}
          color="#71717a"
          style={{
            transform: expanded ? 'rotate(90deg)' : 'none',
            transition: 'transform 0.15s ease',
          }}
        />
      </div>

      {expanded && (
        <div
          style={{
            marginTop: '4px',
            padding: '8px 12px',
            background: '#0d1117',
            borderRadius: '6px',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            fontSize: '11.5px',
            fontFamily: 'Geist Mono, monospace',
            color: '#cbd5e1',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ color: '#71717a' }}>
              {args.AbsolutePath || args.SearchPath || args.Query || summary}
            </span>
            <CopyButton text={JSON.stringify(args, null, 2)} />
          </div>
        </div>
      )}
    </div>
  );
}

// --- Thought Process Accordion (Exact IDE "Thought for 1s >") ---
function ThinkingAccordion({ thought }: { thought: string }) {
  const [open, setOpen] = useState(false);
  if (!thought) return null;

  return (
    <div style={{ margin: '3px 0' }}>
      <div
        onClick={() => {
          setOpen(!open);
          triggerHaptic(20);
        }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          color: '#a1a1aa',
          fontSize: '13px',
          cursor: 'pointer',
          padding: '2px 4px',
          borderRadius: '4px',
          userSelect: 'none',
        }}
      >
        <span>Thought for 1s</span>
        <ChevronRight
          size={12}
          color="#71717a"
          style={{
            transform: open ? 'rotate(90deg)' : 'none',
            transition: 'transform 0.15s ease',
          }}
        />
      </div>

      {open && (
        <div
          style={{
            marginTop: '4px',
            padding: '8px 12px',
            borderRadius: '6px',
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            fontSize: '12px',
            lineHeight: '1.5',
            color: '#a1a1aa',
            fontStyle: 'italic',
            whiteSpace: 'pre-wrap',
            maxHeight: '200px',
            overflowY: 'auto',
          }}
        >
          {thought}
        </div>
      )}
    </div>
  );
}

// --- Clean Markdown Text Formatter ---
function FormattedMessage({ text }: { text: string }) {
  if (!text) return null;

  // Split text into code blocks and normal paragraphs
  const parts = text.split(/(```[\s\S]*?```)/g);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {parts.map((part, idx) => {
        if (part.startsWith('```') && part.endsWith('```')) {
          const lines = part.slice(3, -3).trim().split('\n');
          const firstLine = lines[0].trim();
          const hasLang = !firstLine.includes(' ') && firstLine.length > 0 && lines.length > 1;
          const lang = hasLang ? firstLine : '';
          const code = (hasLang ? lines.slice(1) : lines).join('\n');

          return (
            <div
              key={idx}
              style={{
                borderRadius: '8px',
                background: '#070b14',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                overflow: 'hidden',
                margin: '4px 0',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '5px 10px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                  fontSize: '11px',
                  color: '#64748b',
                  fontFamily: 'monospace',
                }}
              >
                <span>{lang || 'code'}</span>
                <CopyButton text={code} />
              </div>
              <pre
                style={{
                  margin: 0,
                  padding: '10px 12px',
                  fontSize: '12px',
                  lineHeight: '1.45',
                  color: '#e2e8f0',
                  fontFamily: 'Geist Mono, Fira Code, monospace',
                  overflowX: 'auto',
                  whiteSpace: 'pre',
                }}
              >
                {code}
              </pre>
            </div>
          );
        }

        // Paragraphs, headers, and bullet formatting
        const paragraphs = part.split('\n\n').filter(p => p.trim());
        return paragraphs.map((p, pIdx) => {
          const trimmed = p.trim();
          if (trimmed.startsWith('### ')) {
            return (
              <h3 key={`${idx}-${pIdx}`} style={{ fontSize: '14px', fontWeight: 700, color: '#f8fafc', margin: '4px 0 2px 0' }}>
                {trimmed.replace(/^###\s+/, '')}
              </h3>
            );
          }
          if (trimmed.startsWith('## ')) {
            return (
              <h2 key={`${idx}-${pIdx}`} style={{ fontSize: '15px', fontWeight: 700, color: '#f8fafc', margin: '6px 0 2px 0' }}>
                {trimmed.replace(/^##\s+/, '')}
              </h2>
            );
          }
          if (trimmed.startsWith('# ')) {
            return (
              <h1 key={`${idx}-${pIdx}`} style={{ fontSize: '16px', fontWeight: 800, color: '#f8fafc', margin: '8px 0 4px 0' }}>
                {trimmed.replace(/^#\s+/, '')}
              </h1>
            );
          }

          // Format inline bold and code
          const formattedLines = p.split('\n').map((line, lIdx) => {
            const isBullet = line.trim().startsWith('- ') || line.trim().startsWith('* ');
            const lineContent = isBullet ? line.trim().substring(2) : line;

            return (
              <div key={lIdx} style={{ display: isBullet ? 'flex' : 'block', gap: '6px', margin: '2px 0' }}>
                {isBullet && <span style={{ color: '#38bdf8' }}>•</span>}
                <span>
                  {lineContent.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((chunk, cIdx) => {
                    if (chunk.startsWith('`') && chunk.endsWith('`')) {
                      return (
                        <code
                          key={cIdx}
                          style={{
                            background: 'rgba(255, 255, 255, 0.08)',
                            padding: '1px 5px',
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontFamily: 'Geist Mono, monospace',
                            color: '#38bdf8',
                          }}
                        >
                          {chunk.slice(1, -1)}
                        </code>
                      );
                    }
                    if (chunk.startsWith('**') && chunk.endsWith('**')) {
                      return (
                        <strong key={cIdx} style={{ fontWeight: 700, color: '#f8fafc' }}>
                          {chunk.slice(2, -2)}
                        </strong>
                      );
                    }
                    return chunk;
                  })}
                </span>
              </div>
            );
          });

          return (
            <div key={`${idx}-${pIdx}`} style={{ fontSize: '13px', lineHeight: '1.6', color: '#cbd5e1' }}>
              {formattedLines}
            </div>
          );
        });
      })}
    </div>
  );
}

// --- Main App Component ---
export default function App() {
  const [host, setHost] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('host') || localStorage.getItem('agy_host') || window.location.hostname || '127.0.0.1';
  });
  const [port, setPort] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('port') || localStorage.getItem('agy_port') || '4040';
  });

  const [connected, setConnected] = useState<boolean>(false);
  const [workspaces, setWorkspaces] = useState<WorkspaceState[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>('');
  const [pendingApprovals, setPendingApprovals] = useState<ApprovalRequest[]>([]);
  const [interceptInput, setInterceptInput] = useState<{ [reqId: string]: string }>({});
  const [showInterceptBox, setShowInterceptBox] = useState<{ [reqId: string]: boolean }>({});
  const [selectedOptions, setSelectedOptions] = useState<{ [reqId: string]: number }>({});
  const [option4Inputs, setOption4Inputs] = useState<{ [reqId: string]: string }>({});
  const [showFileChanges, setShowFileChanges] = useState<{ [reqId: string]: boolean }>({});
  const [promptText, setPromptText] = useState<string>('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => {
    try {
      const cached = localStorage.getItem('agy_cached_chat');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [companionMode, setCompanionMode] = useState<'desk' | 'remote'>('remote');
  const [customHost, setCustomHost] = useState(host);
  const [customPort, setCustomPort] = useState(port);

  const wsRef = useRef<WebSocket | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (chatMessages.length > 0) {
      try {
        localStorage.setItem('agy_cached_chat', JSON.stringify(chatMessages.slice(-60)));
      } catch {}
    }
  }, [chatMessages]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isStreaming]);

  useEffect(() => {
    localStorage.setItem('agy_host', host);
    localStorage.setItem('agy_port', port);

    const isHttps = window.location.protocol === 'https:';
    let wsUrl: string;
    if (isHttps) {
      // Behind Cloudflare or HTTPS reverse proxy: use WSS on same host
      wsUrl = `wss://${window.location.host}`;
    } else {
      wsUrl = `ws://${host}:${port || '4040'}`;
    }

    let socket: WebSocket;

    try {
      socket = new WebSocket(wsUrl);
      wsRef.current = socket;
    } catch (e) {
      console.error('[Companion] Socket connection failed:', e);
      return;
    }

    socket.onopen = () => {
      setConnected(true);
      triggerHaptic(60);
      const hello: WsClientMessage = {
        type: 'client:hello',
        deviceId: 'companion-mobile-client',
        name: navigator.userAgent.includes('Android') ? 'Android Phone' : 'Mobile Web',
      };
      socket.send(JSON.stringify(hello));
    };

    socket.onmessage = event => {
      try {
        const msg = JSON.parse(event.data) as WsServerMessage;
        switch (msg.type) {
          case 'server:hello':
            setWorkspaces(msg.workspaces);
            if (msg.workspaces.length > 0 && !activeWorkspaceId) {
              setActiveWorkspaceId(msg.workspaces[0].id);
            }
            if (msg.history && msg.history.length > 0) {
              setChatMessages(msg.history);
            }
            if (msg.mode) {
              setCompanionMode(msg.mode);
            }
            const initialApprovals = msg.workspaces.flatMap(w => w.pendingApprovals || []);
            setPendingApprovals(initialApprovals);
            if (initialApprovals.length > 0) triggerHaptic([200, 100, 200]);
            break;

          case 'server:mode_updated':
            setCompanionMode(msg.mode);
            triggerHaptic(40);
            break;

          case 'server:history':
            if (msg.messages && msg.messages.length > 0) {
              setChatMessages(msg.messages);
            }
            break;

          case 'server:workspaces_updated':
            setWorkspaces(msg.workspaces);
            const allApprovals = msg.workspaces.flatMap(w => w.pendingApprovals || []);
            setPendingApprovals(allApprovals);
            break;

          case 'server:approval_requested':
            setPendingApprovals(prev => {
              if (prev.some(r => r.id === msg.request.id)) return prev;
              return [...prev, msg.request];
            });
            triggerHaptic([200, 100, 200, 100, 300]);
            break;

          case 'server:approval_resolved':
            setPendingApprovals(prev => prev.filter(r => r.id !== msg.requestId));
            triggerHaptic(40);
            break;

          case 'server:chat_message':
            setIsStreaming(false);
            setChatMessages(prev => {
              const filtered = prev.filter(m => m.id !== 'streaming_active' && m.id !== msg.message.id);
              return [...filtered, msg.message];
            });
            break;

          case 'server:stream_token':
            setIsStreaming(true);
            setChatMessages(prev => {
              const activeIndex = prev.findIndex(m => m.id === 'streaming_active');
              if (activeIndex !== -1) {
                const updated = [...prev];
                updated[activeIndex] = {
                  ...updated[activeIndex],
                  content: updated[activeIndex].content + msg.token,
                };
                return updated;
              } else {
                return [
                  ...prev,
                  {
                    id: 'streaming_active',
                    role: 'assistant',
                    content: msg.token,
                    timestamp: Date.now(),
                  },
                ];
              }
            });
            break;
        }
      } catch (err) {
        console.error('[Companion] Message error:', err);
      }
    };

    socket.onclose = () => {
      setConnected(false);
      wsRef.current = null;
    };

    socket.onerror = () => {
      setConnected(false);
    };

    return () => {
      socket.close();
    };
  }, [host, port]);

  const sendDecision = (
    requestId: string,
    decision: 'allow' | 'deny',
    selectedOption: number = 1,
    customText: string = ''
  ) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    triggerHaptic(50);

    const payload: WsClientMessage = {
      type: 'client:respond_approval',
      payload: {
        requestId,
        decision,
        selectedOption,
        reason: selectedOption === 4 ? customText : (decision === 'deny' ? 'Skipped by user' : undefined),
        interceptPrompt: customText,
      },
    };

    wsRef.current.send(JSON.stringify(payload));
    setPendingApprovals(prev => prev.filter(r => r.id !== requestId));
  };

  const sendPrompt = () => {
    const text = promptText.trim();
    if (!text || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    triggerHaptic(40);

    const wsMsg: WsClientMessage = {
      type: 'client:send_prompt',
      workspaceId: activeWorkspaceId,
      prompt: text,
    };

    wsRef.current.send(JSON.stringify(wsMsg));
    setPromptText('');
  };

  const toggleMode = (newMode: 'desk' | 'remote') => {
    setCompanionMode(newMode);
    triggerHaptic(40);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'client:set_mode', mode: newMode }));
    }
    fetch(`http://${host}:${port}/api/mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: newMode }),
    }).catch(() => {});
  };

  const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId) || workspaces[0];

  return (
    <div
      style={{
        maxWidth: '680px',
        margin: '0 auto',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: '#141416',
        color: '#f4f4f5',
        position: 'relative',
        paddingBottom: '115px',
      }}
    >
      {/* Exact Desktop IDE Top Bar */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          background: '#18181b',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          padding: '10px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '14px', fontWeight: 600, color: '#f4f4f5', letterSpacing: '-0.01em' }}>
            {activeWorkspace ? activeWorkspace.name : 'Session Crash and Recovery'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Desk / Remote Mode Pill */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              background: '#090d16',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '7px',
              padding: '2px',
              gap: '2px',
            }}
          >
            <button
              onClick={() => toggleMode('desk')}
              title="Desk Mode: Approvals appear directly in PC IDE terminal (zero phone blocking)"
              style={{
                border: 'none',
                borderRadius: '5px',
                padding: '3px 7px',
                background: companionMode === 'desk' ? '#2563eb' : 'transparent',
                color: companionMode === 'desk' ? '#ffffff' : '#71717a',
                fontSize: '11px',
                fontWeight: companionMode === 'desk' ? 600 : 500,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                transition: 'all 0.15s ease',
              }}
            >
              <Laptop size={12} />
              <span>Desk</span>
            </button>
            <button
              onClick={() => toggleMode('remote')}
              title="Remote Mode: Approvals pushed to Phone (1-tap approve away from PC)"
              style={{
                border: 'none',
                borderRadius: '5px',
                padding: '3px 7px',
                background: companionMode === 'remote' ? '#10b981' : 'transparent',
                color: companionMode === 'remote' ? '#ffffff' : '#71717a',
                fontSize: '11px',
                fontWeight: companionMode === 'remote' ? 600 : 500,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                transition: 'all 0.15s ease',
              }}
            >
              <Smartphone size={12} />
              <span>Remote</span>
            </button>
          </div>

          {/* New Chat (+) */}
          <button
            onClick={() => {
              if (confirm('Start a new session?')) {
                setChatMessages([]);
                localStorage.removeItem('agy_cached_chat');
              }
            }}
            title="New Chat"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#a1a1aa',
              cursor: 'pointer',
              padding: '2px',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <Plus size={16} />
          </button>

          {/* History */}
          <button
            onClick={() => alert('Recent conversations tracked via Antigravity session watcher')}
            title="History"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#a1a1aa',
              cursor: 'pointer',
              padding: '2px',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <History size={16} />
          </button>

          {/* Options Menu (...) */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            title="Settings"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#a1a1aa',
              cursor: 'pointer',
              padding: '2px',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <MoreHorizontal size={16} />
          </button>

          {/* Connected Dot */}
          <span
            title={connected ? 'PC Online' : 'Offline'}
            style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              background: connected ? '#10b981' : '#ef4444',
              boxShadow: connected ? '0 0 6px #10b981' : 'none',
            }}
          />
        </div>
      </header>

      {/* Settings Modal */}
      {showSettings && (
        <div
          style={{
            margin: '12px 16px',
            background: '#111827',
            padding: '16px',
            borderRadius: '12px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <h3 style={{ fontSize: '13px', fontWeight: 600, color: '#94a3b8', margin: 0 }}>Connection Settings</h3>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={customHost}
              onChange={e => setCustomHost(e.target.value)}
              placeholder="Host (e.g. 192.168.1.37)"
              style={{
                flex: 3,
                padding: '9px 12px',
                borderRadius: '8px',
                background: '#090d16',
                border: '1px solid #334155',
                color: '#fff',
                fontSize: '13px',
              }}
            />
            <input
              type="text"
              value={customPort}
              onChange={e => setCustomPort(e.target.value)}
              placeholder="Port"
              style={{
                flex: 1,
                padding: '9px 12px',
                borderRadius: '8px',
                background: '#090d16',
                border: '1px solid #334155',
                color: '#fff',
                fontSize: '13px',
              }}
            />
          </div>
          <button
            onClick={() => {
              setHost(customHost);
              setPort(customPort);
              setShowSettings(false);
            }}
            style={{
              padding: '9px',
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            Reconnect
          </button>
        </div>
      )}

      {/* Workspace Tabs (if multiple) */}
      {workspaces.length > 1 && (
        <div
          style={{
            display: 'flex',
            gap: '8px',
            overflowX: 'auto',
            padding: '8px 16px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
          }}
        >
          {workspaces.map(w => (
            <button
              key={w.id}
              onClick={() => setActiveWorkspaceId(w.id)}
              style={{
                padding: '5px 12px',
                borderRadius: '8px',
                background: w.id === activeWorkspace?.id ? '#1e293b' : 'transparent',
                color: w.id === activeWorkspace?.id ? '#f8fafc' : '#94a3b8',
                border: `1px solid ${w.id === activeWorkspace?.id ? 'rgba(255, 255, 255, 0.15)' : 'transparent'}`,
                fontSize: '12px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              <Folder size={12} />
              <span>{w.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Main Content Area */}
      <main style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {/* Desk Mode Banner */}
        {companionMode === 'desk' && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              borderRadius: '10px',
              background: 'rgba(37, 99, 235, 0.08)',
              border: '1px solid rgba(59, 130, 246, 0.25)',
              fontSize: '12.5px',
              color: '#93c5fd',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Laptop size={15} style={{ color: '#60a5fa' }} />
              <span><strong>Desk Mode:</strong> Approvals appear directly on your PC IDE.</span>
            </div>
            <button
              onClick={() => toggleMode('remote')}
              style={{
                background: 'rgba(37, 99, 235, 0.25)',
                border: '1px solid rgba(59, 130, 246, 0.4)',
                borderRadius: '6px',
                color: '#ffffff',
                padding: '4px 10px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              Switch to Remote
            </button>
          </div>
        )}

        {/* Live Conversation Stream */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {chatMessages.length === 0 && pendingApprovals.length === 0 && (
            <div
              style={{
                background: '#0f172a',
                padding: '40px 20px',
                borderRadius: '16px',
                textAlign: 'center',
                border: '1px dashed rgba(255, 255, 255, 0.1)',
                marginTop: '40px',
              }}
            >
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '12px',
                  background: 'rgba(37, 99, 235, 0.15)',
                  color: '#60a5fa',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 12px auto',
                }}
              >
                <Terminal size={24} />
              </div>
              <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#f8fafc', margin: 0 }}>
                Companion Online
              </h3>
              <p style={{ fontSize: '12px', color: '#64748b', marginTop: '6px', maxWidth: '300px', margin: '6px auto 0' }}>
                Text below to send prompts directly to your IDE session. Tool approvals will appear here in real-time.
              </p>
            </div>
          )}

          {chatMessages.map(msg => {
            // Case 1: Tool execution pill (clean & compact)
            if (msg.role === 'tool' || msg.toolCall) {
              return (
                <ToolCallPill
                  key={msg.id}
                  toolCall={msg.toolCall}
                  summary={msg.content}
                />
              );
            }

            // Case 2: User message (Exact Desktop IDE pill)
            if (msg.role === 'user') {
              return (
                <div
                  key={msg.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    margin: '6px 0',
                  }}
                >
                  <div
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '12px',
                      background: '#27272a',
                      color: '#f4f4f5',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      fontSize: '13.5px',
                      lineHeight: '1.5',
                      userSelect: 'text',
                    }}
                  >
                    {msg.content}
                  </div>
                </div>
              );
            }

            // Case 3: Assistant response (Clean stream directly on canvas)
            return (
              <div
                key={msg.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: '4px',
                  margin: '4px 0',
                  width: '100%',
                }}
              >
                {/* Collapsible Thinking Accordion */}
                {msg.thought && <ThinkingAccordion thought={msg.thought} />}

                {/* Formatted Markdown Body */}
                <div style={{ color: '#e4e4e7', fontSize: '13.5px', lineHeight: '1.6', width: '100%' }}>
                  <FormattedMessage text={msg.content} />
                </div>

                {/* Streaming token cursor */}
                {msg.id === 'streaming_active' && (
                  <span
                    style={{
                      display: 'inline-block',
                      width: '6px',
                      height: '14px',
                      background: '#38bdf8',
                      marginLeft: '4px',
                      verticalAlign: 'middle',
                      animation: 'pulse 1s infinite',
                    }}
                  />
                )}
              </div>
            );
          })}

          {/* Waiting for user input indicator (Exact Desktop IDE) */}
          {pendingApprovals.length > 0 && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                color: '#71717a',
                fontSize: '13px',
                margin: '6px 0 2px 2px',
                userSelect: 'none',
              }}
            >
              <span>Waiting for user input..</span>
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: '#38bdf8',
                  animation: 'pulse 1.5s infinite',
                }}
              />
            </div>
          )}

          <div ref={chatBottomRef} />
        </section>
      </main>

      {/* FLOATING PERMISSION GATE (Desktop IDE Question & File Changes Mirror) */}
      {pendingApprovals.length > 0 && (
        <aside
          style={{
            position: 'fixed',
            bottom: '76px',
            left: '12px',
            right: '12px',
            maxWidth: '616px',
            margin: '0 auto',
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          {pendingApprovals.map(req => {
            const cmd = req.toolCall?.args?.CommandLine;
            // Truncate long commands (e.g. shell here-docs) for display only
            const cmdShort = cmd && cmd.length > 120 ? cmd.slice(0, 117) + '...' : cmd;
            const cmdLabel = cmd && cmd.length > 40 ? cmd.slice(0, 37) + '...' : cmd;
            const currentOpt = selectedOptions[req.id] || 1;
            const hasFiles = req.gitChanges && req.gitChanges.length > 0;
            const isFilesOpen = showFileChanges[req.id] !== false; // open by default

            return (
              <div
                key={req.id}
                style={{
                  background: '#161a23',
                  borderRadius: '14px',
                  padding: '14px 16px',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  boxShadow: '0 16px 40px rgba(0, 0, 0, 0.85), 0 0 20px rgba(37, 99, 235, 0.15)',
                  backdropFilter: 'blur(16px)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                {/* 1. Files With Changes Drawer Header */}
                {hasFiles && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingBottom: '6px',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                      }}
                    >
                      <div
                        onClick={() => setShowFileChanges(prev => ({ ...prev, [req.id]: !isFilesOpen }))}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
                      >
                        <ChevronDown
                          size={14}
                          color="#94a3b8"
                          style={{
                            transform: isFilesOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
                            transition: 'transform 0.15s ease',
                          }}
                        />
                        <FileCode size={14} color="#94a3b8" />
                        <span style={{ fontSize: '12px', fontWeight: 600, color: '#f1f5f9' }}>
                          {req.gitChanges!.length} Files With Changes
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '11px' }}>
                        <span style={{ color: '#94a3b8', cursor: 'pointer' }}>Reject all</span>
                        <span style={{ color: '#38bdf8', fontWeight: 600, cursor: 'pointer' }}>Accept all</span>
                      </div>
                    </div>

                    {isFilesOpen && (
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '4px',
                          background: 'rgba(0, 0, 0, 0.3)',
                          borderRadius: '6px',
                          padding: '6px 8px',
                          maxHeight: '110px',
                          overflowY: 'auto',
                        }}
                      >
                        {req.gitChanges!.map((change: GitFileChange) => (
                          <div
                            key={change.file}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              fontSize: '11px',
                              fontFamily: 'Geist Mono, monospace',
                            }}
                          >
                            <span style={{ color: '#22c55e', fontWeight: 700 }}>+{change.insertions}</span>
                            <span style={{ color: '#ef4444', fontWeight: 700 }}>-{change.deletions}</span>
                            <span style={{ color: '#f8fafc', fontWeight: 600 }}>{change.file}</span>
                            <span
                              style={{
                                color: '#64748b',
                                fontSize: '10px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {change.relativePath}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* 2. Dialog Header: [?] Allow <Title>? */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div
                    style={{
                      width: '22px',
                      height: '22px',
                      borderRadius: '5px',
                      background: 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#94a3b8',
                      fontSize: '12px',
                      fontWeight: 700,
                    }}
                  >
                    ?
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {req.toolTitle || `Allow running ${cmdLabel || req.toolCall?.name}?`}
                  </span>
                </div>

                {/* 3. Command Box */}
                {cmd && (
                  <div
                    style={{
                      background: '#0a0d14',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      fontFamily: 'Geist Mono, monospace',
                      fontSize: '12px',
                      color: '#cbd5e1',
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: '8px',
                    }}
                  >
                    <span style={{ wordBreak: 'break-word', overflow: 'hidden', maxHeight: '60px', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>{cmd}</span>
                    <CopyButton text={cmd} />
                  </div>
                )}

                {/* 4. Numbered Options (Desktop IDE Mirror) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  {[
                    { id: 1, label: 'Yes, allow this time' },
                    { id: 2, label: `Yes, and always allow '${cmdLabel || req.toolCall?.name}' in this conversation` },
                    { id: 3, label: `Yes, and always allow '${cmdLabel || req.toolCall?.name}'` },
                    { id: 4, label: 'No (tell the agent what to do instead)' },
                  ].map(opt => {
                    const isSelected = currentOpt === opt.id;
                    return (
                      <div
                        key={opt.id}
                        onClick={() => {
                          setSelectedOptions(prev => ({ ...prev, [req.id]: opt.id }));
                          triggerHaptic(30);
                        }}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px',
                          padding: '8px 10px',
                          borderRadius: '6px',
                          background: isSelected ? '#252d3d' : 'rgba(255, 255, 255, 0.03)',
                          border: isSelected ? '1px solid #3b82f6' : '1px solid rgba(255, 255, 255, 0.05)',
                          cursor: 'pointer',
                          transition: 'all 0.12s ease',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                          <span
                            style={{
                              fontSize: '12px',
                              fontFamily: 'monospace',
                              color: isSelected ? '#60a5fa' : '#64748b',
                              fontWeight: 700,
                              marginTop: '1px',
                            }}
                          >
                            {opt.id}
                          </span>
                          <span
                            style={{
                              fontSize: '12.5px',
                              color: isSelected ? '#ffffff' : '#94a3b8',
                              fontWeight: isSelected ? 600 : 400,
                              lineHeight: 1.35,
                            }}
                          >
                            {opt.label}
                          </span>
                        </div>

                        {/* Input for Option 4 */}
                        {opt.id === 4 && isSelected && (
                          <input
                            type="text"
                            placeholder="Type what to do instead..."
                            value={option4Inputs[req.id] || ''}
                            onChange={e => setOption4Inputs(prev => ({ ...prev, [req.id]: e.target.value }))}
                            onClick={e => e.stopPropagation()}
                            autoFocus
                            style={{
                              marginTop: '2px',
                              padding: '8px 10px',
                              borderRadius: '6px',
                              background: '#090d16',
                              border: '1px solid #3b82f6',
                              color: '#ffffff',
                              fontSize: '12.5px',
                              outline: 'none',
                            }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* 5. Bottom Actions: Skip and Submit */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '10px', marginTop: '2px' }}>
                  <button
                    onClick={() => sendDecision(req.id, 'deny', 0, 'Skipped by user')}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#94a3b8',
                      fontSize: '12.5px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      padding: '6px 10px',
                    }}
                  >
                    Skip
                  </button>

                  <button
                    onClick={() => {
                      const opt = selectedOptions[req.id] || 1;
                      if (opt === 4) {
                        sendDecision(req.id, 'deny', 4, option4Inputs[req.id] || '');
                      } else {
                        sendDecision(req.id, 'allow', opt);
                      }
                    }}
                    style={{
                      background: '#0284c7',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '7px 16px',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      boxShadow: '0 2px 8px rgba(2, 132, 199, 0.4)',
                    }}
                  >
                    <span>Submit</span>
                    <span style={{ fontSize: '11px', opacity: 0.8 }}>↵</span>
                  </button>
                </div>
              </div>
            );
          })}
        </aside>
      )}

      {/* Fixed Thumb-Zone Bottom Input Bar */}
      <footer
        style={{
          position: 'fixed',
          bottom: '24px',
          left: 0,
          right: 0,
          zIndex: 40,
          background: '#141416',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          padding: '8px 12px',
        }}
      >
        <div
          style={{
            maxWidth: '680px',
            margin: '0 auto',
            display: 'flex',
            gap: '8px',
            alignItems: 'center',
          }}
        >
          <input
            type="text"
            placeholder={isStreaming ? 'Agent is working on PC...' : 'Ask a follow up...'}
            value={promptText}
            onChange={e => setPromptText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendPrompt();
              }
            }}
            disabled={!connected || isStreaming}
            style={{
              flex: 1,
              height: '42px',
              padding: '0 14px',
              borderRadius: '8px',
              background: '#18181b',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#f4f4f5',
              fontSize: '13.5px',
              outline: 'none',
            }}
          />

          <button
            onClick={sendPrompt}
            disabled={!connected || isStreaming || !promptText.trim()}
            style={{
              height: '42px',
              width: '42px',
              borderRadius: '8px',
              background: connected && promptText.trim() ? '#2563eb' : 'rgba(255, 255, 255, 0.05)',
              color: connected && promptText.trim() ? '#ffffff' : '#71717a',
              border: 'none',
              cursor: connected && promptText.trim() ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease',
            }}
          >
            <Send size={15} />
          </button>
        </div>
      </footer>

      {/* Desktop IDE Status Bar */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: '24px',
          background: '#141416',
          borderTop: '1px solid rgba(255, 255, 255, 0.06)',
          zIndex: 45,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px',
          fontSize: '11px',
          color: '#71717a',
          fontFamily: 'monospace',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', gap: '12px' }}>
          <span>Ln 1, Col 1</span>
          <span>Spaces: 4</span>
          <span>UTF-8</span>
          <span>LF</span>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <span>{'{ }'} Markdown</span>
          <span
            onClick={() => setShowSettings(true)}
            style={{ color: '#a1a1aa', cursor: 'pointer' }}
          >
            Antigravity - Settings
          </span>
        </div>
      </div>
    </div>
  );
}
