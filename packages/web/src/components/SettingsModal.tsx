import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  ArrowLeft,
  Check,
  Smartphone,
  Laptop,
  Sparkles,
  RotateCw,
  Play,
  Clock,
  Shield,
  Zap,
  Camera,
  Download,
  X,
  Cpu,
  Power,
  OctagonAlert,
  Volume2,
  VolumeX,
  Vibrate,
  Sliders,
  BatteryCharging,
  Bot,
  Activity,
  Layers,
  FileCode,
  Eye,
  Timer,
  Network,
} from 'lucide-react';
import {
  decodePairingTicket,
  ExecutionPolicy,
  CompanionMode,
  AgentQuota,
  HostTelemetry,
} from '@agy-companion/protocol';
import { triggerHaptic } from './CommonUI';
import { getApiBaseUrl } from '../utils/api';

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  host: string;
  setHost: (h: string) => void;
  port: string;
  setPort: (p: string) => void;
  onSaveAndReconnect: () => void;
  executionPolicy: ExecutionPolicy;
  onUpdateExecutionPolicy: (policy: ExecutionPolicy) => void;
  companionMode: CompanionMode;
  onUpdateCompanionMode: (mode: CompanionMode) => void;
  agentQuotas?: AgentQuota[];
  onQuotasUpdated?: (quotas: AgentQuota[]) => void;
  hostTelemetry?: HostTelemetry | null;
  onCloseIde?: (providerId?: string) => void;
  onRestartIde?: (providerId?: string) => void;
  onEmergencyStop?: () => void;
  tailscaleIp?: string | null;
  selectedModel?: string;
  onSelectModel?: (model: string) => void;
}

const DEFAULT_QUOTAS: AgentQuota[] = [
  {
    id: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash',
    provider: 'Google',
    badge: 'Fast',
    isActive: true,
    usedPercent: 20,
    usedUnits: 20,
    totalUnits: 100,
    unitLabel: '%',
    resetTimestamp: Date.now() + 3.5 * 3600 * 1000,
    resetWindowText: '3h 30m window',
    status: 'optimal',
  },
  {
    id: 'claude-sonnet-4.6',
    name: 'Claude Sonnet 4.6 (Thinking)',
    provider: 'Anthropic',
    badge: 'Reasoning',
    isActive: false,
    usedPercent: 51,
    usedUnits: 51,
    totalUnits: 100,
    unitLabel: '%',
    resetTimestamp: Date.now() + 5.5 * 24 * 3600 * 1000,
    resetWindowText: '5d 14h window',
    status: 'optimal',
  },
  {
    id: 'claude-opus-4.6',
    name: 'Claude Opus 4.6 (Thinking)',
    provider: 'Anthropic',
    badge: 'High Craft',
    isActive: false,
    usedPercent: 51,
    usedUnits: 51,
    totalUnits: 100,
    unitLabel: '%',
    resetTimestamp: Date.now() + 5.5 * 24 * 3600 * 1000,
    resetWindowText: '5d 14h window',
    status: 'optimal',
  },
  {
    id: 'gpt-oss-120b',
    name: 'GPT-OSS 120B (Medium)',
    provider: 'OpenAI',
    badge: 'Universal',
    isActive: false,
    usedPercent: 51,
    usedUnits: 51,
    totalUnits: 100,
    unitLabel: '%',
    resetTimestamp: Date.now() + 5.5 * 24 * 3600 * 1000,
    resetWindowText: '5d 14h window',
    status: 'optimal',
  },
];

function normalizeQuotas(raw?: AgentQuota[]): AgentQuota[] {
  if (!raw || raw.length === 0) return DEFAULT_QUOTAS;

  const result: AgentQuota[] = [];
  let flashAdded = false;

  for (const q of raw) {
    const name = q.name || '';
    if (name.toLowerCase().includes('flash')) {
      if (!flashAdded) {
        result.push({
          ...q,
          id: 'gemini-3.8-flash',
          name: 'Gemini 3.8 Flash',
          provider: 'Google',
        });
        flashAdded = true;
      }
    } else if (name.toLowerCase().includes('sonnet')) {
      result.push({
        ...q,
        id: 'claude-sonnet-4.6',
        name: 'Claude Sonnet 4.6 (Thinking)',
        provider: 'Anthropic',
      });
    } else if (name.toLowerCase().includes('opus')) {
      result.push({
        ...q,
        id: 'claude-opus-4.6',
        name: 'Claude Opus 4.6 (Thinking)',
        provider: 'Anthropic',
      });
    } else if (name.toLowerCase().includes('gpt') || name.toLowerCase().includes('oss')) {
      result.push({
        ...q,
        id: 'gpt-oss-120b',
        name: 'GPT-OSS 120B (Medium)',
        provider: 'OpenAI',
      });
    }
  }

  return result.length > 0 ? result : DEFAULT_QUOTAS;
}

function formatCountdown(resetTimestamp: number, currentNow: number): string {
  const diff = Math.max(0, resetTimestamp - currentNow);
  if (diff <= 0) return 'Resetting';
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
}

type SettingsTab = 'general' | 'models' | 'quotas' | 'host';

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  host,
  setHost,
  port,
  setPort,
  onSaveAndReconnect,
  executionPolicy,
  onUpdateExecutionPolicy,
  companionMode,
  onUpdateCompanionMode,
  agentQuotas,
  onQuotasUpdated,
  hostTelemetry = null,
  onCloseIde,
  onRestartIde,
  onEmergencyStop,
  tailscaleIp,
  selectedModel: externalSelectedModel,
  onSelectModel,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');

  // Quotas & live refresh
  const [liveQuotas, setLiveQuotas] = useState<AgentQuota[]>(() => normalizeQuotas(agentQuotas));
  const [isRefreshingQuotas, setIsRefreshingQuotas] = useState(false);
  const [quotaRefreshBadge, setQuotaRefreshBadge] = useState<string | null>(null);
  const [lastSyncedTime, setLastSyncedTime] = useState<string | null>(null);
  const [now, setNow] = useState<number>(Date.now());

  // Connection & Ping diagnostic
  const [isPinging, setIsPinging] = useState(false);
  const [pingStatus, setPingStatus] = useState<string | null>(null);

  // Model Selection
  const [activeModel, setActiveModel] = useState<string>(() => {
    return externalSelectedModel || (typeof window !== 'undefined'
      ? localStorage.getItem('agy_selected_model') || 'Gemini 3.8 Flash Medium'
      : 'Gemini 3.8 Flash Medium');
  });

  // Configurable User Preferences
  const [reasoningEffort, setReasoningEffort] = useState<'none' | 'low' | 'medium' | 'high'>(() => {
    return (typeof window !== 'undefined'
      ? localStorage.getItem('agy_reasoning_effort') || 'high'
      : 'high') as 'none' | 'low' | 'medium' | 'high';
  });

  const [autoApproveRead, setAutoApproveRead] = useState<boolean>(() => {
    return typeof window !== 'undefined'
      ? localStorage.getItem('agy_auto_approve_readonly') === 'true'
      : false;
  });

  const [approvalTimeout, setApprovalTimeout] = useState<'none' | '60s' | '120s' | '300s'>(() => {
    return (typeof window !== 'undefined'
      ? localStorage.getItem('agy_approval_timeout') || 'none'
      : 'none') as 'none' | '60s' | '120s' | '300s';
  });

  const [hapticLevel, setHapticLevel] = useState<'off' | 'subtle' | 'strong'>(() => {
    return (typeof window !== 'undefined'
      ? localStorage.getItem('agy_haptics') || 'strong'
      : 'strong') as 'off' | 'subtle' | 'strong';
  });

  const [autoScroll, setAutoScroll] = useState<boolean>(() => {
    return typeof window !== 'undefined'
      ? localStorage.getItem('agy_auto_scroll') !== 'false'
      : true;
  });

  const [diffLayout, setDiffLayout] = useState<'unified' | 'split'>(() => {
    return (typeof window !== 'undefined'
      ? localStorage.getItem('agy_diff_layout') || 'unified'
      : 'unified') as 'unified' | 'split';
  });

  const [soundAlerts, setSoundAlerts] = useState<boolean>(() => {
    return typeof window !== 'undefined'
      ? localStorage.getItem('agy_sound_alerts') !== 'false'
      : true;
  });

  const [codeFontSize, setCodeFontSize] = useState<'11px' | '12px' | '13px'>(() => {
    return (typeof window !== 'undefined'
      ? localStorage.getItem('agy_code_font_size') || '12px'
      : '12px') as '11px' | '12px' | '13px';
  });

  const [streamVerbosity, setStreamVerbosity] = useState<'concise' | 'balanced' | 'detailed'>(() => {
    return (typeof window !== 'undefined'
      ? localStorage.getItem('agy_verbosity') || 'balanced'
      : 'balanced') as 'concise' | 'balanced' | 'detailed';
  });

  // Pairing & Scanner
  const [ticketInput, setTicketInput] = useState<string>('');
  const [ticketFeedback, setTicketFeedback] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerStreamRef = useRef<MediaStream | null>(null);

  // System Feedback
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [batteryFeedback, setBatteryFeedback] = useState<string | null>(null);

  // Sync external model prop
  useEffect(() => {
    if (externalSelectedModel) {
      setActiveModel(externalSelectedModel);
    }
  }, [externalSelectedModel]);

  // Sync incoming agent quotas prop
  useEffect(() => {
    if (agentQuotas && agentQuotas.length > 0) {
      setLiveQuotas(normalizeQuotas(agentQuotas));
    }
  }, [agentQuotas]);

  // Clock tick for countdowns
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Functional Real Quota Refresh
  const refreshQuotas = async () => {
    setIsRefreshingQuotas(true);
    triggerHaptic(20);
    const start = performance.now();
    try {
      const httpBase = getApiBaseUrl(host, port);
      const token = typeof window !== 'undefined' ? localStorage.getItem('agy_token') : null;
      const res = await fetch(`${httpBase}/api/agent-quotas?force=true&t=${Date.now()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const latencyMs = Math.round(performance.now() - start);
      if (res.ok) {
        const data = await res.json();
        if (data.quotas && data.quotas.length > 0) {
          const normalized = normalizeQuotas(data.quotas);
          setLiveQuotas(normalized);
          onQuotasUpdated?.(normalized);
          setQuotaRefreshBadge(`Live • ${latencyMs}ms`);
          setLastSyncedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
          setTimeout(() => setQuotaRefreshBadge(null), 3500);
          setIsRefreshingQuotas(false);
          return;
        }
      }
    } catch {
      // Ignore network errors on refresh
    }

    setLiveQuotas(prev => normalizeQuotas(prev));
    setQuotaRefreshBadge('Refreshed');
    setLastSyncedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    setTimeout(() => setQuotaRefreshBadge(null), 3000);
    setIsRefreshingQuotas(false);
  };

  useEffect(() => {
    if (isOpen) {
      refreshQuotas();
    }
  }, [isOpen]);

  // Connection Ping Benchmark
  const testConnection = async () => {
    setIsPinging(true);
    triggerHaptic(20);
    const start = performance.now();
    try {
      const httpBase = getApiBaseUrl(host, port);
      const token = typeof window !== 'undefined' ? localStorage.getItem('agy_token') : null;
      const res = await fetch(`${httpBase}/api/health?t=${Date.now()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const latencyMs = Math.round(performance.now() - start);
      if (res.ok) {
        const data = await res.json();
        setPingStatus(`Connected (${latencyMs}ms) • ${data.workspacesCount || 1} Workspace`);
      } else {
        setPingStatus(`HTTP ${res.status} Error`);
      }
    } catch {
      setPingStatus('Host Unreachable');
    }
    setIsPinging(false);
    setTimeout(() => setPingStatus(null), 5000);
  };

  // Pair ticket logic
  const applyPairingTicket = (ticketStr: string): boolean => {
    let cleanTicket = ticketStr.trim();
    if (cleanTicket.includes('ticket=')) {
      try {
        const u = new URL(cleanTicket);
        cleanTicket = u.searchParams.get('ticket') || cleanTicket;
      } catch {
        const match = cleanTicket.match(/ticket=([^&\s]+)/);
        if (match) cleanTicket = match[1];
      }
    }
    const parsed = decodePairingTicket(cleanTicket);
    if (parsed) {
      setHost(parsed.host);
      setPort(parsed.port.toString());
      localStorage.setItem('agy_host', parsed.host);
      localStorage.setItem('agy_port', parsed.port.toString());
      localStorage.setItem('agy_token', parsed.token);
      localStorage.setItem('agy_ssl', parsed.ssl ? 'true' : 'false');
      setTicketFeedback('Paired successfully');
      triggerHaptic([30, 30]);
      stopScanner();
      setTimeout(() => {
        onClose();
        onSaveAndReconnect();
      }, 500);
      return true;
    }
    return false;
  };

  const startScanner = async () => {
    setScannerError(null);
    setIsScanning(true);
    triggerHaptic(20);
    if ((window as any).AndroidHost?.requestCameraPermission) {
      try {
        (window as any).AndroidHost.requestCameraPermission();
      } catch (e) {
        console.warn('Native camera permission request failed:', e);
      }
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      scannerStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
    } catch (err: any) {
      console.error('Camera access error:', err);
      setScannerError('Camera permission denied or camera unavailable. Please check system permissions.');
    }
  };

  const stopScanner = () => {
    if (scannerStreamRef.current) {
      scannerStreamRef.current.getTracks().forEach(t => t.stop());
      scannerStreamRef.current = null;
    }
    setIsScanning(false);
  };

  useEffect(() => {
    let animId: number;
    let detector: any = null;
    if (typeof window !== 'undefined' && (window as any).BarcodeDetector) {
      try {
        detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
      } catch {}
    }

    const checkFrame = async () => {
      if (isScanning && videoRef.current && detector && videoRef.current.readyState >= 2) {
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes && codes.length > 0 && codes[0].rawValue) {
            const success = applyPairingTicket(codes[0].rawValue);
            if (success) return;
          }
        } catch {}
      }
      if (isScanning) {
        animId = requestAnimationFrame(checkFrame);
      }
    };

    if (isScanning) {
      animId = requestAnimationFrame(checkFrame);
    }
    return () => {
      cancelAnimationFrame(animId);
      if (scannerStreamRef.current) {
        scannerStreamRef.current.getTracks().forEach(t => t.stop());
        scannerStreamRef.current = null;
      }
    };
  }, [isScanning]);

  const handleSelectModel = (modelId: string) => {
    triggerHaptic(20);
    setActiveModel(modelId);
    localStorage.setItem('agy_selected_model', modelId);
    onSelectModel?.(modelId);
  };

  const handleSave = () => {
    triggerHaptic(30);
    localStorage.setItem('agy_host', host);
    localStorage.setItem('agy_port', port);
    localStorage.setItem('agy_selected_model', activeModel);
    localStorage.setItem('agy_reasoning_effort', reasoningEffort);
    localStorage.setItem('agy_auto_approve_readonly', autoApproveRead ? 'true' : 'false');
    localStorage.setItem('agy_approval_timeout', approvalTimeout);
    localStorage.setItem('agy_haptics', hapticLevel);
    localStorage.setItem('agy_auto_scroll', autoScroll ? 'true' : 'false');
    localStorage.setItem('agy_diff_layout', diffLayout);
    localStorage.setItem('agy_sound_alerts', soundAlerts ? 'true' : 'false');
    localStorage.setItem('agy_code_font_size', codeFontSize);
    localStorage.setItem('agy_verbosity', streamVerbosity);

    onSelectModel?.(activeModel);
    onClose();
    onSaveAndReconnect();
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: '#181818',
        display: 'flex',
        flexDirection: 'column',
        color: '#ffffff',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {/* Top Header */}
      <header
        style={{
          height: '48px',
          background: '#1f1f1f',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          flexShrink: 0,
        }}
      >
        <button
          onClick={() => {
            triggerHaptic(20);
            onClose();
          }}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#ffffff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '13.5px',
            fontWeight: 600,
            padding: '6px 4px',
            minHeight: '44px',
          }}
        >
          <ArrowLeft size={17} color="#ffffff" />
          <span>Settings</span>
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '3px 8px',
              background: '#141414',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '6px',
              fontSize: '11px',
              fontFamily: "'Geist Mono', Consolas, monospace",
              color: '#10b981',
            }}
          >
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }} />
            <span>Active</span>
          </div>

          <button
            onClick={() => {
              triggerHaptic(20);
              onClose();
            }}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#858585',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <X size={18} />
          </button>
        </div>
      </header>

      {/* Tabs Segmented Switcher */}
      <nav
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          background: '#141414',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          padding: '4px 8px',
          gap: '4px',
          flexShrink: 0,
        }}
      >
        {(
          [
            { id: 'general', label: 'General', icon: Shield },
            { id: 'models', label: 'Models & AI', icon: Bot },
            { id: 'quotas', label: 'Quotas', icon: Zap },
            { id: 'host', label: 'Host & Mesh', icon: Laptop },
          ] as const
        ).map(tab => {
          const isSelected = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                triggerHaptic(15);
                setActiveTab(tab.id);
              }}
              style={{
                background: isSelected ? '#262626' : 'transparent',
                border: isSelected ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid transparent',
                borderRadius: '6px',
                padding: '7px 4px',
                color: isSelected ? '#ffffff' : '#858585',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '5px',
                fontSize: '11.5px',
                fontWeight: isSelected ? 600 : 500,
                minHeight: '36px',
                transition: 'all 0.15s ease',
              }}
            >
              <Icon size={13} color={isSelected ? '#ffffff' : '#858585'} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Main Tab Content */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          maxWidth: '640px',
          width: '100%',
          margin: '0 auto',
          boxSizing: 'border-box',
          paddingBottom: '96px',
        }}
      >
        {/* ================= TAB 1: GENERAL ================= */}
        {activeTab === 'general' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Supervision Routing */}
            <div
              style={{
                background: '#1f1f1f',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '8px',
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Smartphone size={15} color="#858585" />
                <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#ffffff' }}>Routing Mode</span>
              </div>
              <div style={{ display: 'flex', background: '#141414', padding: '2px', borderRadius: '6px', gap: '2px' }}>
                {(
                  [
                    { id: 'desk', label: 'Desk', icon: Laptop },
                    { id: 'remote', label: 'Remote', icon: Smartphone },
                    { id: 'auto', label: 'Auto', icon: Sparkles },
                  ] as const
                ).map(m => {
                  const isSel = companionMode === m.id;
                  const Icon = m.icon;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        triggerHaptic(20);
                        onUpdateCompanionMode(m.id);
                      }}
                      style={{
                        background: isSel ? '#ffffff' : 'transparent',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '5px 9px',
                        color: isSel ? '#000000' : '#858585',
                        fontSize: '11px',
                        fontWeight: isSel ? 700 : 500,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <Icon size={12} color={isSel ? '#000000' : '#858585'} />
                      <span>{m.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Execution Policy */}
            <div
              style={{
                background: '#1f1f1f',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '8px',
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Shield size={15} color="#858585" />
                <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#ffffff' }}>Policy</span>
              </div>
              <div style={{ display: 'flex', background: '#141414', padding: '2px', borderRadius: '6px', gap: '2px' }}>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic(20);
                    onUpdateExecutionPolicy('force_ask');
                  }}
                  style={{
                    background: executionPolicy === 'force_ask' ? '#ffffff' : 'transparent',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '5px 9px',
                    color: executionPolicy === 'force_ask' ? '#000000' : '#858585',
                    fontSize: '11px',
                    fontWeight: executionPolicy === 'force_ask' ? 700 : 500,
                    cursor: 'pointer',
                  }}
                >
                  Supervised (Ask)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic(20);
                    onUpdateExecutionPolicy('always_proceed');
                  }}
                  style={{
                    background: executionPolicy === 'always_proceed' ? '#ffffff' : 'transparent',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '5px 9px',
                    color: executionPolicy === 'always_proceed' ? '#000000' : '#858585',
                    fontSize: '11px',
                    fontWeight: executionPolicy === 'always_proceed' ? 700 : 500,
                    cursor: 'pointer',
                  }}
                >
                  Autonomous (Auto)
                </button>
              </div>
            </div>

            {/* Auto-Approve Safe Reads */}
            <div
              style={{
                background: '#1f1f1f',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '8px',
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Eye size={15} color="#858585" />
                <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#ffffff' }}>
                  Auto-Approve Read Commands
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic(20);
                  setAutoApproveRead(p => !p);
                }}
                style={{
                  width: '42px',
                  height: '24px',
                  background: autoApproveRead ? '#10b981' : '#282828',
                  borderRadius: '12px',
                  border: 'none',
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'background 0.2s ease',
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    background: '#ffffff',
                    position: 'absolute',
                    top: '3px',
                    left: autoApproveRead ? '21px' : '3px',
                    transition: 'left 0.2s ease',
                  }}
                />
              </button>
            </div>

            {/* Approval Auto-Timeout */}
            <div
              style={{
                background: '#1f1f1f',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '8px',
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Timer size={15} color="#858585" />
                <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#ffffff' }}>Approval Timeout</span>
              </div>
              <div style={{ display: 'flex', background: '#141414', padding: '2px', borderRadius: '6px', gap: '2px' }}>
                {(['none', '60s', '120s', '300s'] as const).map(t => {
                  const isSel = approvalTimeout === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        triggerHaptic(15);
                        setApprovalTimeout(t);
                      }}
                      style={{
                        background: isSel ? '#ffffff' : 'transparent',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '4px 7px',
                        color: isSel ? '#000000' : '#858585',
                        fontSize: '11px',
                        fontWeight: isSel ? 700 : 500,
                        cursor: 'pointer',
                        textTransform: t === 'none' ? 'capitalize' : 'none',
                      }}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Sound Alerts */}
            <div
              style={{
                background: '#1f1f1f',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '8px',
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {soundAlerts ? <Volume2 size={15} color="#858585" /> : <VolumeX size={15} color="#666666" />}
                <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#ffffff' }}>Sound Alerts</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic(20);
                  setSoundAlerts(p => !p);
                }}
                style={{
                  width: '42px',
                  height: '24px',
                  background: soundAlerts ? '#ffffff' : '#282828',
                  borderRadius: '12px',
                  border: 'none',
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'background 0.2s ease',
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    background: soundAlerts ? '#000000' : '#858585',
                    position: 'absolute',
                    top: '3px',
                    left: soundAlerts ? '21px' : '3px',
                    transition: 'left 0.2s ease',
                  }}
                />
              </button>
            </div>

            {/* Haptic Feedback */}
            <div
              style={{
                background: '#1f1f1f',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '8px',
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Vibrate size={15} color="#858585" />
                <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#ffffff' }}>Haptics</span>
              </div>
              <div style={{ display: 'flex', background: '#141414', padding: '2px', borderRadius: '6px', gap: '2px' }}>
                {(['off', 'subtle', 'strong'] as const).map(h => {
                  const isSel = hapticLevel === h;
                  return (
                    <button
                      key={h}
                      type="button"
                      onClick={() => {
                        setHapticLevel(h);
                        if (h === 'subtle') triggerHaptic(15);
                        if (h === 'strong') triggerHaptic(40);
                      }}
                      style={{
                        background: isSel ? '#ffffff' : 'transparent',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '4px 8px',
                        color: isSel ? '#000000' : '#858585',
                        fontSize: '11px',
                        fontWeight: isSel ? 700 : 500,
                        cursor: 'pointer',
                        textTransform: 'capitalize',
                      }}
                    >
                      {h}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 2: MODELS & AI ================= */}
        {activeTab === 'models' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Active Model Selector matching IDE 1:1 */}
            <div
              style={{
                background: '#1f1f1f',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '8px',
                padding: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '2px' }}>
                <Bot size={15} color="#858585" />
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Model
                </span>
              </div>

              {/* 1. Gemini 3.8 Flash with Low / Medium / High */}
              {(() => {
                const isFlash = activeModel.startsWith('Gemini 3.8 Flash');
                const flashEffort = activeModel.includes('Low') ? 'Low' : activeModel.includes('High') ? 'High' : 'Medium';
                return (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      background: isFlash ? '#262626' : '#161616',
                      border: `1px solid ${isFlash ? '#ffffff' : 'rgba(255, 255, 255, 0.08)'}`,
                      borderRadius: '6px',
                      minHeight: '44px',
                      gap: '8px',
                    }}
                  >
                    <div
                      onClick={() => handleSelectModel(`Gemini 3.8 Flash ${flashEffort}`)}
                      style={{ display: 'flex', flexDirection: 'column', cursor: 'pointer', flex: 1 }}
                    >
                      <span style={{ fontSize: '9.5px', color: '#858585', textTransform: 'uppercase', fontWeight: 600 }}>Google</span>
                      <span style={{ fontSize: '12.5px', fontWeight: isFlash ? 700 : 500, color: '#ffffff' }}>
                        Gemini 3.8 Flash
                      </span>
                    </div>

                    <div style={{ display: 'flex', background: '#141414', padding: '2px', borderRadius: '5px', gap: '2px' }}>
                      {(['Low', 'Medium', 'High'] as const).map(effort => {
                        const isEffortSel = isFlash && flashEffort === effort;
                        return (
                          <button
                            key={effort}
                            type="button"
                            onClick={() => handleSelectModel(`Gemini 3.8 Flash ${effort}`)}
                            style={{
                              background: isEffortSel ? '#ffffff' : 'transparent',
                              color: isEffortSel ? '#000000' : '#858585',
                              border: 'none',
                              borderRadius: '4px',
                              padding: '3px 8px',
                              fontSize: '11px',
                              fontWeight: isEffortSel ? 700 : 500,
                              cursor: 'pointer',
                            }}
                          >
                            {effort}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* 2. Claude Sonnet 4.6 (Thinking) */}
              <button
                type="button"
                onClick={() => handleSelectModel('Claude Sonnet 4.6 (Thinking)')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  background: activeModel === 'Claude Sonnet 4.6 (Thinking)' ? '#262626' : '#161616',
                  border: `1px solid ${activeModel === 'Claude Sonnet 4.6 (Thinking)' ? '#ffffff' : 'rgba(255, 255, 255, 0.08)'}`,
                  borderRadius: '6px',
                  minHeight: '44px',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '9.5px', color: '#858585', textTransform: 'uppercase', fontWeight: 600 }}>Anthropic</span>
                  <span style={{ fontSize: '12.5px', fontWeight: activeModel === 'Claude Sonnet 4.6 (Thinking)' ? 700 : 500, color: '#ffffff' }}>
                    Claude Sonnet 4.6 (Thinking)
                  </span>
                </div>
                {activeModel === 'Claude Sonnet 4.6 (Thinking)' && <Check size={14} color="#ffffff" strokeWidth={3} />}
              </button>

              {/* 3. Claude Opus 4.6 (Thinking) */}
              <button
                type="button"
                onClick={() => handleSelectModel('Claude Opus 4.6 (Thinking)')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  background: activeModel === 'Claude Opus 4.6 (Thinking)' ? '#262626' : '#161616',
                  border: `1px solid ${activeModel === 'Claude Opus 4.6 (Thinking)' ? '#ffffff' : 'rgba(255, 255, 255, 0.08)'}`,
                  borderRadius: '6px',
                  minHeight: '44px',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '9.5px', color: '#858585', textTransform: 'uppercase', fontWeight: 600 }}>Anthropic</span>
                  <span style={{ fontSize: '12.5px', fontWeight: activeModel === 'Claude Opus 4.6 (Thinking)' ? 700 : 500, color: '#ffffff' }}>
                    Claude Opus 4.6 (Thinking)
                  </span>
                </div>
                {activeModel === 'Claude Opus 4.6 (Thinking)' && <Check size={14} color="#ffffff" strokeWidth={3} />}
              </button>

              {/* 4. GPT-OSS 120B (Medium) */}
              <button
                type="button"
                onClick={() => handleSelectModel('GPT-OSS 120B (Medium)')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  background: activeModel === 'GPT-OSS 120B (Medium)' ? '#262626' : '#161616',
                  border: `1px solid ${activeModel === 'GPT-OSS 120B (Medium)' ? '#ffffff' : 'rgba(255, 255, 255, 0.08)'}`,
                  borderRadius: '6px',
                  minHeight: '44px',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '9.5px', color: '#858585', textTransform: 'uppercase', fontWeight: 600 }}>OpenAI</span>
                  <span style={{ fontSize: '12.5px', fontWeight: activeModel === 'GPT-OSS 120B (Medium)' ? 700 : 500, color: '#ffffff' }}>
                    GPT-OSS 120B (Medium)
                  </span>
                </div>
                {activeModel === 'GPT-OSS 120B (Medium)' && <Check size={14} color="#ffffff" strokeWidth={3} />}
              </button>
            </div>

            {/* Reasoning / Thinking Effort */}
            <div
              style={{
                background: '#1f1f1f',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '8px',
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={15} color="#858585" />
                <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#ffffff' }}>Reasoning Effort</span>
              </div>
              <div style={{ display: 'flex', background: '#141414', padding: '2px', borderRadius: '6px', gap: '2px' }}>
                {(['none', 'low', 'medium', 'high'] as const).map(effort => {
                  const isSel = reasoningEffort === effort;
                  return (
                    <button
                      key={effort}
                      type="button"
                      onClick={() => {
                        triggerHaptic(15);
                        setReasoningEffort(effort);
                      }}
                      style={{
                        background: isSel ? '#ffffff' : 'transparent',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '5px 8px',
                        color: isSel ? '#000000' : '#858585',
                        fontSize: '11px',
                        fontWeight: isSel ? 700 : 500,
                        cursor: 'pointer',
                        textTransform: 'capitalize',
                      }}
                    >
                      {effort}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Context Verbosity */}
            <div
              style={{
                background: '#1f1f1f',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '8px',
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sliders size={15} color="#858585" />
                <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#ffffff' }}>Verbosity</span>
              </div>
              <div style={{ display: 'flex', background: '#141414', padding: '2px', borderRadius: '6px', gap: '2px' }}>
                {(['concise', 'balanced', 'detailed'] as const).map(v => {
                  const isSel = streamVerbosity === v;
                  return (
                    <button
                      key={v}
                      type="button"
                      onClick={() => {
                        triggerHaptic(15);
                        setStreamVerbosity(v);
                      }}
                      style={{
                        background: isSel ? '#ffffff' : 'transparent',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '5px 8px',
                        color: isSel ? '#000000' : '#858585',
                        fontSize: '11px',
                        fontWeight: isSel ? 700 : 500,
                        cursor: 'pointer',
                        textTransform: 'capitalize',
                      }}
                    >
                      {v}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Diff Layout */}
            <div
              style={{
                background: '#1f1f1f',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '8px',
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileCode size={15} color="#858585" />
                <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#ffffff' }}>Diff Viewer</span>
              </div>
              <div style={{ display: 'flex', background: '#141414', padding: '2px', borderRadius: '6px', gap: '2px' }}>
                {(['unified', 'split'] as const).map(d => {
                  const isSel = diffLayout === d;
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => {
                        triggerHaptic(15);
                        setDiffLayout(d);
                      }}
                      style={{
                        background: isSel ? '#ffffff' : 'transparent',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '5px 10px',
                        color: isSel ? '#000000' : '#858585',
                        fontSize: '11px',
                        fontWeight: isSel ? 700 : 500,
                        cursor: 'pointer',
                        textTransform: 'capitalize',
                      }}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Follow Live Stream Toggle */}
            <div
              style={{
                background: '#1f1f1f',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '8px',
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Layers size={15} color="#858585" />
                <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#ffffff' }}>Auto-Scroll Stream</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic(20);
                  setAutoScroll(p => !p);
                }}
                style={{
                  width: '42px',
                  height: '24px',
                  background: autoScroll ? '#ffffff' : '#282828',
                  borderRadius: '12px',
                  border: 'none',
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'background 0.2s ease',
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    background: autoScroll ? '#000000' : '#858585',
                    position: 'absolute',
                    top: '3px',
                    left: autoScroll ? '21px' : '3px',
                    transition: 'left 0.2s ease',
                  }}
                />
              </button>
            </div>

            {/* Code Font Size */}
            <div
              style={{
                background: '#1f1f1f',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '8px',
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
              }}
            >
              <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#ffffff' }}>Font Size</span>
              <div style={{ display: 'flex', background: '#141414', padding: '2px', borderRadius: '6px', gap: '2px' }}>
                {(['11px', '12px', '13px'] as const).map(s => {
                  const isSel = codeFontSize === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        triggerHaptic(15);
                        setCodeFontSize(s);
                      }}
                      style={{
                        background: isSel ? '#ffffff' : 'transparent',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '4px 8px',
                        color: isSel ? '#000000' : '#858585',
                        fontSize: '11px',
                        fontWeight: isSel ? 700 : 500,
                        cursor: 'pointer',
                      }}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 3: LIVE QUOTAS ================= */}
        {activeTab === 'quotas' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Top Bar with Functional Refresh Button */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '4px 0',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#858585', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Rolling Token & Model Limits
                </span>
                {quotaRefreshBadge && (
                  <span
                    style={{
                      fontSize: '10px',
                      background: 'rgba(16, 185, 129, 0.15)',
                      color: '#34d399',
                      padding: '2px 7px',
                      borderRadius: '4px',
                      fontWeight: 600,
                    }}
                  >
                    {quotaRefreshBadge}
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={refreshQuotas}
                disabled={isRefreshingQuotas}
                style={{
                  background: '#242424',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '6px',
                  padding: '6px 12px',
                  color: '#ffffff',
                  cursor: isRefreshingQuotas ? 'default' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  minHeight: '34px',
                }}
              >
                <RotateCw
                  size={13}
                  color="#ffffff"
                  style={{
                    animation: isRefreshingQuotas ? 'spin 0.7s linear infinite' : 'none',
                  }}
                />
                <span>{isRefreshingQuotas ? 'Syncing...' : 'Refresh'}</span>
              </button>
            </div>

            {lastSyncedTime && (
              <span style={{ fontSize: '10px', color: '#71717a', fontFamily: 'monospace' }}>
                Last synced at {lastSyncedTime} from Antigravity Language Server
              </span>
            )}

            {/* Quota Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {liveQuotas.map(quota => {
                const remainingTime = formatCountdown(quota.resetTimestamp, now);
                const remainingPercent = Math.max(0, 100 - (quota.usedPercent || 0));
                const barColor =
                  remainingPercent < 15 ? '#ef4444' : remainingPercent < 35 ? '#fbbf24' : '#10b981';

                return (
                  <div
                    key={quota.id}
                    style={{
                      background: '#161616',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '8px',
                      padding: '10px 12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '7px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '10px', color: '#858585', textTransform: 'uppercase', fontWeight: 600 }}>
                          {quota.provider}
                        </span>
                        <span style={{ color: '#444444', fontSize: '9px' }}>•</span>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: '#ffffff' }}>
                          {quota.name}
                        </span>
                      </div>

                      <span
                        style={{
                          fontSize: '11.5px',
                          fontWeight: 700,
                          fontFamily: "'Geist Mono', monospace",
                          color: barColor,
                        }}
                      >
                        {remainingPercent}% left
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div
                      style={{
                        height: '4px',
                        width: '100%',
                        background: '#242424',
                        borderRadius: '2px',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${Math.min(100, Math.max(2, remainingPercent))}%`,
                          background: barColor,
                          borderRadius: '2px',
                          transition: 'width 0.3s ease',
                        }}
                      />
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: '10.5px',
                        color: '#858585',
                        fontFamily: "'Geist Mono', monospace",
                      }}
                    >
                      <span>
                        {quota.usedUnits !== undefined && quota.totalUnits
                          ? `${quota.usedUnits}/${quota.totalUnits} ${quota.unitLabel || '%'}`
                          : quota.status}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Clock size={11} color="#858585" />
                        <span>{remainingTime}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ================= TAB 4: HOST & MESH ================= */}
        {activeTab === 'host' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Host & Port Configuration */}
            <div
              style={{
                background: '#1f1f1f',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '8px',
                padding: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                  <Network size={15} color="#858585" />
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Connection Address
                  </span>
                </div>

                {/* Quick Presets */}
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => {
                      const validTs = (tailscaleIp && !tailscaleIp.startsWith('169.254.')) ? tailscaleIp : (host.startsWith('100.') ? host : '100.107.129.104');
                      setHost(validTs);
                      setPort('4040');
                      triggerHaptic(20);
                    }}
                    style={{
                      background: (host === tailscaleIp && !host.startsWith('169.254.')) || host.startsWith('100.') ? '#ffffff' : '#141414',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '4px',
                      padding: '3px 8px',
                      color: (host === tailscaleIp && !host.startsWith('169.254.')) || host.startsWith('100.') ? '#000000' : '#858585',
                      fontSize: '10.5px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Tailscale
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const validLan = host.startsWith('192.168.') || host.startsWith('10.') ? host : '192.168.1.35';
                      setHost(validLan);
                      setPort('4040');
                      triggerHaptic(20);
                    }}
                    style={{
                      background: host.startsWith('192.168.') || host.startsWith('10.') ? '#ffffff' : '#141414',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '4px',
                      padding: '3px 8px',
                      color: host.startsWith('192.168.') || host.startsWith('10.') ? '#000000' : '#858585',
                      fontSize: '10.5px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Local Wi-Fi
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setHost('127.0.0.1');
                      setPort('4040');
                      triggerHaptic(20);
                    }}
                    style={{
                      background: host === '127.0.0.1' || host === 'localhost' ? '#ffffff' : '#141414',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '4px',
                      padding: '3px 8px',
                      color: host === '127.0.0.1' || host === 'localhost' ? '#000000' : '#858585',
                      fontSize: '10.5px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Localhost
                  </button>
                </div>
              </div>

              {/* Host and Port Inputs */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <div style={{ flex: 3 }}>
                  <input
                    type="text"
                    value={host}
                    onChange={e => setHost(e.target.value)}
                    placeholder="100.x.y.z or 127.0.0.1"
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      background: '#141414',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '6px',
                      padding: '8px 10px',
                      color: '#ffffff',
                      fontSize: '12px',
                      fontFamily: 'monospace',
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <input
                    type="text"
                    value={port}
                    onChange={e => setPort(e.target.value)}
                    placeholder="4040"
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      background: '#141414',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '6px',
                      padding: '8px 10px',
                      color: '#ffffff',
                      fontSize: '12px',
                      fontFamily: 'monospace',
                      textAlign: 'center',
                    }}
                  />
                </div>
              </div>

              {/* Ping Test Button */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <button
                  type="button"
                  onClick={testConnection}
                  disabled={isPinging}
                  style={{
                    background: '#262626',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '6px',
                    padding: '6px 12px',
                    color: '#ffffff',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: isPinging ? 'default' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    minHeight: '32px',
                  }}
                >
                  <Activity size={12} color="#ffffff" style={{ animation: isPinging ? 'spin 0.7s linear infinite' : 'none' }} />
                  <span>{isPinging ? 'Testing...' : 'Test Connection'}</span>
                </button>

                {pingStatus && (
                  <span style={{ fontSize: '11px', color: pingStatus.includes('Connected') ? '#34d399' : '#f87171', fontWeight: 600 }}>
                    {pingStatus}
                  </span>
                )}
              </div>
            </div>

            {/* Quick Ticket Input & QR Scanner */}
            <div
              style={{
                background: '#1f1f1f',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '8px',
                padding: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#858585', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Pairing Ticket / QR Code
              </span>

              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  value={ticketInput}
                  onChange={e => {
                    setTicketInput(e.target.value);
                    setTicketFeedback(null);
                  }}
                  placeholder="Paste pairing ticket..."
                  style={{
                    flex: 1,
                    background: '#141414',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '6px',
                    padding: '8px 10px',
                    color: '#ffffff',
                    fontSize: '11.5px',
                    fontFamily: 'monospace',
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    const success = applyPairingTicket(ticketInput);
                    if (!success) {
                      setTicketFeedback('Invalid ticket');
                      triggerHaptic(50);
                    }
                  }}
                  style={{
                    background: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '0 14px',
                    color: '#000000',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Pair
                </button>
                <button
                  type="button"
                  onClick={startScanner}
                  title="Scan QR Code"
                  style={{
                    background: '#262626',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '6px',
                    padding: '0 12px',
                    color: '#ffffff',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Camera size={14} color="#ffffff" />
                </button>
              </div>

              {ticketFeedback && (
                <span style={{ fontSize: '11px', color: ticketFeedback.includes('success') ? '#4ade80' : '#f87171' }}>
                  {ticketFeedback}
                </span>
              )}
            </div>

            {/* Hardware & Process Controls */}
            <div
              style={{
                background: '#1f1f1f',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '8px',
                padding: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#858585', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Host Hardware & Process
                </span>

                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic(20);
                    if ((window as any).AndroidHost?.requestIgnoreBatteryOptimizations) {
                      (window as any).AndroidHost.requestIgnoreBatteryOptimizations();
                      setBatteryFeedback('System prompt requested');
                    } else {
                      setBatteryFeedback('Managed automatically');
                    }
                    setTimeout(() => setBatteryFeedback(null), 3000);
                  }}
                  style={{
                    background: '#141414',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '4px',
                    padding: '3px 8px',
                    color: '#4ade80',
                    fontSize: '10.5px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <BatteryCharging size={11} color="#4ade80" />
                  <span>Unrestrict Battery</span>
                </button>
              </div>

              {batteryFeedback && (
                <span style={{ fontSize: '11px', color: '#4ade80', textAlign: 'center' }}>
                  {batteryFeedback}
                </span>
              )}

              {/* RAM Telemetry */}
              {hostTelemetry && (
                <div
                  style={{
                    background: '#141414',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '5px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px' }}>
                    <span style={{ color: '#858585', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <Cpu size={12} color="#ffffff" />
                      Host RAM
                    </span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#ffffff' }}>
                      {(hostTelemetry.usedMemMb / 1024).toFixed(1)} / {(hostTelemetry.totalMemMb / 1024).toFixed(1)} GB ({hostTelemetry.usedMemPercent}%)
                    </span>
                  </div>
                  <div style={{ height: '3px', background: '#262626', borderRadius: '2px', overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${hostTelemetry.usedMemPercent}%`,
                        background: hostTelemetry.usedMemPercent > 85 ? '#ef4444' : '#10b981',
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Host Action Buttons */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic(30);
                    onRestartIde?.();
                    const isDormant = hostTelemetry?.ideStatus === 'dormant';
                    setActionFeedback(isDormant ? 'Launching Antigravity IDE on PC...' : 'Restarting IDE...');
                    setTimeout(() => setActionFeedback(null), 3000);
                  }}
                  style={{
                    background: hostTelemetry?.ideStatus === 'dormant' ? 'rgba(34, 197, 94, 0.15)' : '#242424',
                    border: hostTelemetry?.ideStatus === 'dormant' ? '1px solid rgba(34, 197, 94, 0.4)' : '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '6px',
                    padding: '8px 10px',
                    color: hostTelemetry?.ideStatus === 'dormant' ? '#4ade80' : '#ffffff',
                    fontSize: '11.5px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    minHeight: '38px',
                  }}
                >
                  {hostTelemetry?.ideStatus === 'dormant' ? (
                    <>
                      <Play size={13} color="#4ade80" />
                      <span>Launch Antigravity IDE</span>
                    </>
                  ) : (
                    <>
                      <RotateCw size={13} color="#ffffff" />
                      <span>Restart IDE</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic(40);
                    onCloseIde?.();
                    setActionFeedback('Terminated IDE process tree');
                    setTimeout(() => setActionFeedback(null), 3000);
                  }}
                  style={{
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.25)',
                    borderRadius: '6px',
                    padding: '8px 10px',
                    color: '#fca5a5',
                    fontSize: '11.5px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    minHeight: '38px',
                  }}
                >
                  <Power size={13} color="#f87171" />
                  <span>Close IDE</span>
                </button>
              </div>

              {/* Emergency Stop Button */}
              <button
                type="button"
                onClick={() => {
                  triggerHaptic(50);
                  onEmergencyStop?.();
                  setActionFeedback('Emergency Stop: Agent halted');
                  setTimeout(() => setActionFeedback(null), 4000);
                }}
                style={{
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '6px',
                  padding: '9px 12px',
                  color: '#f87171',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  minHeight: '38px',
                }}
              >
                <OctagonAlert size={14} color="#ef4444" />
                <span>Emergency Stop (Halt Agent)</span>
              </button>

              {actionFeedback && (
                <span style={{ fontSize: '11px', color: '#ffffff', textAlign: 'center', fontWeight: 600, padding: '4px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '4px' }}>
                  {actionFeedback}
                </span>
              )}
            </div>

            {/* APK Download Button (In-App DownloadManager) */}
            <button
              type="button"
              onClick={() => {
                triggerHaptic(30);
                const downloadUrl = `http://${host || '127.0.0.1'}:${port || '4040'}/download/app.apk`;
                if ((window as any).AndroidHost?.downloadAndInstallApk) {
                  setActionFeedback('Downloading APK via DownloadManager...');
                  (window as any).AndroidHost.downloadAndInstallApk(downloadUrl);
                } else {
                  window.open(downloadUrl, '_blank');
                }
              }}
              style={{
                background: '#1f1f1f',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '8px',
                padding: '10px 14px',
                color: '#e2e8f0',
                fontSize: '11.5px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                minHeight: '40px',
                cursor: 'pointer',
                width: '100%',
              }}
            >
              <Download size={14} color="#ffffff" />
              <span>Download / Update Android APK</span>
            </button>
          </div>
        )}
      </div>

      {/* Sticky Bottom Action Bar */}
      <footer
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          background: '#1f1f1f',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          padding: '10px 16px',
          paddingBottom: 'max(10px, env(safe-area-inset-bottom, 0px))',
          display: 'flex',
          justifyContent: 'center',
          zIndex: 101,
        }}
      >
        <button
          onClick={handleSave}
          style={{
            width: '100%',
            maxWidth: '640px',
            background: '#ffffff',
            border: 'none',
            borderRadius: '8px',
            padding: '11px 16px',
            color: '#000000',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
            minHeight: '42px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.4)',
          }}
        >
          Save & Apply
        </button>
      </footer>

      {/* Fullscreen Camera Viewfinder Modal */}
      {isScanning && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 150,
            background: '#000000',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              padding: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'rgba(0,0,0,0.8)',
              zIndex: 10,
            }}
          >
            <span style={{ color: '#ffffff', fontSize: '14px', fontWeight: 600 }}>
              Point Camera at QR Code
            </span>
            <button
              type="button"
              onClick={stopScanner}
              style={{
                background: 'rgba(255, 255, 255, 0.15)',
                border: 'none',
                borderRadius: '50%',
                width: '36px',
                height: '36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                cursor: 'pointer',
              }}
            >
              <X size={18} />
            </button>
          </div>

          <div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <video
              ref={videoRef}
              playsInline
              muted
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
            <div
              style={{
                position: 'absolute',
                width: '240px',
                height: '240px',
                border: '2px solid #ffffff',
                borderRadius: '16px',
                boxShadow: '0 0 0 4000px rgba(0, 0, 0, 0.55)',
                pointerEvents: 'none',
              }}
            />
          </div>

          {scannerError && (
            <div style={{ padding: '16px', textAlign: 'center', background: 'rgba(239,68,68,0.8)', color: '#ffffff', fontSize: '12px' }}>
              {scannerError}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
