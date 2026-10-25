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
  EditorTab,
  RecentProject,
  TerminalEntry,
  HostTelemetry,
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
import { WorkspaceView } from './components/WorkspaceView';
import { HomeScreen } from './components/HomeScreen';
import { ChatFeed } from './components/ChatFeed';
import { ApprovalCards } from './components/ApprovalCards';
import { PromptDock, AttachedAudio } from './components/PromptDock';
import { BottomStatusBar } from './components/BottomStatusBar';
import { HistoryDrawer } from './components/HistoryDrawer';
import { ActionModals } from './components/ActionModals';
import { SettingsModal } from './components/SettingsModal';
import { IdeSystemDialogModal, isIdeSystemDialog } from './components/IdeSystemDialogModal';
import { useCompanionSocket } from './hooks/useCompanionSocket';
import { getApiBaseUrl } from './utils/api';

export default function App() {
  // Check URL ticket or token on initial boot
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
      const rawToken = p.get('token');
      if (rawToken) {
        localStorage.setItem('agy_token', rawToken);
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
      if (saved) {
        return saved;
      }
      return (window.location.hostname && window.location.hostname !== 'localhost') ? window.location.hostname : '127.0.0.1';
    }
    return '127.0.0.1';
  });

  const [port, setPort] = useState<string>(() => {
    if (initialTicket) return initialTicket.port.toString();
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search);
      return p.get('port') || localStorage.getItem('agy_port') || (window.location.port ? window.location.port : '4040');
    }
    return '4040';
  });

  const [companionMode, setCompanionMode] = useState<CompanionMode>(() => {
    return (localStorage.getItem('agy_companion_mode') as CompanionMode) || 'remote';
  });
  const [quickActions, setQuickActions] = useState<QuickAction[]>([]);
  const [tailscaleIp, setTailscaleIp] = useState<string | null>(null);
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
  const [activeSessionBackup, setActiveSessionBackup] = useState<{ id: string; title: string; messages: ChatMessage[] } | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState<ApprovalRequest[]>([]);
  const [editorTabs, setEditorTabs] = useState<EditorTab[]>([]);
  const [selectedTabFile, setSelectedTabFile] = useState<{ path: string; name: string } | null>(null);
  const [activeSegment, setActiveSegment] = useState<'chat' | 'workspace'>('chat');

  // Active IDE System Modal Dialog (1:1 Antigravity Desktop-Fidelity popup)
  const activeDialog = useMemo(
    () => pendingApprovals.find(req => isIdeSystemDialog(req)),
    [pendingApprovals]
  );

  // Prompt & Input Dock States
  const [promptText, setPromptText] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [isQueued, setIsQueued] = useState<boolean>(false);
  const [attachedImages, setAttachedImages] = useState<{ preview: string; name: string; base64: string }[]>([]);
  const [attachedAudio, setAttachedAudio] = useState<AttachedAudio | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>('Gemini 3.8 Flash High');

  // Modals & Panels
  const [showHistoryDrawer, setShowHistoryDrawer] = useState<boolean>(false);
  const [showOptionsDropdown, setShowOptionsDropdown] = useState<boolean>(false);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [executionPolicy, setExecutionPolicy] = useState<ExecutionPolicy>(() => {
    return (localStorage.getItem('agy_execution_policy') as ExecutionPolicy) || 'force_ask';
  });
  const [agentQuotas, setAgentQuotas] = useState<AgentQuota[]>([]);
  const [activeActionModal, setActiveActionModal] = useState<'diff' | 'terminal' | 'artifacts' | 'browser' | 'explorer' | null>(null);
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const [terminalEntries, setTerminalEntries] = useState<TerminalEntry[]>([]);
  const [hostTelemetry, setHostTelemetry] = useState<HostTelemetry | null>(null);

  const getAuthToken = useCallback((): string => {
    if (typeof window === 'undefined') return '';
    const stored = localStorage.getItem('agy_token');
    if (stored) return stored;
    try {
      const p = new URLSearchParams(window.location.search);
      return p.get('token') || '';
    } catch {
      return '';
    }
  }, []);

  const getAuthHeaders = useCallback((): Record<string, string> => {
    const token = getAuthToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }, [getAuthToken]);

  const updateExecutionPolicy = (policy: ExecutionPolicy) => {
    setExecutionPolicy(policy);
    localStorage.setItem('agy_execution_policy', policy);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'client:set_execution_policy', policy }));
    } else {
      try {
        const httpBase = getApiBaseUrl(host, port);
        fetch(`${httpBase}/api/policy`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ policy }),
        }).catch(() => {});
      } catch {}
    }
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
  const mainRef = useRef<HTMLElement | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const speechRecognitionRef = useRef<any>(null);
  const pendingApprovalsRef = useRef(pendingApprovals);
  pendingApprovalsRef.current = pendingApprovals;
  const lastThinkingNotifyRef = useRef<number>(0);

  // Companion Socket Hook
  const {
    connected,
    authError,
    setAuthError,
    reconnectTick,
    setReconnectTick,
    sendClientMessage,
  } = useCompanionSocket({
    host,
    port,
    wsRef,
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
  });

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

  // Listen for Android hardware / gesture back button
  useEffect(() => {
    const handleAndroidBack = () => {
      if (showSettingsModal) {
        setShowSettingsModal(false);
      } else if (activeActionModal) {
        setActiveActionModal(null);
      } else if (showHistoryDrawer) {
        setShowHistoryDrawer(false);
      } else if (showOptionsDropdown) {
        setShowOptionsDropdown(false);
      } else {
        if ((window as any).AndroidHost?.minimizeApp) {
          (window as any).AndroidHost.minimizeApp();
        }
      }
    };
    window.addEventListener('android_back_pressed', handleAndroidBack);
    return () => window.removeEventListener('android_back_pressed', handleAndroidBack);
  }, [showSettingsModal, activeActionModal, showHistoryDrawer, showOptionsDropdown]);

  const isFirstMountRef = useRef(true);
  const userScrolledUpRef = useRef(false);

  // Track if user manually scrolled up inside the main container
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const handleScroll = () => {
      const maxScroll = el.scrollHeight - el.clientHeight;
      userScrolledUpRef.current = maxScroll - el.scrollTop > 120;
    };
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [activeSegment]);

  // When switching segments, scroll to bottom for chat and top for workspace
  useEffect(() => {
    if (activeSegment === 'chat') {
      userScrolledUpRef.current = false;
      const scrollDown = () => {
        if (mainRef.current) {
          mainRef.current.scrollTop = mainRef.current.scrollHeight;
        }
        chatBottomRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
      };
      scrollDown();
      const t1 = setTimeout(scrollDown, 30);
      const t2 = setTimeout(scrollDown, 120);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    } else if (activeSegment === 'workspace') {
      if (mainRef.current) {
        mainRef.current.scrollTop = 0;
      }
    }
  }, [activeSegment]);

  // Auto-scroll chat without jarring animated roll
  useEffect(() => {
    if (activeSegment !== 'chat' || !chatBottomRef.current) return;
    if (isFirstMountRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'auto', block: 'end' });
      isFirstMountRef.current = false;
      return;
    }
    if (!userScrolledUpRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'auto', block: 'end' });
    }
  }, [chatMessages.length, isStreaming, activeSegment]);

  // When a tool approval arrives, instantly switch to chat and scroll down
  useEffect(() => {
    if (pendingApprovals.length > 0) {
      if (activeSegment !== 'chat') {
        setActiveSegment('chat');
      }
      userScrolledUpRef.current = false;
      if (chatBottomRef.current) {
        chatBottomRef.current.scrollIntoView({ behavior: 'auto', block: 'end' });
      }
    }
  }, [pendingApprovals.length]);

  // Send Decision
  const sendDecision = useCallback((
    requestId: string,
    decision: 'allow' | 'deny',
    selectedOption: number = 1,
    customText: string = ''
  ) => {
    triggerHaptic(35);

    let reason: string | undefined = customText || undefined;
    let overrides: string[] | undefined;

    if (decision === 'deny' && !reason) {
      reason = 'Denied remotely via companion app';
    } else if (decision === 'allow') {
      if (selectedOption === 2) overrides = ['always_allow_session'];
      if (selectedOption === 3) overrides = ['always_allow_tool'];
    }

    const payload = {
      requestId,
      decision,
      reason,
      selectedOption,
      option: selectedOption,
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
      const httpBase = getApiBaseUrl(host, port);
      fetch(`${httpBase}/api/hook/approval`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      }).catch(() => {});
    } catch {}

    if (customText && customText.startsWith('User responded from mobile companion:')) {
      const cleanAnswer = customText.replace('User responded from mobile companion:', '').trim();
      setChatMessages(prev => [
        ...prev,
        {
          id: `ans_${Date.now()}`,
          role: 'user',
          content: cleanAnswer,
          timestamp: Date.now(),
        },
      ]);
    }

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
      const httpBase = getApiBaseUrl(host, port);
      fetch(`${httpBase}/api/approvals/clear`, {
        method: 'POST',
        headers: getAuthHeaders(),
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
  };

  const handleRejectAll = () => {
    triggerHaptic([60, 60]);
    pendingApprovals.forEach(req => {
      sendDecision(req.id, 'deny', 4, 'Rejected all changes');
    });
  };

  // Toggle Mode
  const toggleMode = (newMode: CompanionMode) => {
    setCompanionMode(newMode);
    localStorage.setItem('agy_companion_mode', newMode);
    triggerHaptic(30);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'client:set_mode',
          mode: newMode,
        })
      );
    } else {
      try {
        const httpBase = getApiBaseUrl(host, port);
        fetch(`${httpBase}/api/mode`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ mode: newMode }),
        }).catch(() => {});
      } catch {}
    }
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
    let wsDispatched = false;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(
          JSON.stringify({
            type: 'client:emergency_stop',
            workspaceId: activeWorkspaceId,
          })
        );
        wsDispatched = true;
      } catch {}
    }

    if (!wsDispatched) {
      try {
        const httpBase = getApiBaseUrl(host, port);
        fetch(`${httpBase}/api/stop`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ workspaceId: activeWorkspaceId }),
        }).catch(() => {});
      } catch {}
    }

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
      model: selectedModel,
    };

    let sentViaWs = false;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify(clientMsg));
        sentViaWs = true;
      } catch {}
    }

    if (!sentViaWs) {
      const httpBase = getApiBaseUrl(host, port);
      const token = getAuthToken();
      const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';

      fetch(`${httpBase}/api/prompt${tokenParam}`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          prompt: textToSend,
          workspaceId: activeWorkspaceId || 'default',
          images: imagesPayload,
          audio: audioPayload,
          model: selectedModel,
        }),
      }).catch(err => {
        console.warn('[Companion] HTTP prompt send error:', err);
      });
    }
  };

  const handleLaunchRecentProject = useCallback((projectPath: string) => {
    triggerHaptic(30);
    const baseName = projectPath.replace(/\\/g, '/').split('/').filter(Boolean).pop() || 'Project';
    setConversationTitle(`Opening ${baseName}...`);
    setChatMessages([]);
    setIsStreaming(false);
    setCurrentThinking(null);
    setActiveSegment('chat');
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'client:launch_project', path: projectPath }));
    } else {
      try {
        const httpBase = getApiBaseUrl(host, port);
        const token = getAuthToken();
        const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';
        fetch(`${httpBase}/api/workspace/launch${tokenParam}`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ path: projectPath }),
        }).catch(() => {});
      } catch {}
    }
  }, [host, port, getAuthHeaders, getAuthToken]);

  const handleCloseTab = useCallback((tab: EditorTab) => {
    triggerHaptic(15);
    setEditorTabs(prev => prev.filter(t => (t.path || t.label) !== (tab.path || tab.label)));
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'client:close_tab', path: tab.path, label: tab.label }));
    }
    try {
      const httpBase = getApiBaseUrl(host, port);
      const token = getAuthToken();
      const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';
      fetch(`${httpBase}/api/tabs/close${tokenParam}`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ path: tab.path, label: tab.label }),
      }).catch(() => {});
    } catch {}
  }, [host, port, getAuthHeaders, getAuthToken]);

  const handleCloseAllTabs = useCallback(() => {
    triggerHaptic(25);
    setEditorTabs([]);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'client:close_all_tabs' }));
    }
    try {
      const httpBase = getApiBaseUrl(host, port);
      const token = getAuthToken();
      const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';
      fetch(`${httpBase}/api/tabs/close-all${tokenParam}`, {
        method: 'POST',
        headers: getAuthHeaders(),
      }).catch(() => {});
    } catch {}
  }, [host, port, getAuthHeaders, getAuthToken]);

  const handleCloseIde = useCallback((providerId?: string) => {
    triggerHaptic(40);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'client:close_ide', providerId }));
    } else {
      try {
        const httpBase = getApiBaseUrl(host, port);
        const token = getAuthToken();
        const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';
        fetch(`${httpBase}/api/host/close-ide${tokenParam}`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ providerId: providerId || 'antigravity' }),
        }).catch(() => {});
      } catch {}
    }
  }, [host, port, getAuthHeaders, getAuthToken]);

  const handleRestartIde = useCallback((providerId?: string, workspacePath?: string) => {
    triggerHaptic(30);
    const targetPath = workspacePath || workspaces.find(w => w.id === activeWorkspaceId)?.path;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'client:restart_ide', providerId, workspacePath: targetPath }));
    } else {
      try {
        const httpBase = getApiBaseUrl(host, port);
        const token = getAuthToken();
        const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';
        fetch(`${httpBase}/api/host/restart-ide${tokenParam}`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ providerId: providerId || 'antigravity', workspacePath: targetPath, path: targetPath }),
        }).catch(() => {});
      } catch {}
    }
  }, [host, port, workspaces, activeWorkspaceId, getAuthHeaders, getAuthToken]);

  // Trigger in-app APK update or browser download
  const handleInstallApk = () => {
    triggerHaptic(30);
    const httpBase = getApiBaseUrl(host, port);
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

  const handleSelectTab = useCallback((tab: EditorTab) => {
    if (tab.path || tab.label) {
      setEditorTabs(prev =>
        prev.map(t => ({
          ...t,
          isActive: (t.path && tab.path ? t.path === tab.path : t.label === tab.label),
        }))
      );
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'client:open_editor_tab',
            path: tab.path || tab.label,
          })
        );
      }
    }
  }, []);

  const handleInspectTab = useCallback((tab: EditorTab) => {
    setSelectedTabFile({ path: tab.path || tab.label, name: tab.label });
    setActiveActionModal('explorer');
  }, []);

  const handleSelectSegment = useCallback((segment: 'chat' | 'workspace') => {
    setActiveSegment(segment);
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
          if (chatMessages.length > 0) {
            setActiveSessionBackup({
              id: activeWorkspaceId || 'active',
              title: conversationTitle,
              messages: chatMessages,
            });
          }
          setChatMessages([]);
          setConversationTitle('New Conversation');
        }}
        onOpenHistory={() => {
          setShowHistoryDrawer(true);
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'client:list_conversations', workspaceId: activeWorkspaceId }));
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
        recentProjects={recentProjects}
        onLaunchRecentProject={handleLaunchRecentProject}
        activeSegment={activeSegment}
        onSelectSegment={handleSelectSegment}
        openTabsCount={editorTabs.length}
        modifiedCount={modifiedFilesList.length}
        hostTelemetry={hostTelemetry}
        tailscaleIp={tailscaleIp}
        onCloseIde={handleCloseIde}
        onRestartIde={handleRestartIde}
      />


      {/* 401 Unauthorized Re-Pairing Banner */}
      {authError && !connected && (
        <div
          style={{
            margin: '8px 14px',
            background: '#1e1e1e',
            border: '1px solid rgba(239, 68, 68, 0.45)',
            borderRadius: '8px',
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444' }} />
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#ffffff' }}>
                Pairing Required (401 Unauthorized)
              </span>
            </div>
            <button
              onClick={() => setAuthError(false)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#858585',
                cursor: 'pointer',
                fontSize: '13px',
                padding: '2px 6px',
              }}
            >
              ✕
            </button>
          </div>
          <p style={{ margin: 0, fontSize: '11.5px', color: '#a0a0a0', lineHeight: '1.4' }}>
            The host PC rejected your remote connection. Please enter your pairing ticket in Settings to reconnect.
          </p>
          <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
            <button
              onClick={() => {
                triggerHaptic(20);
                setShowSettingsModal(true);
              }}
              style={{
                flex: 1,
                background: '#007acc',
                border: 'none',
                borderRadius: '6px',
                padding: '8px 12px',
                color: '#ffffff',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Open Pairing Settings
            </button>
            <button
              onClick={() => {
                triggerHaptic(20);
                setReconnectTick(t => t + 1);
              }}
              style={{
                background: '#282828',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '6px',
                padding: '8px 12px',
                color: '#cccccc',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main
        ref={mainRef}
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
        {activeSegment === 'workspace' ? (
          <>
            {pendingApprovals.length > 0 && (
              <div style={{ marginBottom: '4px' }}>
                <ApprovalCards
                  pendingApprovals={pendingApprovals}
                  onSendDecision={sendDecision}
                  onClearAll={handleClearApprovals}
                />
              </div>
            )}
            <WorkspaceView
            tabs={editorTabs}
            activeWorkspaceId={activeWorkspaceId}
            activeWorkspaceName={workspaces.find(w => w.id === activeWorkspaceId)?.name}
            onSelectTab={handleSelectTab}
            onInspectTab={handleInspectTab}
            modifiedFiles={modifiedFilesList}
            host={host}
            port={port}
            getAuthHeaders={getAuthHeaders}
            recentProjects={recentProjects}
            onLaunchRecentProject={handleLaunchRecentProject}
            onCloseTab={handleCloseTab}
            onCloseAllTabs={handleCloseAllTabs}
            onPreviewFile={(file) => {
              setSelectedTabFile(file);
              setActiveActionModal('explorer');
            }}
          />
        </>
      ) : chatMessages.length === 0 && pendingApprovals.length === 0 ? (
          <HomeScreen
            workspaces={workspaces}
            activeWorkspaceId={activeWorkspaceId}
            onSelectWorkspace={id => {
              setActiveWorkspaceId(id);
              if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: 'client:switch_workspace', workspaceId: id }));
              }
            }}
            onOpenExplorer={() => setActiveActionModal('explorer')}
            recentProjects={recentProjects}
            onLaunchRecentProject={handleLaunchRecentProject}
            activeConversation={
              activeSessionBackup
                ? {
                    id: activeSessionBackup.id,
                    title: activeSessionBackup.title,
                    messageCount: activeSessionBackup.messages.length,
                  }
                : null
            }
            onResumeActiveChat={() => {
              if (activeSessionBackup) {
                setChatMessages(activeSessionBackup.messages);
                setConversationTitle(activeSessionBackup.title);
                setActiveSessionBackup(null);
              } else if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: 'client:switch_workspace', workspaceId: activeWorkspaceId }));
              }
            }}
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
        onClose={() => {
          setActiveActionModal(null);
          setSelectedTabFile(null);
        }}
        expandedFolders={expandedFolders}
        onToggleFolder={toggleFolder}
        modifiedFilesList={modifiedFilesList}
        terminalLogs={sessionStats.terminalLogs}
        terminalEntries={terminalEntries}
        activeWorkspaceId={activeWorkspaceId}
        activeWorkspaceName={workspaces.find(w => w.id === activeWorkspaceId)?.name}
        host={host}
        port={port}
        initialOpenFile={selectedTabFile}
      />

      {/* 1:1 Antigravity Desktop-Fidelity System Modal Dialog (e.g. Save Unsaved Changes) */}
      {activeDialog && (
        <IdeSystemDialogModal
          request={activeDialog}
          onSendDecision={sendDecision}
        />
      )}

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
        hostTelemetry={hostTelemetry}
        onCloseIde={handleCloseIde}
        onRestartIde={handleRestartIde}
        onEmergencyStop={handleEmergencyStop}
        tailscaleIp={tailscaleIp}
      />
    </div>
  );
}
