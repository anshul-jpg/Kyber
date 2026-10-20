import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  Check,
  X,
  ChevronDown,
  ChevronRight,
  Copy,
  CheckCheck,
  Settings,
  Send,
  Folder,
  Plus,
  Laptop,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  Image as ImageIcon,
  Wifi,
  Globe,
  Bell,
} from 'lucide-react';
import { marked } from 'marked';
import {
  dispatchApprovalNotification,
  requestNotificationPermission,
  initNotificationActions,
} from './utils/notifications';

// --- Haptic Feedback Helper ---
const triggerHaptic = (pattern: number | number[] = 30) => {
  if (typeof window !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {}
  }
};

// --- Copy Button ---
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopied(true);
    triggerHaptic(20);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      title="Copy"
      style={{
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '4px',
        color: copied ? '#4ade80' : '#9ca3af',
        padding: '3px 7px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        fontSize: '11px',
        cursor: 'pointer',
      }}
    >
      {copied ? <CheckCheck size={12} /> : <Copy size={12} />}
      <span>{copied ? 'Copied' : 'Copy'}</span>
    </button>
  );
}

// --- High-Fidelity Markdown Formatter (Anti-Clipping & Clean Typography) ---
function MarkdownContent({ content }: { content: string }) {
  const html = useMemo(() => {
    try {
      return marked.parse(content, { gfm: true, breaks: true }) as string;
    } catch {
      return content;
    }
  }, [content]);

  return (
    <div
      className="prose-antigravity"
      dangerouslySetInnerHTML={{ __html: html }}
      style={{
        color: '#e2e8f0',
        fontSize: '13.5px',
        lineHeight: '1.6',
        wordBreak: 'break-word',
        overflowWrap: 'anywhere',
      }}
    />
  );
}

// --- Activity Row (Matches Antigravity IDE Screenshot) ---
function ActivityRow({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: any;
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxWidth: '100%', minWidth: 0, width: '100%', boxSizing: 'border-box' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          background: '#222222',
          border: '1px solid #2e2e2e',
          borderRadius: '6px',
          padding: '6px 10px',
          display: 'flex',
          alignItems: 'center',
          gap: '7px',
          fontSize: '12px',
          color: '#a1a1aa',
          cursor: 'pointer',
          textAlign: 'left',
          width: 'fit-content',
          maxWidth: '100%',
          minWidth: 0,
          boxSizing: 'border-box',
        }}
      >
        <Icon size={13} color="#9ca3af" style={{ flexShrink: 0 }} />
        <span style={{ fontWeight: 500, color: '#e2e8f0', flexShrink: 0 }}>{title}</span>
        {subtitle && (
          <span
            style={{
              color: '#71717a',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: '220px',
              minWidth: 0,
            }}
          >
            {subtitle}
          </span>
        )}
        <ChevronRight
          size={12}
          color="#71717a"
          style={{
            transform: open ? 'rotate(90deg)' : 'none',
            transition: 'transform 0.15s ease',
            marginLeft: 'auto',
            flexShrink: 0,
          }}
        />
      </button>

      {open && children && (
        <div
          style={{
            background: '#141414',
            border: '1px solid #2e2e2e',
            borderRadius: '6px',
            padding: '10px 12px',
            fontSize: '12px',
            fontFamily: 'monospace',
            color: '#d4d4d8',
            overflowX: 'auto',
            maxWidth: '100%',
            maxHeight: '260px',
            marginTop: '2px',
            boxSizing: 'border-box',
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [host, setHost] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search);
      const urlHost = p.get('host');
      if (urlHost) return urlHost;
      const saved = localStorage.getItem('agy_host');
      if (saved) return saved;
      // In Capacitor Android, window.location.hostname is localhost, so default to PC Wi-Fi IP
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return '192.168.1.37';
      }
      return window.location.hostname || '192.168.1.37';
    }
    return '192.168.1.37';
  });

  const [port, setPort] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search);
      return p.get('port') || localStorage.getItem('agy_port') || (window.location.port ? window.location.port : '4040');
    }
    return '4040';
  });

  const [connected, setConnected] = useState<boolean>(false);
  const [workspaces, setWorkspaces] = useState<WorkspaceState[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search);
      const wsParam = p.get('ws');
      if (wsParam) {
        try {
          return atob(wsParam);
        } catch {
          return wsParam;
        }
      }
    }
    return '';
  });

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<ApprovalRequest[]>([]);
  const [promptText, setPromptText] = useState<string>('');
  const [selectedOptions, setSelectedOptions] = useState<Record<string, number>>({});
  const [option4Inputs, setOption4Inputs] = useState<Record<string, string>>({});
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [showProjectDrawer, setShowProjectDrawer] = useState<boolean>(false);
  const [newProjectPath, setNewProjectPath] = useState<string>('');
  const [companionMode, setCompanionMode] = useState<'desk' | 'remote'>('remote');
  const [customHost, setCustomHost] = useState(host);
  const [customPort, setCustomPort] = useState(port);
  const [reconnectTick, setReconnectTick] = useState<number>(0);
  const [notificationTestStatus, setNotificationTestStatus] = useState<string>('');

  // Multi-image upload state
  const [attachedImages, setAttachedImages] = useState<{ base64: string; name: string; preview: string }[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId) || workspaces[0];

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isStreaming, pendingApprovals]);

  // Connect WebSocket
  useEffect(() => {
    localStorage.setItem('agy_host', host);
    localStorage.setItem('agy_port', port);

    let wsUrl = '';
    const cleanHost = (host || '').trim().replace(/^https?:\/\//, '').replace(/\/$/, '');

    if (cleanHost.includes('.trycloudflare.com')) {
      wsUrl = `wss://${cleanHost}`;
    } else if (window.location.protocol === 'https:' && window.location.hostname.includes('.trycloudflare.com')) {
      wsUrl = `wss://${window.location.host}`;
    } else {
      // Direct IP / Local LAN connection
      const targetHost = cleanHost || '192.168.1.37';
      wsUrl = `ws://${targetHost}:${port || '4040'}`;
    }

    console.log('[Companion] Connecting to:', wsUrl);

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
      triggerHaptic(40);
      const hello: WsClientMessage = {
        type: 'client:hello',
        deviceId: 'companion-client',
        name: navigator.userAgent.includes('Android') ? 'Android APK' : 'Mobile Web',
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
            break;

          case 'server:mode_updated':
            setCompanionMode(msg.mode);
            triggerHaptic(30);
            break;

          case 'server:history':
            if (msg.messages && msg.messages.length > 0) {
              setChatMessages(msg.messages);
            }
            break;

          case 'server:workspaces_updated':
            setWorkspaces(msg.workspaces);
            setPendingApprovals(msg.workspaces.flatMap(w => w.pendingApprovals || []));
            break;

          case 'server:approval_requested':
            setPendingApprovals(prev => {
              if (prev.some(r => r.id === msg.request.id)) return prev;
              return [...prev, msg.request];
            });
            triggerHaptic([200, 100, 200]);
            dispatchApprovalNotification(
              msg.request.toolCall?.name || 'Tool Approval',
              msg.request.toolCall?.args?.CommandLine || JSON.stringify(msg.request.toolCall?.args || {}),
              msg.request.id
            );
            break;

          case 'server:approval_resolved':
            setPendingApprovals(prev => prev.filter(r => r.id !== msg.requestId));
            triggerHaptic(30);
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
      // Auto-reconnect after 2 seconds on mobile connection drop
      setTimeout(() => {
        setReconnectTick(t => t + 1);
      }, 2000);
    };

    socket.onerror = () => {
      setConnected(false);
      try {
        socket.close();
      } catch {}
    };

    // Keep-alive heartbeat: ping daemon every 15s to keep mobile connection awake
    const pingInterval = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'client:ping' }));
      }
    }, 15000);

    // Auto-reconnect when device comes back online or screen is unlocked
    const handleWake = () => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        setReconnectTick(t => t + 1);
      }
    };
    window.addEventListener('online', handleWake);
    document.addEventListener('visibilitychange', handleWake);

    return () => {
      clearInterval(pingInterval);
      window.removeEventListener('online', handleWake);
      document.removeEventListener('visibilitychange', handleWake);
      socket.close();
    };
  }, [host, port, reconnectTick]);

  // Send approval decision
  const sendDecision = (
    requestId: string,
    decision: 'allow' | 'deny',
    selectedOption: number = 1,
    customText: string = ''
  ) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    triggerHaptic(40);

    const payload: WsClientMessage = {
      type: 'client:respond_approval',
      payload: {
        requestId,
        decision,
        selectedOption,
        reason: selectedOption === 4 ? customText : decision === 'deny' ? 'Skipped by user' : undefined,
        interceptPrompt: customText,
      },
    };

    wsRef.current.send(JSON.stringify(payload));
    setPendingApprovals(prev => prev.filter(r => r.id !== requestId));
  };

  // Wire lockscreen & notification action buttons to sendDecision directly
  useEffect(() => {
    initNotificationActions((actionId, reqId) => {
      if (reqId) {
        if (actionId === 'approve') {
          sendDecision(reqId, 'allow', 1);
        } else if (actionId === 'deny') {
          sendDecision(reqId, 'deny', 0, 'Rejected from notification');
        }
      }
    });
    requestNotificationPermission();
  }, []);

  // Multi-image selection handler
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        const res = reader.result as string;
        const base64 = res.includes(',') ? res.split(',')[1] : res;
        setAttachedImages(prev => [
          ...prev,
          {
            base64,
            name: file.name,
            preview: res,
          },
        ]);
        triggerHaptic(20);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  // Send user prompt (with multiple images support)
  const sendPrompt = () => {
    const text = promptText.trim();
    if (!text && attachedImages.length === 0) return;
    if (isStreaming) return;

    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      alert('Connecting to companion daemon... Please try again in 1-2 seconds.');
      setReconnectTick(t => t + 1);
      return;
    }
    triggerHaptic(30);

    const wsMsg: WsClientMessage = {
      type: 'client:send_prompt',
      workspaceId: activeWorkspaceId,
      prompt: text || (attachedImages.length > 0 ? 'Attached photos from mobile companion' : ''),
      images: attachedImages.map(img => ({ base64: img.base64, name: img.name })),
      imageBase64: attachedImages[0]?.base64,
      imageName: attachedImages[0]?.name,
    };

    wsRef.current.send(JSON.stringify(wsMsg));
    setPromptText('');
    setAttachedImages([]);
  };

  // Switch Desk/Remote mode
  const toggleMode = (newMode: 'desk' | 'remote') => {
    setCompanionMode(newMode);
    triggerHaptic(30);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'client:set_mode',
          mode: newMode,
        })
      );
    }
  };

  const switchWorkspace = (wsId: string) => {
    setActiveWorkspaceId(wsId);
    triggerHaptic(30);
    setShowProjectDrawer(false);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'client:switch_workspace',
          workspaceId: wsId,
        })
      );
    }
  };

  const registerNewWorkspace = (dirPath: string) => {
    if (!dirPath.trim()) return;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'client:register_workspace',
          path: dirPath.trim(),
        })
      );
      setNewProjectPath('');
      triggerHaptic(30);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        background: '#181818',
        color: '#e2e8f0',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Global CSS for Markdown & Typography */}
      <style>{`
        .prose-antigravity h1, .prose-antigravity h2, .prose-antigravity h3, .prose-antigravity h4 {
          color: #f8fafc;
          font-weight: 700;
          margin: 12px 0 6px 0;
          line-height: 1.35;
        }
        .prose-antigravity h1 { font-size: 17px; }
        .prose-antigravity h2 { font-size: 15.5px; }
        .prose-antigravity h3 { font-size: 14.5px; }
        .prose-antigravity p {
          margin: 6px 0;
        }
        .prose-antigravity ul, .prose-antigravity ol {
          padding-left: 18px;
          margin: 6px 0;
        }
        .prose-antigravity li {
          margin: 3px 0;
        }
        .prose-antigravity strong {
          color: #ffffff;
          font-weight: 600;
        }
        .prose-antigravity code:not(pre code) {
          background: #27272a;
          color: #f4f4f5;
          padding: 2px 5px;
          border-radius: 4px;
          font-family: monospace;
          font-size: 12px;
          border: 1px solid rgba(255, 255, 255, 0.08);
        }
        .prose-antigravity pre {
          background: #141414;
          border: 1px solid #2e2e2e;
          border-radius: 6px;
          padding: 10px 12px;
          overflow-x: auto;
          margin: 8px 0;
        }
        .prose-antigravity pre code {
          color: #d4d4d8;
          font-family: monospace;
          font-size: 12px;
        }
        .prose-antigravity hr {
          border: none;
          border-top: 1px solid #2e2e2e;
          margin: 14px 0;
        }
        .prose-antigravity a {
          color: #38bdf8;
          text-decoration: none;
        }
        .prose-antigravity a:hover {
          text-decoration: underline;
        }
      `}</style>

      {/* --- Top Navigation Header (Safe-Area Aware & Ergonomic) --- */}
      <header
        style={{
          background: '#141414',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: 'max(env(safe-area-inset-top, 0px), 8px)',
          paddingBottom: '8px',
          paddingLeft: 'max(14px, env(safe-area-inset-left, 0px))',
          paddingRight: 'max(14px, env(safe-area-inset-right, 0px))',
          minHeight: 'calc(52px + max(env(safe-area-inset-top, 0px), 0px))',
          boxSizing: 'border-box',
          zIndex: 30,
          flexShrink: 0,
          width: '100%',
        }}
      >
        {/* Workspace Selector Button with Live Status Dot */}
        <button
          onClick={() => {
            setShowProjectDrawer(true);
            triggerHaptic(20);
          }}
          style={{
            background: '#1e1e1e',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '8px',
            color: '#f1f5f9',
            padding: '6px 11px',
            display: 'flex',
            alignItems: 'center',
            gap: '7px',
            fontSize: '12.5px',
            fontWeight: 600,
            cursor: 'pointer',
            maxWidth: '155px',
            minHeight: '36px',
            boxSizing: 'border-box',
          }}
        >
          <span
            style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              background: connected ? '#10b981' : '#f59e0b',
              boxShadow: connected ? '0 0 6px rgba(16, 185, 129, 0.4)' : 'none',
              flexShrink: 0,
            }}
          />
          <Folder size={13} color="#94a3b8" style={{ flexShrink: 0 }} />
          <span
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {activeWorkspace ? activeWorkspace.name : 'Workspace'}
          </span>
          <ChevronDown size={12} color="#64748b" style={{ flexShrink: 0 }} />
        </button>

        {/* Right Actions: Compact Mode Switcher + Settings */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Quick-Flip Mode Button (Space-Efficient for Mobile) */}
          <button
            onClick={() => toggleMode(companionMode === 'remote' ? 'desk' : 'remote')}
            title={`Active: ${companionMode === 'remote' ? 'Remote Mode (Phone Priority)' : 'Desk Mode (PC Priority)'}. Tap to switch.`}
            style={{
              background: companionMode === 'remote' ? '#007acc' : '#1e1e1e',
              border: `1px solid ${companionMode === 'remote' ? '#38bdf8' : 'rgba(255, 255, 255, 0.1)'}`,
              color: '#ffffff',
              borderRadius: '8px',
              padding: '6px 11px',
              minHeight: '36px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxSizing: 'border-box',
            }}
          >
            {companionMode === 'remote' ? <Smartphone size={13} /> : <Laptop size={13} />}
            <span>{companionMode === 'remote' ? 'Remote' : 'Desk'}</span>
          </button>

          <button
            onClick={() => {
              setShowSettings(true);
              triggerHaptic(20);
            }}
            style={{
              background: '#1e1e1e',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '8px',
              color: '#94a3b8',
              width: '36px',
              height: '36px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxSizing: 'border-box',
            }}
          >
            <Settings size={15} />
          </button>
        </div>
      </header>

      {/* --- Workspace Drawer (Slide-Over) --- */}
      {showProjectDrawer && (
        <div
          onClick={() => setShowProjectDrawer(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            justifyContent: 'flex-start',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '85%',
              maxWidth: '320px',
              height: '100%',
              background: '#1e1e1e',
              borderRight: '1px solid #2e2e2e',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '8px 0 24px rgba(0,0,0,0.5)',
            }}
          >
            <div
              style={{
                padding: '14px 16px',
                borderBottom: '1px solid #2e2e2e',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#ededed' }}>Workspaces</span>
              <button
                onClick={() => setShowProjectDrawer(false)}
                style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {workspaces.map(ws => {
                  const isActive = ws.id === (activeWorkspace?.id || activeWorkspaceId);
                  return (
                    <div
                      key={ws.id}
                      onClick={() => switchWorkspace(ws.id)}
                      style={{
                        padding: '10px 12px',
                        borderRadius: '6px',
                        background: isActive ? '#282828' : 'transparent',
                        border: `1px solid ${isActive ? '#383838' : 'transparent'}`,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Folder size={14} color={isActive ? '#007acc' : '#888'} />
                        <span style={{ fontSize: '13px', fontWeight: isActive ? 600 : 400, color: '#ededed' }}>
                          {ws.name}
                        </span>
                      </div>
                      {isActive && <Check size={14} color="#007acc" />}
                    </div>
                  );
                })}
              </div>

              {/* Add workspace folder */}
              <div style={{ marginTop: '20px', borderTop: '1px solid #2e2e2e', paddingTop: '14px' }}>
                <div style={{ fontSize: '11px', color: '#888', marginBottom: '8px', fontWeight: 600 }}>
                  Add Workspace Folder
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input
                    type="text"
                    value={newProjectPath}
                    onChange={e => setNewProjectPath(e.target.value)}
                    placeholder="D:\Path\To\Repo"
                    style={{
                      flex: 1,
                      background: '#141414',
                      border: '1px solid #333',
                      borderRadius: '6px',
                      color: '#ededed',
                      padding: '6px 10px',
                      fontSize: '12px',
                    }}
                  />
                  <button
                    onClick={() => registerNewWorkspace(newProjectPath)}
                    style={{
                      background: '#007acc',
                      border: 'none',
                      borderRadius: '6px',
                      color: '#fff',
                      padding: '6px 10px',
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- Settings Modal --- */}
      {showSettings && (
        <div
          onClick={() => setShowSettings(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 60,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '380px',
              background: '#1e1e1e',
              border: '1px solid #333333',
              borderRadius: '10px',
              padding: '18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#ededed' }}>Connection Settings</span>
              <button
                onClick={() => setShowSettings(false)}
                style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Quick Connection Presets */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontSize: '11px', color: '#888', fontWeight: 600 }}>Quick Presets</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setCustomHost('192.168.1.37');
                    setCustomPort('4040');
                    triggerHaptic(20);
                  }}
                  style={{
                    flex: 1,
                    background: '#242424',
                    border: '1px solid #383838',
                    borderRadius: '6px',
                    padding: '8px 10px',
                    color: '#ededed',
                    fontSize: '11.5px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                  }}
                >
                  <Wifi size={13} color="#10b981" />
                  <span>Local Wi-Fi</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCustomHost('discharge-inserted-predicted-ways.trycloudflare.com');
                    setCustomPort('');
                    triggerHaptic(20);
                  }}
                  style={{
                    flex: 1,
                    background: '#242424',
                    border: '1px solid #383838',
                    borderRadius: '6px',
                    padding: '8px 10px',
                    color: '#ededed',
                    fontSize: '11.5px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                  }}
                >
                  <Globe size={13} color="#007acc" />
                  <span>Cloudflare</span>
                </button>
              </div>
            </div>

            <div>
              <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '4px' }}>
                Server Host / Domain
              </label>
              <input
                type="text"
                value={customHost}
                onChange={e => setCustomHost(e.target.value)}
                placeholder="192.168.1.37 or tunnel-url"
                style={{
                  width: '100%',
                  background: '#141414',
                  border: '1px solid #333',
                  borderRadius: '6px',
                  color: '#ededed',
                  padding: '8px 10px',
                  fontSize: '13px',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '4px' }}>
                Gateway Port (leave empty for Cloudflare)
              </label>
              <input
                type="text"
                value={customPort}
                onChange={e => setCustomPort(e.target.value)}
                placeholder="4040"
                style={{
                  width: '100%',
                  background: '#141414',
                  border: '1px solid #333',
                  borderRadius: '6px',
                  color: '#ededed',
                  padding: '8px 10px',
                  fontSize: '13px',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Test Notification Button */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ fontSize: '11px', color: '#888', fontWeight: 600 }}>Notifications & Lockscreen Alerts</div>
              <button
                type="button"
                onClick={async () => {
                  triggerHaptic([100, 50, 100]);
                  await requestNotificationPermission();
                  await dispatchApprovalNotification(
                    'run_command',
                    'powershell -Command "git status" (Test Lockscreen Action)',
                    'test_req_' + Date.now()
                  );
                  setNotificationTestStatus('Notification sent! Check your notification drawer / lockscreen.');
                  setTimeout(() => setNotificationTestStatus(''), 4000);
                }}
                style={{
                  background: '#242424',
                  border: '1px solid #383838',
                  borderRadius: '6px',
                  padding: '9px 12px',
                  color: '#ededed',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                <Bell size={14} color="#f59e0b" />
                <span>Test Phone Notification</span>
              </button>
              {notificationTestStatus && (
                <div style={{ fontSize: '11px', color: '#10b981', textAlign: 'center', marginTop: '2px' }}>
                  {notificationTestStatus}
                </div>
              )}
            </div>

            <button
              onClick={() => {
                setHost(customHost);
                setPort(customPort);
                setShowSettings(false);
                triggerHaptic(30);
              }}
              style={{
                background: '#007acc',
                border: 'none',
                borderRadius: '6px',
                color: '#fff',
                padding: '10px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Save & Reconnect
            </button>
          </div>
        </div>
      )}

      {/* --- Main Chat & Interaction Feed (Generous Padding & Anti-Clipping) --- */}
      <main
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '16px 14px 130px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          maxWidth: '780px',
          width: '100%',
          minWidth: 0,
          boxSizing: 'border-box',
          margin: '0 auto',
        }}
      >
        {/* Remote Mode Status Banner */}
        {companionMode === 'remote' ? (
          <div
            style={{
              background: '#222222',
              border: '1px solid #2e2e2e',
              borderRadius: '6px',
              padding: '8px 12px',
              fontSize: '12px',
              color: '#a1a1aa',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Smartphone size={13} color="#007acc" />
              <span>
                <strong style={{ color: '#ededed' }}>Remote Priority:</strong> Tool approvals prompt directly on phone.
              </span>
            </div>
            <button
              onClick={() => toggleMode('desk')}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#007acc',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Desk
            </button>
          </div>
        ) : (
          <div
            style={{
              background: '#222222',
              border: '1px solid #2e2e2e',
              borderRadius: '6px',
              padding: '8px 12px',
              fontSize: '12px',
              color: '#a1a1aa',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Laptop size={13} color="#888" />
              <span>
                <strong style={{ color: '#ededed' }}>Desk Mode:</strong> Approvals appear directly on your PC IDE.
              </span>
            </div>
            <button
              onClick={() => toggleMode('remote')}
              style={{
                background: '#007acc',
                border: 'none',
                color: '#fff',
                fontSize: '11px',
                fontWeight: 600,
                padding: '3px 8px',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Remote
            </button>
          </div>
        )}

        {/* Disconnected State / 1-Tap Connect */}
        {!connected && (
          <div
            style={{
              background: '#1c1c1c',
              border: '1px solid #333333',
              borderRadius: '10px',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ea580c', flexShrink: 0 }} />
              <span style={{ fontSize: '13.5px', fontWeight: 600, color: '#f8fafc' }}>
                Connecting to PC Companion...
              </span>
            </div>
            <div style={{ fontSize: '12px', color: '#94a3b8', lineHeight: '1.4' }}>
              Choose your connection target below, or tap Settings (⚙️) to customize:
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                type="button"
                onClick={() => {
                  setHost('192.168.1.37');
                  setPort('4040');
                  triggerHaptic(30);
                }}
                style={{
                  background: '#242424',
                  border: '1px solid #383838',
                  borderRadius: '7px',
                  padding: '10px 12px',
                  color: '#ededed',
                  fontSize: '12.5px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Wifi size={14} color="#10b981" />
                  <span>Connect via Local Wi-Fi (192.168.1.37)</span>
                </div>
                <ChevronRight size={13} color="#888" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setHost('discharge-inserted-predicted-ways.trycloudflare.com');
                  setPort('');
                  triggerHaptic(30);
                }}
                style={{
                  background: '#242424',
                  border: '1px solid #383838',
                  borderRadius: '7px',
                  padding: '10px 12px',
                  color: '#ededed',
                  fontSize: '12.5px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Globe size={14} color="#007acc" />
                  <span>Connect via Cloudflare Tunnel (Cellular)</span>
                </div>
                <ChevronRight size={13} color="#888" />
              </button>
            </div>
          </div>
        )}

        {/* Empty State when Connected */}
        {connected && chatMessages.length === 0 && pendingApprovals.length === 0 && (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '40px 20px',
              textAlign: 'center',
              color: '#71717a',
            }}
          >
            <Terminal size={32} color="#444" style={{ marginBottom: '12px' }} />
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#ededed', marginBottom: '4px' }}>
              Antigravity Session Attached
            </div>
            <div style={{ fontSize: '12px', maxWidth: '280px' }}>
              Prompts and tool permission gates in your PC session will mirror here in real time.
            </div>
          </div>
        )}

        {/* Chat History Messages */}
        {chatMessages.map(msg => {
          if (msg.role === 'user') {
            return (
              <div
                key={msg.id}
                style={{
                  alignSelf: 'flex-end',
                  maxWidth: '85%',
                  background: '#282828',
                  border: '1px solid #383838',
                  borderRadius: '12px',
                  padding: '10px 14px',
                  color: '#ededed',
                  fontSize: '13.5px',
                  lineHeight: '1.5',
                  wordBreak: 'break-word',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                {/* Multi-Image Display in Chat Bubble */}
                {msg.images && msg.images.length > 0 ? (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: msg.images.length > 1 ? 'repeat(2, 1fr)' : '1fr',
                      gap: '6px',
                      maxWidth: '100%',
                    }}
                  >
                    {msg.images.map((url, i) => (
                      <img
                        key={i}
                        src={url}
                        alt={`Attachment ${i + 1}`}
                        style={{
                          width: '100%',
                          maxHeight: '180px',
                          borderRadius: '6px',
                          objectFit: 'cover',
                          border: '1px solid #383838',
                        }}
                      />
                    ))}
                  </div>
                ) : msg.imageUrl ? (
                  <img
                    src={msg.imageUrl}
                    alt="Attachment"
                    style={{
                      maxWidth: '100%',
                      maxHeight: '220px',
                      borderRadius: '8px',
                      objectFit: 'cover',
                    }}
                  />
                ) : null}

                {msg.content && <span>{msg.content}</span>}
              </div>
            );
          }

          if (msg.role === 'tool') {
            return (
              <ActivityRow
                key={msg.id}
                icon={Terminal}
                title={msg.toolCall?.name || 'Tool Executed'}
                subtitle={msg.toolCall?.args?.CommandLine ? `Ran ${msg.toolCall.args.CommandLine}` : undefined}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ color: '#888' }}>Result</span>
                  <CopyButton text={typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content, null, 2)} />
                </div>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                  {typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content, null, 2)}
                </pre>
              </ActivityRow>
            );
          }

          // Assistant message with Markdown formatting
          return (
            <div
              key={msg.id}
              style={{
                alignSelf: 'flex-start',
                width: '100%',
                maxWidth: '100%',
                minWidth: 0,
                color: '#e2e8f0',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                padding: '2px 0',
                boxSizing: 'border-box',
                wordBreak: 'break-word',
                overflowWrap: 'anywhere',
              }}
            >
              <MarkdownContent content={msg.content} />
              {msg.id === 'streaming_active' && (
                <span
                  style={{
                    display: 'inline-block',
                    width: '7px',
                    height: '14px',
                    background: '#007acc',
                    marginLeft: '4px',
                    verticalAlign: 'middle',
                  }}
                />
              )}
            </div>
          );
        })}

        {/* --- EXACT 1-TO-1 ANTIGRAVITY PERMISSION GATE --- */}
        {pendingApprovals.map(req => {
          const selected = selectedOptions[req.id] || 1;
          const cmd =
            req.toolCall?.args?.CommandLine ||
            (req.toolCall?.args?.TargetFile ? req.toolCall.args.TargetFile : JSON.stringify(req.toolCall?.args || {}));

          return (
            <div
              key={req.id}
              style={{
                background: '#1e1e1e',
                border: '1px solid #333333',
                borderRadius: '8px',
                padding: '14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
                marginTop: '6px',
              }}
            >
              {/* Header Title */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Terminal size={15} color="#007acc" />
                <span style={{ fontSize: '13.5px', fontWeight: 600, color: '#f1f5f9' }}>
                  Allow {req.toolTitle || req.toolCall?.name}?
                </span>
              </div>

              {/* Terminal Command Box */}
              <div
                style={{
                  background: '#141414',
                  border: '1px solid #282828',
                  borderRadius: '6px',
                  padding: '9px 11px',
                  fontSize: '12px',
                  fontFamily: 'monospace',
                  color: '#ededed',
                  wordBreak: 'break-all',
                }}
              >
                {cmd}
              </div>

              {/* 4 Numbered Antigravity Options */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {[
                  { id: 1, label: 'Yes, allow this time' },
                  { id: 2, label: `Yes, and always allow in this conversation` },
                  { id: 3, label: `Yes, and always allow '${req.toolCall?.name}'` },
                  { id: 4, label: 'No (tell the agent what to do instead)' },
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
                        gap: '10px',
                        padding: '8px 10px',
                        borderRadius: '6px',
                        background: isOptSelected ? '#333333' : 'transparent',
                        border: `1px solid ${isOptSelected ? '#444444' : 'transparent'}`,
                        cursor: 'pointer',
                        fontSize: '12.5px',
                        color: isOptSelected ? '#ffffff' : '#a1a1aa',
                      }}
                    >
                      <span
                        style={{
                          width: '18px',
                          height: '18px',
                          borderRadius: '4px',
                          background: isOptSelected ? '#007acc' : '#282828',
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '11px',
                          fontWeight: 700,
                        }}
                      >
                        {opt.id}
                      </span>
                      <span>{opt.label}</span>
                    </div>
                  );
                })}
              </div>

              {/* If Option 4 (Reject & Tell agent) is selected */}
              {selected === 4 && (
                <input
                  type="text"
                  placeholder="Tell the agent what to do instead..."
                  value={option4Inputs[req.id] || ''}
                  onChange={e => setOption4Inputs({ ...option4Inputs, [req.id]: e.target.value })}
                  style={{
                    background: '#141414',
                    border: '1px solid #333',
                    borderRadius: '6px',
                    color: '#ededed',
                    padding: '8px 10px',
                    fontSize: '12px',
                    outline: 'none',
                  }}
                />
              )}

              {/* Action Buttons: Skip & Submit */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px' }}>
                <button
                  onClick={() => sendDecision(req.id, 'deny', 0, 'Skipped by user')}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#888888',
                    fontSize: '12px',
                    cursor: 'pointer',
                    padding: '8px 12px',
                  }}
                >
                  Skip
                </button>
                <button
                  onClick={() => {
                    if (selected === 4) {
                      sendDecision(req.id, 'deny', 4, option4Inputs[req.id] || '');
                    } else {
                      sendDecision(req.id, 'allow', selected);
                    }
                  }}
                  style={{
                    background: '#007acc',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '8px 18px',
                    fontSize: '12.5px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <span>Submit</span>
                  <span style={{ fontSize: '10px', opacity: 0.8 }}>↵</span>
                </button>
              </div>
            </div>
          );
        })}

        <div ref={chatBottomRef} />
      </main>

      {/* --- Bottom Input Thumb Zone (Multi-Image & Fast Submit) --- */}
      <footer
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          background: '#141414',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          paddingTop: '8px',
          paddingLeft: 'max(14px, env(safe-area-inset-left, 0px))',
          paddingRight: 'max(14px, env(safe-area-inset-right, 0px))',
          paddingBottom: 'max(12px, calc(10px + env(safe-area-inset-bottom, 0px)))',
          boxSizing: 'border-box',
          zIndex: 40,
        }}
      >
        {/* Hidden File Input (Supports Multiple Image Selection) */}
        <input
          type="file"
          accept="image/*"
          multiple
          ref={fileInputRef}
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />

        <div
          style={{
            maxWidth: '780px',
            margin: '0 auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          {/* Multiple Attached Images Preview Horizontal Tray */}
          {attachedImages.length > 0 && (
            <div
              style={{
                display: 'flex',
                gap: '8px',
                overflowX: 'auto',
                paddingBottom: '4px',
                maxWidth: '100%',
              }}
            >
              {attachedImages.map((img, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: '#252525',
                    border: '1px solid #333333',
                    borderRadius: '6px',
                    padding: '4px 8px',
                    flexShrink: 0,
                  }}
                >
                  <img
                    src={img.preview}
                    alt={img.name}
                    style={{ width: '26px', height: '26px', borderRadius: '4px', objectFit: 'cover' }}
                  />
                  <span
                    style={{
                      fontSize: '11px',
                      color: '#ededed',
                      maxWidth: '110px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {img.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => setAttachedImages(prev => prev.filter((_, i) => i !== idx))}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#9ca3af',
                      cursor: 'pointer',
                      padding: '2px',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
            {/* Multiple Photos Picker Button */}
            <button
              type="button"
              onClick={() => {
                fileInputRef.current?.click();
                triggerHaptic(20);
              }}
              title="Attach Photos"
              style={{
                height: '44px',
                width: '44px',
                borderRadius: '8px',
                background: attachedImages.length > 0 ? '#333333' : '#222222',
                border: '1px solid #333333',
                color: attachedImages.length > 0 ? '#007acc' : '#9ca3af',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                position: 'relative',
              }}
            >
              <ImageIcon size={18} />
              {attachedImages.length > 1 && (
                <span
                  style={{
                    position: 'absolute',
                    top: '4px',
                    right: '4px',
                    background: '#007acc',
                    color: '#fff',
                    borderRadius: '50%',
                    width: '14px',
                    height: '14px',
                    fontSize: '9px',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {attachedImages.length}
                </span>
              )}
            </button>

            <textarea
              placeholder={isStreaming ? 'Agent is working on PC...' : 'Message Antigravity...'}
              value={promptText}
              onChange={e => setPromptText(e.target.value)}
              onKeyDown={e => {
                // Desktop: Ctrl+Enter or Cmd+Enter submits
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  sendPrompt();
                }
                // Mobile & Normal: Enter key inserts newline! Never submits prematurely.
              }}
              enterKeyHint="enter"
              rows={1}
              autoComplete="off"
              disabled={!connected || isStreaming}
              style={{
                flex: 1,
                minHeight: '44px',
                maxHeight: '120px',
                padding: '11px 14px',
                borderRadius: '8px',
                background: '#222222',
                border: '1px solid #333333',
                color: '#ededed',
                fontSize: '14px',
                lineHeight: '1.4',
                outline: 'none',
                resize: 'none',
                boxSizing: 'border-box',
                fontFamily: 'inherit',
              }}
            />

            <button
              type="button"
              onClick={sendPrompt}
              disabled={!connected || isStreaming || (!promptText.trim() && attachedImages.length === 0)}
              style={{
                height: '44px',
                width: '44px',
                borderRadius: '8px',
                background: connected && (promptText.trim() || attachedImages.length > 0) ? '#007acc' : '#282828',
                color: connected && (promptText.trim() || attachedImages.length > 0) ? '#ffffff' : '#666666',
                border: 'none',
                cursor: connected && (promptText.trim() || attachedImages.length > 0) ? 'pointer' : 'default',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Send size={15} />
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
