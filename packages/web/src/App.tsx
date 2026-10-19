import React, { useState, useEffect, useRef } from 'react';
import {
  ApprovalRequest,
  WorkspaceState,
  WsServerMessage,
  WsClientMessage,
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
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [customHost, setCustomHost] = useState(host);
  const [customPort, setCustomPort] = useState(port);

  const wsRef = useRef<WebSocket | null>(null);

  // Vibrate phone when approval requested
  const triggerVibration = () => {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([200, 100, 200, 100, 400]);
      } catch (e) {
        // Ignore vibration errors on unsupported devices
      }
    }
  };

  useEffect(() => {
    localStorage.setItem('agy_host', host);
    localStorage.setItem('agy_port', port);

    const wsUrl = `ws://${host}:${port}`;
    console.log(`[Companion] Connecting to ${wsUrl}...`);

    let socket: WebSocket;
    try {
      socket = new WebSocket(wsUrl);
      wsRef.current = socket;
    } catch (e) {
      console.error('[Companion] Socket connection failed:', e);
      return;
    }

    socket.onopen = () => {
      console.log('[Companion] WebSocket connected!');
      setConnected(true);
      const hello: WsClientMessage = {
        type: 'client:hello',
        deviceId: 'mobile-web-client',
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
            // Populate initial approvals
            const initialApprovals = msg.workspaces.flatMap(w => w.pendingApprovals || []);
            setPendingApprovals(initialApprovals);
            if (initialApprovals.length > 0) triggerVibration();
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
            triggerVibration();
            break;

          case 'server:approval_resolved':
            setPendingApprovals(prev => prev.filter(r => r.id !== msg.requestId));
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

    const payload: WsClientMessage = {
      type: 'client:respond_approval',
      payload: {
        requestId,
        decision,
        interceptPrompt: interceptInput[requestId] || '',
      },
    };

    wsRef.current.send(JSON.stringify(payload));

    // Optimistically remove from list
    setPendingApprovals(prev => prev.filter(r => r.id !== requestId));
  };

  const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId) || workspaces[0];

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', minHeight: '100vh', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Top Header */}
      <header style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: '#131b2e',
        padding: '14px 18px',
        borderRadius: '16px',
        border: '1px solid #1e293b',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '24px' }}>🚀</span>
          <div>
            <h1 style={{ fontSize: '17px', fontWeight: 700, letterSpacing: '-0.3px' }}>Antigravity Companion</h1>
            <p style={{ fontSize: '12px', color: '#94a3b8' }}>Remote PC Controller</p>
          </div>
        </div>

        <button
          onClick={() => setShowSettings(!showSettings)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: connected ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            color: connected ? '#4ade80' : '#f87171',
            border: `1px solid ${connected ? '#22c55e' : '#ef4444'}`,
            padding: '6px 12px',
            borderRadius: '20px',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          <span style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: connected ? '#22c55e' : '#ef4444',
            boxShadow: connected ? '0 0 8px #22c55e' : 'none'
          }} />
          {connected ? 'PC Online' : 'Offline'}
        </button>
      </header>

      {/* Settings Modal / Drawer */}
      {showSettings && (
        <div style={{
          background: '#1e293b',
          padding: '16px',
          borderRadius: '16px',
          border: '1px solid #334155',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600 }}>Connection Settings</h3>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={customHost}
              onChange={e => setCustomHost(e.target.value)}
              placeholder="PC IP (e.g., 192.168.1.5)"
              style={{ flex: 2, padding: '8px 12px', borderRadius: '8px', background: '#0f172a', border: '1px solid #475569', color: '#fff' }}
            />
            <input
              type="text"
              value={customPort}
              onChange={e => setCustomPort(e.target.value)}
              placeholder="Port"
              style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', background: '#0f172a', border: '1px solid #475569', color: '#fff' }}
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
              background: '#3b82f6',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Connect
          </button>
        </div>
      )}

      {/* Workspace Selector Bar */}
      {workspaces.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
          {workspaces.map(w => (
            <button
              key={w.id}
              onClick={() => setActiveWorkspaceId(w.id)}
              style={{
                padding: '8px 14px',
                borderRadius: '12px',
                background: w.id === activeWorkspace?.id ? '#2563eb' : '#1e293b',
                color: '#fff',
                border: '1px solid #334155',
                fontSize: '13px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              <span>📁 {w.name}</span>
              {w.pendingApprovals.length > 0 && (
                <span style={{
                  background: '#ef4444',
                  color: '#fff',
                  fontSize: '11px',
                  borderRadius: '10px',
                  padding: '2px 6px',
                  fontWeight: 700
                }}>
                  {w.pendingApprovals.length}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Pending Approvals Section */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#94a3b8' }}>
            Action Required ({pendingApprovals.length})
          </h2>
        </div>

        {pendingApprovals.length === 0 ? (
          <div style={{
            background: '#131b2e',
            padding: '36px 20px',
            borderRadius: '16px',
            textAlign: 'center',
            border: '1px dashed #24324f'
          }}>
            <p style={{ fontSize: '28px', marginBottom: '8px' }}>☕</p>
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#e2e8f0' }}>No Actions Blocking</h3>
            <p style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
              Antigravity is coding or waiting for prompts. Any permission requests will push here instantly.
            </p>
          </div>
        ) : (
          pendingApprovals.map(req => (
            <div
              key={req.id}
              style={{
                background: '#182238',
                borderRadius: '16px',
                padding: '18px',
                border: '2px solid #f59e0b',
                boxShadow: '0 8px 30px rgba(245, 158, 11, 0.25)',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <span style={{
                    background: '#f59e0b',
                    color: '#000',
                    fontSize: '11px',
                    fontWeight: 800,
                    padding: '3px 8px',
                    borderRadius: '6px',
                    textTransform: 'uppercase'
                  }}>
                    Permission Gate
                  </span>
                  <h3 style={{ fontSize: '17px', fontWeight: 700, marginTop: '8px', color: '#fbbf24' }}>
                    Tool: {req.toolCall.name}
                  </h3>
                </div>
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                  {new Date(req.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </div>

              {/* Tool Arguments display */}
              <div style={{
                background: '#0a0f1d',
                padding: '12px',
                borderRadius: '10px',
                border: '1px solid #1e293b',
                fontFamily: 'monospace',
                fontSize: '12px',
                color: '#38bdf8',
                overflowX: 'auto',
                whiteSpace: 'pre-wrap'
              }}>
                {Object.entries(req.toolCall.args || {}).map(([key, val]) => (
                  <div key={key}>
                    <strong style={{ color: '#94a3b8' }}>{key}: </strong>
                    <span>{typeof val === 'string' ? val : JSON.stringify(val)}</span>
                  </div>
                ))}
              </div>

              {/* Intercept prompt input */}
              <input
                type="text"
                placeholder="Optional: Type custom instruction to intercept..."
                value={interceptInput[req.id] || ''}
                onChange={e => setInterceptInput({ ...interceptInput, [req.id]: e.target.value })}
                style={{
                  padding: '10px 12px',
                  borderRadius: '10px',
                  background: '#0a0f1d',
                  border: '1px solid #334155',
                  color: '#fff',
                  fontSize: '13px'
                }}
              />

              {/* Action Buttons */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '10px' }}>
                <button
                  onClick={() => sendDecision(req.id, 'allow')}
                  style={{
                    padding: '14px',
                    borderRadius: '12px',
                    background: '#16a34a',
                    color: '#fff',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '15px',
                    cursor: 'pointer',
                    boxShadow: '0 4px 15px rgba(22, 163, 74, 0.4)'
                  }}
                >
                  ✓ Allow
                </button>
                <button
                  onClick={() => sendDecision(req.id, 'deny')}
                  style={{
                    padding: '14px',
                    borderRadius: '12px',
                    background: '#dc2626',
                    color: '#fff',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '14px',
                    cursor: 'pointer'
                  }}
                >
                  ✕ Deny
                </button>
                <button
                  onClick={() => sendDecision(req.id, 'intercept')}
                  style={{
                    padding: '14px',
                    borderRadius: '12px',
                    background: '#d97706',
                    color: '#fff',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '14px',
                    cursor: 'pointer'
                  }}
                >
                  ⚡ Intercept
                </button>
              </div>
            </div>
          ))
        )}
      </section>

      {/* Workspace Info Card */}
      {activeWorkspace && (
        <section style={{
          background: '#131b2e',
          padding: '16px',
          borderRadius: '16px',
          border: '1px solid #1e293b',
          marginTop: 'auto'
        }}>
          <h4 style={{ fontSize: '13px', fontWeight: 600, color: '#94a3b8', marginBottom: '8px' }}>Active PC Context</h4>
          <p style={{ fontSize: '12px', color: '#cbd5e1', wordBreak: 'break-all' }}>
            <strong>Path:</strong> {activeWorkspace.path}
          </p>
          <p style={{ fontSize: '12px', color: '#cbd5e1', marginTop: '4px' }}>
            <strong>Status:</strong> <span style={{ color: activeWorkspace.status === 'waiting_approval' ? '#f59e0b' : '#4ade80' }}>{activeWorkspace.status.toUpperCase()}</span>
          </p>
        </section>
      )}
    </div>
  );
}
