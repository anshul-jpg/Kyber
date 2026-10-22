import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  ApprovalRequest,
  WorkspaceState,
  WsServerMessage,
  WsClientMessage,
  ChatMessage,
  ConversationSummary,
  decodePairingTicket,
  QuickAction,
  ExecutionPolicy,
  CompanionMode,
  AgentQuota,
  AudioAttachment,
} from '@agy-companion/protocol';
import {
  dispatchApprovalNotification,
  initNotificationActions,
  updatePersistentCompanionNotification,
  clearApprovalNotification,
  sanitizeNotificationText,
} from './utils/notifications';

import { triggerHaptic } from './components/CommonUI';
import { Header } from './components/Header';
import { HomeScreen } from './components/HomeScreen';
import { ChatFeed } from './components/ChatFeed';
import { ApprovalCards } from './components/ApprovalCards';
import { PromptDock, AttachedAudio } from './components/PromptDock';
import { BottomStatusBar } from './components/BottomStatusBar';
import { HistoryDrawer } from './components/HistoryDrawer';
import { ActionModals } from './components/ActionModals';
import { SettingsModal } from './components/SettingsModal';

export default function App() {
  // Check URL ticket on initial boot
  const initialTicket = useMemo(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search);
      const raw = p.get('ticket');
      if (raw) {
        const decoded = decodePairingTicket(raw);
        if (decoded) {
          localStorage.setItem('agy_host', decoded.host);
          localStorage.setItem('agy_port', decoded.port.toString());
          localStorage.setItem('agy_token', decoded.token);
          localStorage.setItem('agy_ssl', decoded.ssl ? 'true' : 'false');
          try {
            window.history.replaceState({}, document.title, window.location.pathname);
          } catch {}
          return decoded;
        }
      }
    }
    return null;
  }, []);

  // Connection states
  const [host, setHost] = useState<string>(() => {
    if (initialTicket) return initialTicket.host;
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search);
      const urlHost = p.get('host');
      if (urlHost) return urlHost;
      const isMobileApp = navigator.userAgent.includes('Android') || !!(window as any).Capacitor;
      const saved = localStorage.getItem('agy_host');
      if (saved && (!isMobileApp || (saved !== 'localhost' && saved !== '127.0.0.1'))) {
        return saved;
      }
      if (isMobileApp || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return '100.107.129.104'; // Default to Tailscale mesh IP for native mobile APK
      }
      return window.location.hostname || '100.107.129.104';
    }
    return '100.107.129.104';
  });

  const [port, setPort] = useState<string>(() => {
    if (initialTicket) return initialTicket.port.toString();
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search);
      return p.get('port') || localStorage.getItem('agy_port') || (window.location.port ? window.location.port : '4040');
    }
    return '4040';
  });

  const [connected, setConnected] = useState<boolean>(false);
  const [reconnectTick, setReconnectTick] = useState<number>(0);
  const [companionMode, setCompanionMode] = useState<CompanionMode>('remote');
  const [quickActions, setQuickActions] = useState<QuickAction[]>([]);
  const [, setTailscaleIp] = useState<string | null>(null);
  const [ideStatus, setIdeStatus] = useState<'active' | 'dormant'>('active');
  const [apkUpdateAvailable, setApkUpdateAvailable] = useState<boolean>(false);
  const [apkUpdateProgress, setApkUpdateProgress] = useState<{ inProgress: boolean; percent: number; status: string } | null>(null);
  const isNativeApp = typeof window !== 'undefined' && Boolean((window as any).AndroidHost?.isNativeApp?.());

  // Workspaces & Conversations
  const [workspaces, setWorkspaces] = useState<WorkspaceState[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>('');
  const [conversationTitle, setConversationTitle] = useState<string>('Recap And Daily Agenda');
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<ApprovalRequest[]>([]);

  // Prompt & Input Dock States
  const [promptText, setPromptText] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [isQueued, setIsQueued] = useState<boolean>(false);
  const [attachedImages, setAttachedImages] = useState<{ preview: string; name: string; base64: string }[]>([]);
  const [attachedAudio, setAttachedAudio] = useState<AttachedAudio | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>('Gemini 3.8 Flash Medium');

  // Modals & Panels
  const [showHistoryDrawer, setShowHistoryDrawer] = useState<boolean>(false);
  const [showOptionsDropdown, setShowOptionsDropdown] = useState<boolean>(false);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [executionPolicy, setExecutionPolicy] = useState<ExecutionPolicy>(() => {
    return (localStorage.getItem('agy_execution_policy') as ExecutionPolicy) || 'force_ask';
  });
  const [agentQuotas, setAgentQuotas] = useState<AgentQuota[]>([]);
  const [showFilesWithChanges, setShowFilesWithChanges] = useState<boolean>(false);
  const [activeActionModal, setActiveActionModal] = useState<'diff' | 'terminal' | 'artifacts' | 'browser' | 'explorer' | null>(null);

  const updateExecutionPolicy = (policy: ExecutionPolicy) => {
    setExecutionPolicy(policy);
    localStorage.setItem('agy_execution_policy', policy);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'client:set_execution_policy', policy }));
    }
    try {
      const cleanH = (host || '').trim().replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '').replace(/\/$/, '');
      const hostNoPort = cleanH.replace(/:\d+$/, '');
      const httpBase = cleanH.includes('.trycloudflare.com')
        ? `https://${hostNoPort}`
        : `http://${hostNoPort || '100.107.129.104'}:${(!port || port === '443') ? '4040' : port}`;

      fetch(`${httpBase}/api/policy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ policy }),
      }).catch(() => {});
    } catch {}
  };

  // File Explorer expanded directories state
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({
    'antigravity companion': true,
    '.agents': true,
    'packages': true,
    'packages/cli': true,
    'packages/cli/src': true,
    'packages/cli/src/server': true,
  });

  // Expanded thoughts state (per message id)
  const [expandedThoughts, setExpandedThoughts] = useState<Record<string, boolean>>({});

  // Live Model Thinking State
  const [currentThinking, setCurrentThinking] = useState<string | null>(null);
  const [isCurrentThoughtExpanded, setIsCurrentThoughtExpanded] = useState<boolean>(true);
  const [thinkingElapsed, setThinkingElapsed] = useState<number>(0);

  // Queued Messages State
  const [queuedPrompts, setQueuedPrompts] = useState<string[]>([]);

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const speechRecognitionRef = useRef<any>(null);
  const pendingApprovalsRef = useRef(pendingApprovals);
  pendingApprovalsRef.current = pendingApprovals;
  const lastThinkingNotifyRef = useRef<number>(0);

  // Thinking Elapsed Timer Effect
  useEffect(() => {
    let timer: any = null;
    if (isStreaming || currentThinking) {
      setThinkingElapsed(0);
      timer = setInterval(() => {
        setThinkingElapsed(s => s + 1);
      }, 1000);
    } else {
      setThinkingElapsed(0);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isStreaming, !!currentThinking]);

  // Reconcile turn completion: If the last message is an assistant response, turn is over!
  useEffect(() => {
    if (chatMessages.length > 0) {
      const lastMsg = chatMessages[chatMessages.length - 1];
      if (lastMsg && lastMsg.role === 'assistant' && lastMsg.content && pendingApprovals.length === 0) {
        setIsStreaming(false);
        setCurrentThinking(null);
        setIsQueued(false);
      }
    }
  }, [chatMessages, pendingApprovals]);

  // Listen for native APK update download progress
  useEffect(() => {
    const handleApkProgress = (e: any) => {
      const detail = e.detail || {};
      if (detail.percent >= 0 && detail.percent < 100) {
        setApkUpdateProgress({ inProgress: true, percent: detail.percent, status: detail.status || 'Downloading...' });
      } else {
        setApkUpdateProgress(null);
      }
    };
    window.addEventListener('apk_update_progress', handleApkProgress);

    const handleNativeVoice = (e: any) => {
      const text = e.detail?.text;
      if (text) {
        triggerHaptic(30);
        setPromptText(prev => (prev ? prev + ' ' + text : text));
      }
    };
    window.addEventListener('native_voice_result', handleNativeVoice);

    return () => {
      window.removeEventListener('apk_update_progress', handleApkProgress);
      window.removeEventListener('native_voice_result', handleNativeVoice);
    };
  }, []);

  // Auto-dispatch queued prompts when agent completes
  useEffect(() => {
    if (!isStreaming && queuedPrompts.length > 0 && connected) {
      const nextPrompt = queuedPrompts[0];
      setQueuedPrompts(prev => prev.slice(1));
      sendPromptDirect(nextPrompt);
    }
  }, [isStreaming, queuedPrompts, connected]);

  // Initialize notifications on mount
  useEffect(() => {
    initNotificationActions((actionId, reqId) => {
      const currentList = pendingApprovalsRef.current;
      const targetId = reqId || (currentList.length > 0 ? currentList[0].id : undefined);
      if (targetId) {
        sendDecision(targetId, actionId === 'allow' ? 'allow' : 'deny', 1);
      }
    });
  }, []);

  // Listen for native lockscreen approval resolutions from CompanionForegroundService
  useEffect(() => {
    const handleExternalApproval = (e: any) => {
      const { requestId, decision } = e.detail || {};
      if (requestId) {
        sendDecision(requestId, decision === 'deny' ? 'deny' : 'allow', 1);
      }
    };
    window.addEventListener('approval_resolved_external', handleExternalApproval);
    return () => window.removeEventListener('approval_resolved_external', handleExternalApproval);
  }, [host, port]);

  const isFirstMountRef = useRef(true);
  const userScrolledUpRef = useRef(false);

  // Track if user manually scrolled up
  useEffect(() => {
    const handleScroll = () => {
      const scrollPos = window.scrollY || document.documentElement.scrollTop;
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      userScrolledUpRef.current = maxScroll - scrollPos > 120;
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Auto-scroll chat without jarring animated roll
  useEffect(() => {
    if (!chatBottomRef.current) return;
    if (isFirstMountRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'auto', block: 'end' });
      isFirstMountRef.current = false;
      return;
    }
    if (!userScrolledUpRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'auto', block: 'end' });
    }
  }, [chatMessages.length, isStreaming]);

  // When a tool approval arrives, instantly scroll down
  useEffect(() => {
    if (pendingApprovals.length > 0 && chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'auto', block: 'end' });
    }
  }, [pendingApprovals.length]);

  // Connect WebSocket
  useEffect(() => {
    localStorage.setItem('agy_host', host);
    localStorage.setItem('agy_port', port);

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
      lastActivity = Date.now();
      triggerHaptic(30);
      const hello: WsClientMessage = {
        type: 'client:hello',
        deviceId: 'companion-client',
        name: navigator.userAgent.includes('Android') ? 'Android APK' : 'Mobile Web',
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
              setActiveWorkspaceId(msg.workspaces[0].id);
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

          case 'server:history':
            setChatMessages(msg.messages || []);
            if (msg.conversationTitle) {
              setConversationTitle(msg.conversationTitle);
            }
            setIsQueued(false);
            setIsStreaming(false);
            setCurrentThinking(null);
            break;

          case 'server:conversations_list':
            setConversations(msg.conversations || []);
            break;

          case 'server:ide_status':
            setIdeStatus(msg.status);
            break;

          case 'server:chat_message':
            setChatMessages(prev => {
              // 1. If incoming message is a user message, deduplicate against any existing client_u_ or msg_u_ or ide_u_
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

    socket.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      clearTimeout(reconnectTimeout);
      reconnectTimeout = setTimeout(() => {
        setReconnectTick(t => t + 1);
      }, 1500);
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

  // Send Decision
  const sendDecision = useCallback((
    requestId: string,
    decision: 'allow' | 'deny',
    selectedOption: number = 1,
    customText: string = ''
  ) => {
    triggerHaptic(35);

    let reason: string | undefined;
    let overrides: string[] | undefined;

    if (decision === 'deny') {
      reason = customText || 'Denied remotely via companion app';
    } else {
      if (selectedOption === 2) overrides = ['always_allow_session'];
      if (selectedOption === 3) overrides = ['always_allow_tool'];
    }

    const payload = {
      requestId,
      decision,
      reason,
      selectedOption,
      permissionOverrides: overrides,
    };

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(
          JSON.stringify({
            type: 'client:respond_approval',
            payload,
          })
        );
      } catch {}
    }

    try {
      const cleanH = (host || '').trim().replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '').replace(/\/$/, '');
      const hostNoPort = cleanH.replace(/:\d+$/, '');
      const httpBase = cleanH.includes('.trycloudflare.com')
        ? `https://${hostNoPort}`
        : `http://${hostNoPort || '100.107.129.104'}:${(!port || port === '443') ? '4040' : port}`;
      fetch(`${httpBase}/api/hook/approval`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {});
    } catch {}

    setPendingApprovals(prev => {
      const remaining = prev.filter(r => r.id !== requestId);
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
  }, [host, port]);

  // Clear All Approvals
  const handleClearApprovals = useCallback(() => {
    triggerHaptic(40);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'client:clear_approvals' }));
    }
    try {
      const cleanH = (host || '').trim().replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '').replace(/\/$/, '');
      const hostNoPort = cleanH.replace(/:\d+$/, '');
      const httpBase = cleanH.includes('.trycloudflare.com')
        ? `https://${hostNoPort}`
        : `http://${hostNoPort || '100.107.129.104'}:${(!port || port === '443') ? '4040' : port}`;
      fetch(`${httpBase}/api/approvals/clear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }).catch(() => {});
    } catch {}
    setPendingApprovals([]);
    clearApprovalNotification();
  }, [host, port]);

  // Accept All / Reject All
  const handleAcceptAll = () => {
    triggerHaptic([40, 40]);
    pendingApprovals.forEach(req => {
      sendDecision(req.id, 'allow', 1);
    });
    setShowFilesWithChanges(false);
  };

  const handleRejectAll = () => {
    triggerHaptic([60, 60]);
    pendingApprovals.forEach(req => {
      sendDecision(req.id, 'deny', 4, 'Rejected all changes');
    });
    setShowFilesWithChanges(false);
  };

  // Toggle Mode
  const toggleMode = (newMode: CompanionMode) => {
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
    try {
      const cleanH = (host || '').trim().replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '').replace(/\/$/, '');
      const hostNoPort = cleanH.replace(/:\d+$/, '');
      const httpBase = cleanH.includes('.trycloudflare.com')
        ? `https://${hostNoPort}`
        : `http://${hostNoPort || '100.107.129.104'}:${(!port || port === '443') ? '4040' : port}`;

      fetch(`${httpBase}/api/mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: newMode }),
      }).catch(() => {});
    } catch {}
  };

  // Quick Action
  const handleRunQuickAction = (qa: QuickAction) => {
    triggerHaptic(35);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'client:run_quick_action',
          command: qa.command,
          label: qa.label,
        })
      );
    }
  };

  // Emergency Stop
  const handleEmergencyStop = () => {
    triggerHaptic([60, 40, 60]);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(
          JSON.stringify({
            type: 'client:emergency_stop',
            workspaceId: activeWorkspaceId,
          })
        );
      } catch {}
    }

    try {
      const cleanH = (host || '').trim().replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '').replace(/\/$/, '');
      const hostNoPort = cleanH.replace(/:\d+$/, '');
      const httpBase = cleanH.includes('.trycloudflare.com')
        ? `https://${hostNoPort}`
        : `http://${hostNoPort || '100.107.129.104'}:${(!port || port === '443') ? '4040' : port}`;

      fetch(`${httpBase}/api/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: activeWorkspaceId }),
      }).catch(() => {});
    } catch {}

    pendingApprovals.forEach(req => sendDecision(req.id, 'deny', 1, 'Interrupted by user via Stop button'));
    setPendingApprovals([]);
    clearApprovalNotification();
    updatePersistentCompanionNotification('Task Interrupted', 'Agent stopped — Ready for new prompts', undefined, false, 'Remote Active');
    setIsStreaming(false);
    setCurrentThinking(null);
    setShowOptionsDropdown(false);
  };

  // Direct Prompt Dispatcher
  const sendPromptDirect = (
    textToSend: string,
    imagesPayload: any[] = [],
    audioPayload?: AudioAttachment
  ) => {
    triggerHaptic(40);

    const displayContent = textToSend || (audioPayload ? '🎙️ Voice Note' : '');
    const optimisticMsg: ChatMessage = {
      id: `client_u_${Date.now()}`,
      role: 'user',
      content: displayContent,
      timestamp: Date.now(),
      images: imagesPayload.length > 0 ? imagesPayload.map(i => `data:image/png;base64,${i.base64}`) : undefined,
      audio: audioPayload,
    };
    setChatMessages(prev => [...prev, optimisticMsg]);

    setIsQueued(true);
    setIsStreaming(false);
    setThinkingElapsed(0);
    setCurrentThinking(null);
    updatePersistentCompanionNotification('Prompt Dispatched', 'Processing in Antigravity...', undefined, false, 'Agent Working');

    const clientMsg: WsClientMessage = {
      type: 'client:send_prompt',
      workspaceId: activeWorkspaceId || 'default',
      prompt: textToSend,
      images: imagesPayload.length > 0 ? imagesPayload : undefined,
      audio: audioPayload,
    };

    let sentViaWs = false;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify(clientMsg));
        sentViaWs = true;
      } catch {}
    }

    if (!sentViaWs) {
      const cleanH = (host || '').trim().replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '').replace(/\/$/, '');
      const hostNoPort = cleanH.replace(/:\d+$/, '');
      const httpBase = cleanH.includes('.trycloudflare.com')
        ? `https://${hostNoPort}`
        : `http://${hostNoPort || '100.107.129.104'}:${(!port || port === '443') ? '4040' : port}`;

      fetch(`${httpBase}/api/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: textToSend,
          workspaceId: activeWorkspaceId || 'default',
          images: imagesPayload,
          audio: audioPayload,
        }),
      }).catch(err => {
        console.warn('[Companion] HTTP prompt send error:', err);
      });
    }
  };

  // Trigger in-app APK update or browser download
  const handleInstallApk = () => {
    triggerHaptic(30);
    const cleanH = (host || '').trim().replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '').replace(/\/$/, '');
    const hostNoPort = cleanH.replace(/:\d+$/, '');
    const httpBase = cleanH.includes('.trycloudflare.com')
      ? `https://${hostNoPort}`
      : `http://${hostNoPort || '100.107.129.104'}:${(!port || port === '443') ? '4040' : port}`;
    const downloadUrl = `${httpBase}/download/app.apk`;

    if ((window as any).AndroidHost?.downloadAndInstallApk) {
      setApkUpdateProgress({ inProgress: true, percent: 5, status: 'Connecting...' });
      localStorage.setItem('agy_installed_apk_time', Date.now().toString());
      setApkUpdateAvailable(false);
      (window as any).AndroidHost.downloadAndInstallApk(downloadUrl);
    } else {
      window.open(downloadUrl, '_blank');
    }
  };

  // Queue prompt if agent is busy
  const handleQueuePrompt = (explicitText?: string) => {
    const text = (typeof explicitText === 'string' ? explicitText : promptText).trim();
    if (!text && attachedImages.length === 0) return;
    triggerHaptic(25);
    setQueuedPrompts(prev => [...prev, text]);
    setPromptText('');
    setAttachedImages([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  // Force send a queued prompt: stops ongoing task and sends immediately
  const handleForceSendQueued = (textToSend: string) => {
    triggerHaptic([30, 50]);
    handleEmergencyStop();
    setQueuedPrompts(prev => prev.filter(p => p !== textToSend));
    setTimeout(() => {
      sendPromptDirect(textToSend);
    }, 250);
  };

  // Cancel / remove a specific queued prompt
  const handleCancelQueuedPrompt = (index: number) => {
    triggerHaptic(20);
    setQueuedPrompts(prev => prev.filter((_, i) => i !== index));
  };

  // Edit a queued prompt: pulls message into textarea and removes from queue
  const handleEditQueuedPrompt = (index: number, text: string) => {
    triggerHaptic(20);
    setQueuedPrompts(prev => prev.filter((_, i) => i !== index));
    setPromptText(text);
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
      }
    }, 50);
  };

  // Send Prompt to Antigravity
  const sendPrompt = (explicitText?: string) => {
    const text = (typeof explicitText === 'string' ? explicitText : promptText).trim();
    if (!text && attachedImages.length === 0 && !attachedAudio) return;

    if (isStreaming || Boolean(currentThinking) || isQueued) {
      handleQueuePrompt(text);
      return;
    }

    const textToSend = text;
    const imagesPayload = attachedImages.map(img => ({
      base64: img.base64,
      name: img.name,
    }));
    const audioPayload = attachedAudio ? {
      base64: attachedAudio.base64,
      mimeType: attachedAudio.mimeType,
      duration: attachedAudio.duration,
      name: attachedAudio.name,
    } : undefined;

    setPromptText('');
    setAttachedImages([]);
    setAttachedAudio(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    sendPromptDirect(textToSend, imagesPayload, audioPayload);
  };

  // Switch Conversation
  const switchConversation = (convId: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'client:switch_conversation',
          conversationId: convId,
        })
      );
    }
    setShowHistoryDrawer(false);
    triggerHaptic(25);
  };

  // Handle Photos / Camera Attachments
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    triggerHaptic(20);
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        const resultStr = reader.result as string;
        const base64 = resultStr.split(',')[1];
        setAttachedImages(prev => [
          ...prev,
          {
            preview: resultStr,
            name: file.name,
            base64,
          },
        ]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  // Extract modified files from pending approvals
  const modifiedFilesList = useMemo(() => {
    const files: { file: string; fullPath: string; isNew: boolean; ins: number; del: number }[] = [];
    for (const req of pendingApprovals) {
      if (req.gitChanges && req.gitChanges.length > 0) {
        for (const c of req.gitChanges) {
          if (!files.some(x => x.fullPath === c.relativePath)) {
            files.push({
              file: c.file,
              fullPath: c.relativePath,
              isNew: c.status === 'A' || c.status === '??',
              ins: c.insertions,
              del: c.deletions,
            });
          }
        }
      }
    }
    return files;
  }, [pendingApprovals]);

  // Collect terminal logs and artifacts
  const sessionStats = useMemo(() => {
    const terminalLogs: string[] = [];
    let hasArtifacts = false;

    chatMessages.forEach(msg => {
      if (msg.toolCall) {
        if (msg.toolCall.name === 'run_command' && msg.toolCall.args?.CommandLine) {
          terminalLogs.push(`$ ${msg.toolCall.args.CommandLine}`);
          if (msg.toolResult) {
            terminalLogs.push(typeof msg.toolResult === 'string' ? msg.toolResult : JSON.stringify(msg.toolResult, null, 2));
          }
        }
        if (msg.toolCall.name === 'generate_image' || msg.imageUrl || (msg.images && msg.images.length > 0)) {
          hasArtifacts = true;
        }
      }
    });

    return { terminalLogs, hasArtifacts };
  }, [chatMessages]);

  const toggleFolder = useCallback((folderKey: string) => {
    setExpandedFolders(prev => ({ ...prev, [folderKey]: !prev[folderKey] }));
    triggerHaptic(15);
  }, []);

  const handleOpenActionModal = useCallback((modal: 'diff' | 'terminal' | 'artifacts' | 'browser') => {
    setActiveActionModal(modal);
  }, []);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        background: '#141414',
        color: '#cccccc',
        position: 'relative',
        overflow: 'hidden',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {/* Top Header Bar */}
      <Header
        conversationTitle={conversationTitle}
        hasMessages={chatMessages.length > 0}
        activeActionModal={activeActionModal}
        onToggleExplorer={() => setActiveActionModal(activeActionModal === 'explorer' ? null : 'explorer')}
        onNewChat={() => {
          setChatMessages([]);
          setConversationTitle('New Conversation');
        }}
        onOpenHistory={() => {
          setShowHistoryDrawer(true);
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'client:list_conversations' }));
          }
        }}
        showOptionsDropdown={showOptionsDropdown}
        setShowOptionsDropdown={setShowOptionsDropdown}
        companionMode={companionMode}
        onToggleMode={toggleMode}
        executionPolicy={executionPolicy}
        onTogglePolicy={updateExecutionPolicy}
        onEmergencyStop={handleEmergencyStop}
        onOpenSettings={() => setShowSettingsModal(true)}
        connected={connected}
        host={host}
        ideStatus={ideStatus}
        isNativeApp={isNativeApp}
        apkUpdateAvailable={apkUpdateAvailable}
        apkUpdateProgress={apkUpdateProgress}
        onInstallApk={handleInstallApk}
        onSelectHost={(h, p) => {
          setHost(h);
          setPort(p);
          setReconnectTick(t => t + 1);
        }}
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspaceId}
        onSelectWorkspace={id => {
          setActiveWorkspaceId(id);
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'client:switch_workspace', workspaceId: id }));
          }
        }}
      />

      {/* Main Content Area */}
      <main
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          paddingLeft: 'max(14px, env(safe-area-inset-left, 0px))',
          paddingRight: 'max(14px, env(safe-area-inset-right, 0px))',
          paddingTop: '12px',
          paddingBottom: '220px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          boxSizing: 'border-box',
        }}
      >
        {chatMessages.length === 0 && pendingApprovals.length === 0 ? (
          <HomeScreen
            workspaces={workspaces}
            activeWorkspaceId={activeWorkspaceId}
            onSelectWorkspace={id => {
              setActiveWorkspaceId(id);
              if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: 'client:select_workspace', workspaceId: id }));
              }
            }}
            onOpenExplorer={() => setActiveActionModal('explorer')}
          />
        ) : (
          <>
            <ChatFeed
              chatMessages={chatMessages}
              expandedThoughts={expandedThoughts}
              setExpandedThoughts={setExpandedThoughts}
              onOpenModal={handleOpenActionModal}
              hasArtifacts={sessionStats.hasArtifacts}
              isStreaming={isStreaming}
              currentThinking={currentThinking}
              isCurrentThoughtExpanded={isCurrentThoughtExpanded}
              setIsCurrentThoughtExpanded={setIsCurrentThoughtExpanded}
              thinkingElapsed={thinkingElapsed}
              isQueued={isQueued}
              onDismissQueued={() => setIsQueued(false)}
            />

            <ApprovalCards
              pendingApprovals={pendingApprovals}
              onSendDecision={sendDecision}
              onClearAll={handleClearApprovals}
            />

            <div ref={chatBottomRef} style={{ height: '1px' }} />
          </>
        )}
      </main>

      {/* Persistent Bottom Prompt Dock */}
      <PromptDock
        promptText={promptText}
        setPromptText={setPromptText}
        isStreaming={isStreaming}
        currentThinking={currentThinking}
        isQueued={isQueued}
        connected={connected}
        companionMode={companionMode}
        executionPolicy={executionPolicy}
        selectedModel={selectedModel}
        setSelectedModel={setSelectedModel}
        attachedImages={attachedImages}
        setAttachedImages={setAttachedImages}
        attachedAudio={attachedAudio}
        setAttachedAudio={setAttachedAudio}
        queuedPrompts={queuedPrompts}
        setQueuedPrompts={setQueuedPrompts}
        onForceSendPrompt={handleForceSendQueued}
        onCancelQueuedPrompt={handleCancelQueuedPrompt}
        onEditQueuedPrompt={handleEditQueuedPrompt}
        quickActions={quickActions}
        onRunQuickAction={handleRunQuickAction}
        showFilesWithChanges={showFilesWithChanges}
        setShowFilesWithChanges={setShowFilesWithChanges}
        modifiedFilesList={modifiedFilesList}
        onAcceptAll={handleAcceptAll}
        onRejectAll={handleRejectAll}
        onSendPrompt={sendPrompt}
        onQueuePrompt={handleQueuePrompt}
        onEmergencyStop={handleEmergencyStop}
        fileInputRef={fileInputRef}
        textareaRef={textareaRef}
        onFileChange={handleFileChange}
      />

      {/* Global Fixed Bottom Status Bar */}
      <BottomStatusBar
        companionMode={companionMode}
        onToggleMode={m => toggleMode(m)}
        onOpenSettings={() => setShowSettingsModal(true)}
      />

      {/* History Slide-over Drawer */}
      <HistoryDrawer
        isOpen={showHistoryDrawer}
        onClose={() => setShowHistoryDrawer(false)}
        conversations={conversations}
        onSelectConversation={switchConversation}
      />

      {/* Multi-Domain Action Bottom Sheets / Modals */}
      <ActionModals
        activeActionModal={activeActionModal}
        onClose={() => setActiveActionModal(null)}
        expandedFolders={expandedFolders}
        onToggleFolder={toggleFolder}
        modifiedFilesList={modifiedFilesList}
        terminalLogs={sessionStats.terminalLogs}
        activeWorkspaceId={activeWorkspaceId}
        activeWorkspaceName={workspaces.find(w => w.id === activeWorkspaceId)?.name}
        host={host}
        port={port}
      />

      {/* Connection & Pairing Settings Screen */}
      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        host={host}
        setHost={setHost}
        port={port}
        setPort={setPort}
        onSaveAndReconnect={() => setReconnectTick(t => t + 1)}
        executionPolicy={executionPolicy}
        onUpdateExecutionPolicy={updateExecutionPolicy}
        companionMode={companionMode}
        onUpdateCompanionMode={m => toggleMode(m)}
        agentQuotas={agentQuotas}
      />
    </div>
  );
}
