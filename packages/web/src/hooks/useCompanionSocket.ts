import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ApprovalRequest,
  WorkspaceState,
  WsServerMessage,
  WsClientMessage,
  ChatMessage,
  ConversationSummary,
  QuickAction,
  ExecutionPolicy,
  CompanionMode,
  AgentQuota,
  EditorTab,
  RecentProject,
  TerminalEntry,
  HostTelemetry,
} from '@agy-companion/protocol';
import {
  dispatchApprovalNotification,
  clearApprovalNotification,
  updatePersistentCompanionNotification,
  sanitizeNotificationText,
} from '../utils/notifications';
import { triggerHaptic } from '../components/CommonUI';

export interface CompanionSocketOptions {
  host: string;
  port: string;
  wsRef?: React.MutableRefObject<WebSocket | null>;
  activeWorkspaceId: string;
  setActiveWorkspaceId: React.Dispatch<React.SetStateAction<string>>;
  setWorkspaces: React.Dispatch<React.SetStateAction<WorkspaceState[]>>;
  setPendingApprovals: React.Dispatch<React.SetStateAction<ApprovalRequest[]>>;
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setCompanionMode: React.Dispatch<React.SetStateAction<CompanionMode>>;
  setExecutionPolicy: React.Dispatch<React.SetStateAction<ExecutionPolicy>>;
  setConversationTitle: React.Dispatch<React.SetStateAction<string>>;
  setConversations: React.Dispatch<React.SetStateAction<ConversationSummary[]>>;
  setTailscaleIp: React.Dispatch<React.SetStateAction<string | null>>;
  setQuickActions: React.Dispatch<React.SetStateAction<QuickAction[]>>;
  setIdeStatus: React.Dispatch<React.SetStateAction<'active' | 'dormant'>>;
  setApkUpdateAvailable: React.Dispatch<React.SetStateAction<boolean>>;
  setAgentQuotas: React.Dispatch<React.SetStateAction<AgentQuota[]>>;
  setEditorTabs: React.Dispatch<React.SetStateAction<EditorTab[]>>;
  setRecentProjects: React.Dispatch<React.SetStateAction<RecentProject[]>>;
  setTerminalEntries: React.Dispatch<React.SetStateAction<TerminalEntry[]>>;
  setHostTelemetry: React.Dispatch<React.SetStateAction<HostTelemetry | null>>;
  setIsStreaming: React.Dispatch<React.SetStateAction<boolean>>;
  setCurrentThinking: React.Dispatch<React.SetStateAction<string | null>>;
  setIsQueued: React.Dispatch<React.SetStateAction<boolean>>;
  setActiveSessionBackup: React.Dispatch<React.SetStateAction<any>>;
  getAuthHeaders: () => Record<string, string>;
}

export interface CompanionSocketReturn {
  connected: boolean;
  authError: boolean;
  setAuthError: React.Dispatch<React.SetStateAction<boolean>>;
  reconnectTick: number;
  setReconnectTick: React.Dispatch<React.SetStateAction<number>>;
  sendClientMessage: (msg: WsClientMessage) => boolean;
  wsRef: React.MutableRefObject<WebSocket | null>;
}

export function useCompanionSocket(options: CompanionSocketOptions): CompanionSocketReturn {
  const {
    host,
    port,
    activeWorkspaceId,
    setActiveWorkspaceId,
    setWorkspaces,
    setPendingApprovals,
    setChatMessages,
    setCompanionMode,
    setExecutionPolicy,
    setConversationTitle,
    setConversations,
    setTailscaleIp,
    setQuickActions,
    setIdeStatus,
    setApkUpdateAvailable,
    setAgentQuotas,
    setEditorTabs,
    setRecentProjects,
    setTerminalEntries,
    setHostTelemetry,
    setIsStreaming,
    setCurrentThinking,
    setIsQueued,
    setActiveSessionBackup,
    getAuthHeaders,
  } = options;

  const [connected, setConnected] = useState<boolean>(false);
  const [authError, setAuthError] = useState<boolean>(false);
  const [reconnectTick, setReconnectTick] = useState<number>(0);
  const localWsRef = useRef<WebSocket | null>(null);
  const wsRef = options.wsRef || localWsRef;
  const lastThinkingNotifyRef = useRef<number>(0);

  const sendClientMessage = useCallback((msg: WsClientMessage): boolean => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify(msg));
        return true;
      } catch (e) {
        console.error('[CompanionSocket] Send failed:', e);
        return false;
      }
    }
    return false;
  }, []);

  useEffect(() => {
    localStorage.setItem('agy_host', host);
    localStorage.setItem('agy_port', port);
    const savedToken = typeof window !== 'undefined' ? localStorage.getItem('agy_token') : null;

    if (typeof window !== 'undefined' && (window as any).AndroidHost?.setActiveHost) {
      try {
        (window as any).AndroidHost.setActiveHost(host, port, savedToken || null);
      } catch {}
    }

    let wsUrl = '';
    const cleanHost = (host || '')
      .trim()
      .replace(/^https?:\/\//, '')
      .replace(/^wss?:\/\//, '')
      .replace(/\/$/, '');

    let hostWithoutPort = cleanHost.replace(/:\d+$/, '');
    const isMobileApp = navigator.userAgent.includes('Android') || !!(window as any).Capacitor;
    if (isMobileApp && (hostWithoutPort === 'localhost' || hostWithoutPort === '127.0.0.1')) {
      hostWithoutPort = '100.107.129.104';
    }

    if (cleanHost.includes('.trycloudflare.com')) {
      wsUrl = `wss://${hostWithoutPort}`;
    } else if (window.location.protocol === 'https:' && window.location.hostname.includes('.trycloudflare.com')) {
      wsUrl = `wss://${window.location.host}`;
    } else {
      const targetHost = hostWithoutPort || '100.107.129.104';
      const targetPort = (!port || port === '443') ? '4040' : port;
      wsUrl = `ws://${targetHost}:${targetPort}`;
    }

    if (savedToken) {
      const sep = wsUrl.includes('?') ? '&' : '?';
      wsUrl = `${wsUrl}${sep}token=${encodeURIComponent(savedToken)}`;
    }

    let socket: WebSocket;
    let reconnectTimeout: any = null;
    let lastActivity = Date.now();

    try {
      socket = new WebSocket(wsUrl);
      wsRef.current = socket;
    } catch (e) {
      console.error('[Companion] Socket connection failed:', e);
      return;
    }

    socket.onopen = () => {
      setConnected(true);
      setAuthError(false);
      lastActivity = Date.now();
      triggerHaptic(30);
      const hello: WsClientMessage = {
        type: 'client:hello',
        deviceId: 'companion-client',
        name: navigator.userAgent.includes('Android') ? 'Android APK' : 'Mobile Web',
        token: savedToken || undefined,
      };
      socket.send(JSON.stringify(hello));
    };

    socket.onmessage = event => {
      lastActivity = Date.now();
      try {
        const msg = JSON.parse(event.data) as WsServerMessage;
        switch (msg.type) {
          case 'server:hello':
            setWorkspaces(msg.workspaces || []);
            if (msg.workspaces && msg.workspaces.length > 0 && !activeWorkspaceId) {
              const rootWs = msg.workspaces.find(w => !w.path.includes('\\packages\\') && !w.path.includes('/packages/')) || msg.workspaces[0];
              setActiveWorkspaceId(rootWs.id);
            }
            const helloApprovals = (msg.workspaces || []).flatMap(w => w.pendingApprovals || []);
            setPendingApprovals(helloApprovals);
            if (helloApprovals.length === 0) {
              clearApprovalNotification();
            }
            if (msg.history && msg.history.length > 0) {
              setChatMessages(msg.history);
              const lastMsg = msg.history[msg.history.length - 1];
              if (lastMsg && (lastMsg.role === 'assistant' || (lastMsg.role === 'tool' && !lastMsg.thought))) {
                setIsStreaming(false);
                setCurrentThinking(null);
                setIsQueued(false);
              }
            }
            if (msg.mode) {
              setCompanionMode(msg.mode);
              localStorage.setItem('agy_companion_mode', msg.mode);
            }
            if (msg.executionPolicy) {
              setExecutionPolicy(msg.executionPolicy);
              localStorage.setItem('agy_execution_policy', msg.executionPolicy);
            }
            if (msg.conversationTitle) {
              setConversationTitle(msg.conversationTitle);
            }
            if (msg.conversations) {
              setConversations(msg.conversations);
            }
            if (msg.tailscaleIp) {
              setTailscaleIp(msg.tailscaleIp);
            }
            if (msg.quickActions) {
              setQuickActions(msg.quickActions);
            }
            if (msg.ideStatus) {
              setIdeStatus(msg.ideStatus);
            }
            if (msg.apkBuildTime) {
              const lastInstalled = Number(localStorage.getItem('agy_installed_apk_time') || '0');
              if (msg.apkBuildTime > lastInstalled) {
                setApkUpdateAvailable(true);
              }
            }
            if (msg.agentQuotas && msg.agentQuotas.length > 0) {
              setAgentQuotas(msg.agentQuotas);
            }
            if (msg.activeTabs) {
              setEditorTabs(msg.activeTabs);
            }
            if (msg.token) {
              localStorage.setItem('agy_token', msg.token);
            }
            if (msg.recentProjects) {
              setRecentProjects(msg.recentProjects);
            }
            if (msg.terminalHistory) {
              setTerminalEntries(msg.terminalHistory);
            }
            if (msg.telemetry) {
              setHostTelemetry(msg.telemetry);
            }
            break;

          case 'server:recent_projects_updated':
            if (msg.projects) {
              setRecentProjects(msg.projects);
            }
            break;

          case 'server:terminal_output':
            if (msg.entry) {
              setTerminalEntries(prev => [...prev.slice(-99), msg.entry]);
            }
            break;

          case 'server:host_telemetry':
            if (msg.telemetry) {
              setHostTelemetry(msg.telemetry);
              if (msg.telemetry.ideStatus) {
                setIdeStatus(msg.telemetry.ideStatus);
              }
            }
            break;

          case 'server:apk_status':
            if (msg.apkBuildTime) {
              const lastInstalled = Number(localStorage.getItem('agy_installed_apk_time') || '0');
              if (msg.apkBuildTime > lastInstalled) {
                setApkUpdateAvailable(true);
              }
            }
            break;

          case 'server:workspaces_updated': {
            setWorkspaces(msg.workspaces || []);
            const updatedApprovals = (msg.workspaces || []).flatMap(w => w.pendingApprovals || []);
            setPendingApprovals(updatedApprovals);
            if (updatedApprovals.length === 0) {
              clearApprovalNotification();
            }
            break;
          }

          case 'server:quick_actions_updated':
            setQuickActions(msg.actions || []);
            break;

          case 'server:history': {
            const raw = (msg.messages || []) as ChatMessage[];
            const cleaned = raw.filter(m => {
              if (m.role === 'assistant' && m.content && /^\s*\d+:\d+\s*-\s*\d+:\d+:?\s*The user explicitly laid out/i.test(m.content)) {
                return false;
              }
              return true;
            });
            setChatMessages(cleaned);
            if (msg.conversationTitle) {
              setConversationTitle(msg.conversationTitle);
            }
            setActiveSessionBackup(null);
            setIsQueued(false);
            setIsStreaming(false);
            setCurrentThinking(null);
            break;
          }

          case 'server:conversations_list':
            setConversations(msg.conversations || []);
            break;

          case 'server:ide_status':
            setIdeStatus(msg.status);
            break;

          case 'server:chat_message':
            if (msg.message.role === 'assistant' && msg.message.content && /^\s*\d+:\d+\s*-\s*\d+:\d+:?\s*The user explicitly laid out/i.test(msg.message.content)) {
              break;
            }
            setChatMessages(prev => {
              const cleanNorm = (t: string) => (t || '').replace(/\s*\[Attached Media\]:[\s\S]*$/i, '').trim();

              if (msg.message.role === 'user') {
                const incomingClean = cleanNorm(msg.message.content);

                const existingIdx = prev.findIndex(
                  m => m.role === 'user' && (
                    m.id === msg.message.id ||
                    (
                      (m.id.startsWith('client_u_') || m.id.startsWith('msg_u_') || m.id.startsWith('ide_u_')) &&
                      (
                        cleanNorm(m.content) === incomingClean ||
                        incomingClean.startsWith(cleanNorm(m.content)) ||
                        cleanNorm(m.content).startsWith(incomingClean)
                      ) &&
                      Math.abs((m.timestamp || 0) - (msg.message.timestamp || 0)) < 120000
                    )
                  )
                );

                if (existingIdx !== -1) {
                  const updated = [...prev];
                  const existingMsg = prev[existingIdx];
                  const mergedImages = (msg.message.images && msg.message.images.length > 0)
                    ? msg.message.images
                    : existingMsg.images;
                  const mergedAudio = msg.message.audio || existingMsg.audio;

                  updated[existingIdx] = {
                    ...msg.message,
                    content: incomingClean || msg.message.content,
                    images: mergedImages,
                    audio: mergedAudio,
                  };
                  return updated.filter(m => m.id !== 'streaming_active');
                }
              }

              const withoutOptimistic = prev.filter(
                m => m.id !== 'streaming_active' && !(
                  m.role === 'user' && (
                    m.id.startsWith('client_u_') || m.id.startsWith('msg_u_')
                  ) && (
                    cleanNorm(m.content) === cleanNorm(msg.message.content) ||
                    cleanNorm(msg.message.content).startsWith(cleanNorm(m.content)) ||
                    cleanNorm(m.content).startsWith(cleanNorm(msg.message.content))
                  )
                )
              );
              if (withoutOptimistic.some(m => m.id === msg.message.id)) {
                return withoutOptimistic;
              }
              return [...withoutOptimistic, { ...msg.message, content: cleanNorm(msg.message.content) || msg.message.content }];
            });
            if (msg.message.role === 'assistant' && msg.message.content) {
              setIsQueued(false);
              setIsStreaming(false);
              setCurrentThinking(null);
              const clean = sanitizeNotificationText(msg.message.content);
              const preview = clean.length > 120 ? clean.slice(0, 120) + '...' : clean;
              updatePersistentCompanionNotification('Turn Complete', preview || 'Response ready', undefined, true, 'Antigravity IDE');
            } else if (msg.message.role === 'tool') {
              setIsQueued(false);
              if (msg.message.thought) {
                setCurrentThinking(msg.message.thought);
              }
              setIsStreaming(true);
            } else if (msg.message.thought) {
              setIsQueued(false);
              setCurrentThinking(msg.message.thought);
            }
            break;

          case 'server:mode_updated':
            setCompanionMode(msg.mode);
            break;

          case 'server:execution_policy_updated':
            setExecutionPolicy(msg.policy);
            localStorage.setItem('agy_execution_policy', msg.policy);
            break;

          case 'server:agent_quotas':
            setAgentQuotas(msg.quotas);
            break;

          case 'server:approval_requested':
            setIsQueued(false);
            setIsStreaming(true);
            setPendingApprovals(prev => {
              const updated = prev.some(r => r.id === msg.request.id) ? prev : [...prev, msg.request];
              triggerHaptic([100, 50, 100]);
              const countPrefix = updated.length > 1 ? `[${updated.length} Pending] ` : '';
              dispatchApprovalNotification(
                msg.request.id,
                `${countPrefix}${msg.request.toolCall?.name || 'Tool Approval'}`,
                msg.request.toolTitle || msg.request.toolCall?.args?.CommandLine || 'Antigravity requires your approval'
              );
              return updated;
            });
            break;

          case 'server:approval_paused':
            setPendingApprovals(prev => {
              const exists = prev.some(r => r.id === msg.request.id);
              if (exists) {
                return prev.map(r => r.id === msg.request.id ? { ...r, isPaused: true } : r);
              }
              return [...prev, { ...msg.request, isPaused: true }];
            });
            break;

          case 'server:approval_resolved':
            setPendingApprovals(prev => {
              const remaining = prev.filter(r => r.id !== msg.requestId);
              if (remaining.length === 0) {
                clearApprovalNotification();
              } else {
                const next = remaining[0];
                const countPrefix = remaining.length > 1 ? `[${remaining.length} Pending] ` : '';
                dispatchApprovalNotification(
                  next.id,
                  `${countPrefix}${next.toolCall?.name || 'Tool Approval'}`,
                  next.toolTitle || next.toolCall?.args?.CommandLine || 'Antigravity requires your approval'
                );
              }
              return remaining;
            });
            break;

          case 'server:pong':
            lastActivity = Date.now();
            break;

          case 'server:tabs_updated':
            if (msg.tabs) {
              setEditorTabs(msg.tabs);
            }
            break;

          case 'server:stream_thought':
            setIsQueued(false);
            setIsStreaming(true);
            setCurrentThinking(msg.thought);
            {
              const now = Date.now();
              if (now - lastThinkingNotifyRef.current > 2000) {
                lastThinkingNotifyRef.current = now;
                const cleanThought = sanitizeNotificationText(msg.thought);
                const preview = cleanThought.length > 90 ? cleanThought.slice(0, 90) + '...' : cleanThought;
                updatePersistentCompanionNotification('Agent Working', preview, undefined, false, 'Thinking');
              }
            }
            break;

          case 'server:stream_token':
            setIsQueued(false);
            setIsStreaming(true);
            setChatMessages(prev => {
              const last = prev[prev.length - 1];
              if (last && last.id === 'streaming_active') {
                const updated = [...prev];
                updated[prev.length - 1] = {
                  ...last,
                  content: last.content + msg.token,
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

    socket.onclose = (event: CloseEvent) => {
      setConnected(false);
      wsRef.current = null;
      clearTimeout(reconnectTimeout);

      if (event.code === 4401 || event.code === 4001 || (event.reason && event.reason.toLowerCase().includes('unauthorized'))) {
        setAuthError(true);
        return;
      }

      // Check if connection was rejected due to missing or invalid pairing token
      const cleanH = (host || '').trim().replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '').replace(/\/$/, '');
      const hostNoPort = cleanH.replace(/:\d+$/, '');
      const httpBase = cleanH.includes('.trycloudflare.com')
        ? `https://${hostNoPort}`
        : `http://${hostNoPort || '100.107.129.104'}:${(!port || port === '443') ? '4040' : port}`;

      fetch(`${httpBase}/api/policy`, {
        headers: getAuthHeaders(),
      }).then(res => {
        if (res.status === 401) {
          setAuthError(true);
        } else {
          setAuthError(false);
          reconnectTimeout = setTimeout(() => {
            setReconnectTick(t => t + 1);
          }, 1500);
        }
      }).catch(() => {
        reconnectTimeout = setTimeout(() => {
          setReconnectTick(t => t + 1);
        }, 2500);
      });
    };

    socket.onerror = () => {
      setConnected(false);
      try {
        socket.close();
      } catch {}
    };

    const pingInterval = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        if (Date.now() - lastActivity > 15000) {
          console.warn('[Companion] Watchdog timeout, reconnecting...');
          try {
            socket.close();
          } catch {}
          return;
        }
        socket.send(JSON.stringify({ type: 'client:ping' }));
      }
    }, 5000);

    const handleWakeup = () => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        setReconnectTick(t => t + 1);
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        handleWakeup();
      }
    };

    window.addEventListener('online', handleWakeup);
    window.addEventListener('focus', handleWakeup);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearTimeout(reconnectTimeout);
      clearInterval(pingInterval);
      window.removeEventListener('online', handleWakeup);
      window.removeEventListener('focus', handleWakeup);
      document.removeEventListener('visibilitychange', handleVisibility);
      socket.onclose = null;
      socket.onerror = null;
      socket.onopen = null;
      socket.onmessage = null;
      try {
        socket.close();
      } catch {}
    };
  }, [host, port, reconnectTick]);

  return {
    connected,
    authError,
    setAuthError,
    reconnectTick,
    setReconnectTick,
    sendClientMessage,
    wsRef,
  };
}
