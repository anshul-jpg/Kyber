import React, { useState, useEffect, useRef } from 'react';
import {
  ApprovalRequest,
  WorkspaceState,
  WsServerMessage,
  WsClientMessage,
  ChatMessage,
} from '@agy-companion/protocol';

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
  const [promptText, setPromptText] = useState<string>('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [customHost, setCustomHost] = useState(host);
  const [customPort, setCustomPort] = useState(port);

  const wsRef = useRef<WebSocket | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  // Vibrate phone when approval requested or action completed
  const triggerHaptic = (pattern: number | number[] = 40) => {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch {}
    }
  };

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isStreaming, pendingApprovals]);

  useEffect(() => {
    localStorage.setItem('agy_host', host);
    localStorage.setItem('agy_port', port);

    const wsUrl = `ws://${host}:${port}`;
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
            const initialApprovals = msg.workspaces.flatMap(w => w.pendingApprovals || []);
            setPendingApprovals(initialApprovals);
            if (initialApprovals.length > 0) triggerHaptic([200, 100, 200]);
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
              // Replace active streaming bubble or append
              const filtered = prev.filter(m => m.id !== 'streaming_active');
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

  const sendDecision = (requestId: string, decision: 'allow' | 'deny' | 'intercept') => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    triggerHaptic(40);

    const payload: WsClientMessage = {
      type: 'client:respond_approval',
      payload: {
        requestId,
        decision,
        interceptPrompt: interceptInput[requestId] || '',
      },
    };

    wsRef.current.send(JSON.stringify(payload));
    setPendingApprovals(prev => prev.filter(r => r.id !== requestId));
  };

  const sendPrompt = () => {
    const text = promptText.trim();
    if (!text || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    triggerHaptic(50);

    const wsMsg: WsClientMessage = {
      type: 'client:send_prompt',
      workspaceId: activeWorkspaceId,
      prompt: text,
    };

    wsRef.current.send(JSON.stringify(wsMsg));
    setPromptText('');
  };

  const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId) || workspaces[0];

  return (
    <div style={{
      maxWidth: '640px',
      margin: '0 auto',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: '#090d16',
      color: '#f8fafc',
      position: 'relative',
      paddingBottom: '88px', // space for fixed thumb-zone input bar
    }}>
      {/* Top Navigation Bar */}
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: 'rgba(15, 23, 42, 0.85)',
        backdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        padding: '12px 16px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '16px',
            boxShadow: '0 2px 8px rgba(37, 99, 235, 0.4)'
          }}>
            ⚡
          </div>
          <div>
            <h1 style={{ fontSize: '15px', fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>
              Antigravity Companion
            </h1>
            <p style={{ fontSize: '11px', color: '#64748b', margin: 0, fontFamily: 'monospace' }}>
              {activeWorkspace ? activeWorkspace.name : 'Connecting...'}
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowSettings(!showSettings)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: connected ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
            color: connected ? '#34d399' : '#f87171',
            border: `1px solid ${connected ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
            padding: '5px 10px',
            borderRadius: '16px',
            fontSize: '11px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <span style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: connected ? '#10b981' : '#ef4444',
            boxShadow: connected ? '0 0 8px #10b981' : 'none',
          }} />
          {connected ? 'PC Online' : 'Offline'}
        </button>
      </header>

      {/* Settings Modal */}
      {showSettings && (
        <div style={{
          margin: '12px 16px',
          background: '#111827',
          padding: '16px',
          borderRadius: '12px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}>
          <h3 style={{ fontSize: '13px', fontWeight: 600, color: '#94a3b8' }}>Connection Settings</h3>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={customHost}
              onChange={e => setCustomHost(e.target.value)}
              placeholder="Host (e.g. 192.168.1.37)"
              style={{
                flex: 3,
                padding: '10px 12px',
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
                padding: '10px 12px',
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
              padding: '10px',
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

      {/* Workspace Selector Horizontal Bar */}
      {workspaces.length > 0 && (
        <div style={{
          display: 'flex',
          gap: '8px',
          overflowX: 'auto',
          padding: '10px 16px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
        }}>
          {workspaces.map(w => (
            <button
              key={w.id}
              onClick={() => setActiveWorkspaceId(w.id)}
              style={{
                padding: '6px 12px',
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
              <span>📁 {w.name}</span>
              {w.pendingApprovals.length > 0 && (
                <span style={{
                  background: '#f59e0b',
                  color: '#000',
                  fontSize: '10px',
                  borderRadius: '10px',
                  padding: '1px 5px',
                  fontWeight: 800,
                }}>
                  {w.pendingApprovals.length}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Main Content Area */}
      <main style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Permission Gate Prompts (Top Priority Banner) */}
        {pendingApprovals.length > 0 && (
          <section style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {pendingApprovals.map(req => (
              <div
                key={req.id}
                style={{
                  background: '#131b2e',
                  borderRadius: '14px',
                  padding: '16px',
                  border: '1px solid #f59e0b',
                  boxShadow: '0 8px 30px rgba(245, 158, 11, 0.2)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      background: 'rgba(245, 158, 11, 0.2)',
                      color: '#fbbf24',
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '6px',
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                    }}>
                      Approval Required
                    </span>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc' }}>
                      {req.toolCall.name}
                    </span>
                  </div>
                  <span style={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace' }}>
                    {new Date(req.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>

                {/* Arguments View */}
                <div style={{
                  background: '#090d16',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  fontFamily: 'Geist Mono, monospace',
                  fontSize: '12px',
                  color: '#38bdf8',
                  overflowX: 'auto',
                  whiteSpace: 'pre-wrap',
                }}>
                  {Object.entries(req.toolCall.args || {}).map(([key, val]) => (
                    <div key={key}>
                      <span style={{ color: '#94a3b8' }}>{key}: </span>
                      <span>{typeof val === 'string' ? val : JSON.stringify(val)}</span>
                    </div>
                  ))}
                </div>

                {/* Optional Intercept input */}
                <input
                  type="text"
                  placeholder="Intercept with redirection instructions..."
                  value={interceptInput[req.id] || ''}
                  onChange={e => setInterceptInput({ ...interceptInput, [req.id]: e.target.value })}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    background: '#090d16',
                    border: '1px solid #334155',
                    color: '#fff',
                    fontSize: '12px',
                  }}
                />

                {/* Action Buttons (Thumb zone friendly) */}
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '8px' }}>
                  <button
                    onClick={() => sendDecision(req.id, 'allow')}
                    style={{
                      height: '44px',
                      borderRadius: '10px',
                      background: '#16a34a',
                      color: '#fff',
                      border: 'none',
                      fontWeight: 700,
                      fontSize: '14px',
                      cursor: 'pointer',
                      boxShadow: '0 2px 10px rgba(22, 163, 74, 0.3)',
                    }}
                  >
                    ✓ Allow
                  </button>
                  <button
                    onClick={() => sendDecision(req.id, 'deny')}
                    style={{
                      height: '44px',
                      borderRadius: '10px',
                      background: '#dc2626',
                      color: '#fff',
                      border: 'none',
                      fontWeight: 700,
                      fontSize: '13px',
                      cursor: 'pointer',
                    }}
                  >
                    ✕ Deny
                  </button>
                  <button
                    onClick={() => sendDecision(req.id, 'intercept')}
                    style={{
                      height: '44px',
                      borderRadius: '10px',
                      background: '#d97706',
                      color: '#fff',
                      border: 'none',
                      fontWeight: 700,
                      fontSize: '13px',
                      cursor: 'pointer',
                    }}
                  >
                    ⚡ Intercept
                  </button>
                </div>
              </div>
            ))}
          </section>
        )}

        {/* Live Conversation Stream */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {chatMessages.length === 0 && pendingApprovals.length === 0 && (
            <div style={{
              background: '#0f172a',
              padding: '36px 20px',
              borderRadius: '16px',
              textAlign: 'center',
              border: '1px dashed rgba(255, 255, 255, 0.1)',
              marginTop: '40px',
            }}>
              <p style={{ fontSize: '32px', marginBottom: '8px' }}>💻</p>
              <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#f8fafc' }}>
                Companion Online
              </h3>
              <p style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', maxWidth: '320px', margin: '4px auto 0' }}>
                Type a prompt below to execute remotely on your PC, or let your CLI run. Any tool approval will push here instantly.
              </p>
            </div>
          )}

          {chatMessages.map(msg => (
            <div
              key={msg.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                gap: '4px',
              }}
            >
              <div style={{
                fontSize: '11px',
                color: '#64748b',
                fontFamily: 'monospace',
                padding: '0 4px',
              }}>
                {msg.role === 'user' ? 'You (Phone)' : 'Antigravity'}
              </div>

              <div style={{
                maxWidth: '90%',
                padding: '12px 16px',
                borderRadius: '14px',
                background: msg.role === 'user' ? '#1d4ed8' : '#111827',
                color: '#f8fafc',
                border: `1px solid ${msg.role === 'user' ? '#2563eb' : 'rgba(255, 255, 255, 0.08)'}`,
                fontSize: '13px',
                lineHeight: '1.5',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                {msg.content}
                {msg.id === 'streaming_active' && (
                  <span style={{
                    display: 'inline-block',
                    width: '6px',
                    height: '14px',
                    background: '#38bdf8',
                    marginLeft: '4px',
                    verticalAlign: 'middle',
                    animation: 'pulse 1s infinite',
                  }} />
                )}
              </div>
            </div>
          ))}

          <div ref={chatBottomRef} />
        </section>
      </main>

      {/* Fixed Thumb-Zone Bottom Input Bar */}
      <footer style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 40,
        background: 'rgba(15, 23, 42, 0.95)',
        backdropFilter: 'blur(16px)',
        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
        padding: '10px 16px',
      }}>
        <div style={{
          maxWidth: '640px',
          margin: '0 auto',
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
        }}>
          <input
            type="text"
            placeholder={isStreaming ? 'Agent is working on PC...' : 'Message Antigravity CLI...'}
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
              height: '46px',
              padding: '0 14px',
              borderRadius: '12px',
              background: '#090d16',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#f8fafc',
              fontSize: '14px',
              outline: 'none',
            }}
          />

          <button
            onClick={sendPrompt}
            disabled={!connected || isStreaming || !promptText.trim()}
            style={{
              height: '46px',
              padding: '0 18px',
              borderRadius: '12px',
              background: connected && promptText.trim() ? '#2563eb' : '#1e293b',
              color: connected && promptText.trim() ? '#ffffff' : '#64748b',
              border: 'none',
              fontWeight: 700,
              fontSize: '14px',
              cursor: connected && promptText.trim() ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>Send</span>
            <span>➤</span>
          </button>
        </div>
      </footer>
    </div>
  );
}
