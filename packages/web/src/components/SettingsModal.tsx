import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  CheckSquare,
  Globe,
  BatteryCharging,
  Shield,
  Zap,
  Check,
  Smartphone,
  Laptop,
  Sparkles,
  RotateCw,
  Clock,
  Gauge,
  Bot,
  Power,
  Cpu,
  AlertTriangle,
  OctagonAlert,
  Camera,
  Download,
  X,
} from 'lucide-react';
import { decodePairingTicket, ExecutionPolicy, CompanionMode, AgentQuota, HostTelemetry } from '@agy-companion/protocol';
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
  hostTelemetry?: HostTelemetry | null;
  onCloseIde?: (providerId?: string) => void;
  onRestartIde?: (providerId?: string) => void;
  onEmergencyStop?: () => void;
  tailscaleIp?: string | null;
}


function formatCountdown(resetTimestamp: number, currentNow: number): string {
  const diff = Math.max(0, resetTimestamp - currentNow);
  if (diff <= 0) return '00m 00s (Refreshing)';
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`;
  }
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
}

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
  hostTelemetry = null,
  onCloseIde,
  onRestartIde,
  onEmergencyStop,
  tailscaleIp,
}) => {
  const [ticketInput, setTicketInput] = useState<string>('');
  const [ticketFeedback, setTicketFeedback] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const scannerStreamRef = React.useRef<MediaStream | null>(null);

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
      setTicketFeedback('Paired successfully!');
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
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      scannerStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
    } catch {
      setScannerError('Camera access unavailable or permission denied.');
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
  const [batteryFeedback, setBatteryFeedback] = useState<string | null>(null);
  const [wolMac, setWolMac] = useState<string>(() => localStorage.getItem('agy_wol_mac') || '');
  const [wolBroadcast, setWolBroadcast] = useState<string>(() => localStorage.getItem('agy_wol_broadcast') || '255.255.255.255');
  const [wolPort, setWolPort] = useState<string>(() => localStorage.getItem('agy_wol_port') || '9');
  const [wolFeedback, setWolFeedback] = useState<string | null>(null);

  const [now, setNow] = useState<number>(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const [liveQuotas, setLiveQuotas] = useState<AgentQuota[]>(
    agentQuotas && agentQuotas.length > 0 ? agentQuotas : []
  );
  const [isRefreshingQuotas, setIsRefreshingQuotas] = useState(false);

  const refreshQuotas = async () => {
    setIsRefreshingQuotas(true);
    triggerHaptic(20);
    try {
      const httpBase = getApiBaseUrl(host, port);
      const token = typeof window !== 'undefined' ? localStorage.getItem('agy_token') : null;
      const res = await fetch(`${httpBase}/api/agent-quotas`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        if (data.quotas && data.quotas.length > 0) {
          setLiveQuotas(data.quotas);
        }
      }
    } catch {}
    setTimeout(() => setIsRefreshingQuotas(false), 400);
  };

  useEffect(() => {
    if (isOpen) {
      refreshQuotas();
    }
  }, [isOpen]);

  useEffect(() => {
    if (agentQuotas && agentQuotas.length > 0) {
      setLiveQuotas(agentQuotas);
    }
  }, [agentQuotas]);

  if (!isOpen) return null;

  const isRemoteActive = companionMode === 'remote' || companionMode === 'autonomous';

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
      {/* Top Header Navigation */}
      <header
        style={{
          height: '52px',
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
            color: '#e2e8f0',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '14px',
            fontWeight: 600,
            padding: '8px 4px',
            minHeight: '44px',
            minWidth: '44px',
          }}
        >
          <ArrowLeft size={18} color="#007acc" />
          <span>Settings</span>
        </button>

        {/* Baseline Freeze Status Badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 8px',
            background: '#161616',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '6px',
          }}
        >
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: '#007acc',
            }}
          />
          <span
            style={{
              fontSize: '11px',
              fontFamily: "'Geist Mono', Consolas, monospace",
              color: '#ffffff',
              fontWeight: 600,
            }}
          >
            v0.1.0-beta.1
          </span>
        </div>
      </header>

      {/* Main Scrollable Content */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
          maxWidth: '640px',
          width: '100%',
          margin: '0 auto',
          boxSizing: 'border-box',
          paddingBottom: '90px',
        }}
      >
        {/* Section 1: Supervisor Routing Mode & Remote Policy */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div>
            <h3
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: '#858585',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                margin: '0 0 4px 0',
              }}
            >
              Supervisor Routing Mode
            </h3>
            <p style={{ fontSize: '11.5px', color: '#a0a0a0', margin: 0, lineHeight: '1.4' }}>
              Directs where agent approvals and session control are routed across your workflow.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            {/* Remote Mode Card */}
            <button
              type="button"
              onClick={() => {
                triggerHaptic(20);
                onUpdateCompanionMode('remote');
              }}
              style={{
                background: isRemoteActive ? '#007acc' : '#1e1e1e',
                border: `1px solid ${
                  isRemoteActive ? '#007acc' : 'rgba(255, 255, 255, 0.08)'
                }`,
                borderRadius: '8px',
                padding: '12px 10px',
                color: '#ffffff',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '6px',
                minHeight: '44px',
              }}
            >
              <Smartphone size={18} color={isRemoteActive ? '#ffffff' : '#858585'} />
              <span style={{ fontSize: '12px', fontWeight: 600 }}>Remote Mode</span>
              <span style={{ fontSize: '9.5px', color: isRemoteActive ? '#e2e8f0' : '#858585' }}>
                Phone Companion
              </span>
            </button>

            {/* Desk Mode Card */}
            <button
              type="button"
              onClick={() => {
                triggerHaptic(20);
                onUpdateCompanionMode('desk');
              }}
              style={{
                background: companionMode === 'desk' ? '#007acc' : '#1e1e1e',
                border: `1px solid ${
                  companionMode === 'desk' ? '#007acc' : 'rgba(255, 255, 255, 0.08)'
                }`,
                borderRadius: '8px',
                padding: '12px 10px',
                color: '#ffffff',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '6px',
                minHeight: '44px',
              }}
            >
              <Laptop size={18} color={companionMode === 'desk' ? '#ffffff' : '#858585'} />
              <span style={{ fontSize: '12px', fontWeight: 600 }}>Desk Mode</span>
              <span style={{ fontSize: '9.5px', color: companionMode === 'desk' ? '#e2e8f0' : '#858585' }}>
                PC Terminal IDE
              </span>
            </button>
          </div>

          {/* Auto Mode Sub-pill */}
          <button
            type="button"
            onClick={() => {
              triggerHaptic(20);
              onUpdateCompanionMode('auto');
            }}
            style={{
              background: companionMode === 'auto' ? 'rgba(0, 122, 204, 0.25)' : '#161616',
              border: `1px solid ${
                companionMode === 'auto' ? '#007acc' : 'rgba(255, 255, 255, 0.06)'
              }`,
              borderRadius: '6px',
              padding: '8px 12px',
              color: '#ffffff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              minHeight: '38px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={14} color={companionMode === 'auto' ? '#38bdf8' : '#64748b'} />
              <span style={{ fontSize: '11.5px', fontWeight: 500 }}>Auto-Detect (Dynamic Presence)</span>
            </div>
            <span style={{ fontSize: '10px', color: companionMode === 'auto' ? '#38bdf8' : '#64748b' }}>
              {companionMode === 'auto' ? 'Active' : 'Auto-switch'}
            </span>
          </button>

          {/* Remote Mode Sub-Mode Selector (Global Switch) */}
          <div
            style={{
              marginTop: '4px',
              background: '#1b1b1b',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '8px',
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Smartphone size={13} color="#007acc" />
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#e2e8f0', letterSpacing: '0.04em' }}>
                  REMOTE EXECUTION SUB-MODE
                </span>
              </div>
            </div>
            <p style={{ fontSize: '11px', color: '#858585', margin: 0, lineHeight: '1.4' }}>
              Governs whether the agent halts for approval cards or executes autonomously when in Remote Mode.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {/* Force Ask (Supervised) Sub-Mode */}
              <div
                onClick={() => {
                  triggerHaptic(25);
                  if (companionMode !== 'remote') onUpdateCompanionMode('remote');
                  onUpdateExecutionPolicy('force_ask');
                }}
                style={{
                  background: executionPolicy === 'force_ask' ? 'rgba(0, 122, 204, 0.1)' : '#212121',
                  border: `1px solid ${
                    executionPolicy === 'force_ask' ? '#007acc' : 'rgba(255, 255, 255, 0.08)'
                  }`,
                  borderRadius: '8px',
                  padding: '12px 14px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  transition: 'all 0.15s ease',
                }}
              >
                <div
                  style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    border: `2px solid ${executionPolicy === 'force_ask' ? '#007acc' : '#555555'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginTop: '2px',
                    flexShrink: 0,
                    background: executionPolicy === 'force_ask' ? '#007acc' : 'transparent',
                  }}
                >
                  {executionPolicy === 'force_ask' && <Check size={11} color="#ffffff" strokeWidth={3} />}
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                    <Shield size={14} color={executionPolicy === 'force_ask' ? '#007acc' : '#858585'} />
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#ffffff' }}>
                      Force Ask (Supervised)
                    </span>
                    <span
                      style={{
                        fontSize: '9.5px',
                        background: 'rgba(255, 255, 255, 0.06)',
                        color: '#858585',
                        padding: '1px 6px',
                        borderRadius: '4px',
                        fontWeight: 600,
                      }}
                    >
                      Phone Approval
                    </span>
                  </div>
                  <p style={{ fontSize: '11px', color: '#858585', margin: 0, lineHeight: '1.4' }}>
                    Mutating tools halt and push 1-tap approval cards and lockscreen notifications to your phone.
                  </p>
                </div>
              </div>

              {/* Autonomous (Hands-Off) Sub-Mode */}
              <div
                onClick={() => {
                  triggerHaptic(25);
                  if (companionMode !== 'remote') onUpdateCompanionMode('remote');
                  onUpdateExecutionPolicy('always_proceed');
                }}
                style={{
                  background:
                    executionPolicy === 'always_proceed' ? 'rgba(0, 122, 204, 0.1)' : '#212121',
                  border: `1px solid ${
                    executionPolicy === 'always_proceed' ? '#007acc' : 'rgba(255, 255, 255, 0.08)'
                  }`,
                  borderRadius: '8px',
                  padding: '12px 14px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  transition: 'all 0.15s ease',
                }}
              >
                <div
                  style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    border: `2px solid ${
                      executionPolicy === 'always_proceed' ? '#007acc' : '#555555'
                    }`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginTop: '2px',
                    flexShrink: 0,
                    background: executionPolicy === 'always_proceed' ? '#007acc' : 'transparent',
                  }}
                >
                  {executionPolicy === 'always_proceed' && <Check size={11} color="#ffffff" strokeWidth={3} />}
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                    <Zap size={14} color={executionPolicy === 'always_proceed' ? '#007acc' : '#858585'} />
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#ffffff' }}>
                      Autonomous Mode (Auto / Hands-Off)
                    </span>
                    <span
                      style={{
                        fontSize: '9.5px',
                        background: 'rgba(255, 255, 255, 0.06)',
                        color: '#858585',
                        padding: '1px 6px',
                        borderRadius: '4px',
                        fontWeight: 600,
                      }}
                    >
                      Zero Prompts
                    </span>
                  </div>
                  <p style={{ fontSize: '11px', color: '#858585', margin: 0, lineHeight: '1.4' }}>
                    Mutating tools and code edits proceed automatically without requiring phone approvals.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section 2: Agent Quotas & Rate Limits */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h3
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#858585',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  margin: '0 0 4px 0',
                }}
              >
                Agent Quotas & Rate Limits
              </h3>
              <p style={{ fontSize: '11.5px', color: '#a0a0a0', margin: 0, lineHeight: '1.4' }}>
                Live capacity and countdown to rolling quota refresh for active models.
              </p>
            </div>

            <button
              type="button"
              onClick={refreshQuotas}
              title="Refresh Quotas"
              style={{
                background: '#1e1e1e',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '6px',
                padding: '8px',
                color: '#858585',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: '36px',
                minHeight: '36px',
              }}
            >
              <RotateCw
                size={13}
                color="#858585"
                style={{
                  animation: isRefreshingQuotas ? 'spin 0.8s linear infinite' : 'none',
                }}
              />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {liveQuotas.length === 0 ? (
              <div
                style={{
                  background: '#1e1e1e',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '8px',
                  padding: '16px',
                  textAlign: 'center',
                  color: '#858585',
                  fontSize: '12px',
                }}
              >
                No active model quotas reported by host daemon.
              </div>
            ) : (
              liveQuotas.map(quota => {
              const remainingTime = formatCountdown(quota.resetTimestamp, now);
              const isExhausted = quota.status === 'exhausted';
              const isModerate = quota.status === 'moderate';

              const barColor = isExhausted
                ? '#ef4444'
                : isModerate
                ? '#eab308'
                : '#0078d4';

              return (
                <div
                  key={quota.id}
                  style={{
                    background: '#1e1e1e',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '8px',
                    padding: '12px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  {/* Top Row: Provider, Name, Active dot, and Status */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        style={{
                          fontSize: '10.5px',
                          color: '#858585',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          fontWeight: 600,
                        }}
                      >
                        {quota.provider}
                      </span>
                      <span style={{ color: '#444444', fontSize: '10px' }}>•</span>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#ffffff' }}>
                        {quota.name}
                      </span>
                      {quota.isActive && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <span
                            style={{
                              width: '5px',
                              height: '5px',
                              borderRadius: '50%',
                              background: '#10b981',
                            }}
                          />
                          <span style={{ fontSize: '10.5px', color: '#10b981', fontWeight: 500 }}>
                            Active
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Status Text (Clean, non-tacky) */}
                    <span
                      style={{
                        fontSize: '11px',
                        color: isExhausted ? '#ef4444' : '#858585',
                        fontFamily: "'Geist Mono', Consolas, monospace",
                      }}
                    >
                      {isExhausted ? 'Cooldown' : `${100 - quota.usedPercent}% left`}
                    </span>
                  </div>

                  {/* Hairline Usage Progress Bar */}
                  <div
                    style={{
                      height: '3px',
                      width: '100%',
                      background: '#282828',
                      borderRadius: '2px',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${Math.min(100, Math.max(2, quota.usedPercent))}%`,
                        background: barColor,
                        borderRadius: '2px',
                        transition: 'width 0.4s ease',
                      }}
                    />
                  </div>

                  {/* Bottom Metrics Row */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '11px',
                      color: '#858585',
                      fontFamily: "'Geist Mono', Consolas, monospace",
                    }}
                  >
                    <span>
                      {quota.usedPercent}% used ({quota.usedUnits}/{quota.totalUnits} {quota.unitLabel})
                    </span>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#858585' }}>
                      <Clock size={11} color="#858585" />
                      <span>Resets in {remainingTime}</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
          </div>
        </section>

        {/* Section 3: Quick Pair via Ticket */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div>
            <h3
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: '#858585',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                margin: '0 0 4px 0',
              }}
            >
              Zero-Config Pairing
            </h3>
            <p style={{ fontSize: '11.5px', color: '#a0a0a0', margin: 0, lineHeight: '1.4' }}>
              Paste pairing ticket generated by `npx agy-companion` or scanned QR URL.
            </p>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              background: '#1e1e1e',
              padding: '12px',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={ticketInput}
                onChange={e => {
                  setTicketInput(e.target.value);
                  setTicketFeedback(null);
                }}
                placeholder="Paste ticket or scanned URL..."
                style={{
                  flex: 1,
                  background: '#141414',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '6px',
                  padding: '9px 12px',
                  color: '#ffffff',
                  fontSize: '12px',
                  fontFamily: 'monospace',
                }}
              />
              <button
                type="button"
                onClick={() => {
                  const success = applyPairingTicket(ticketInput);
                  if (!success) {
                    setTicketFeedback('Invalid pairing ticket format');
                    triggerHaptic(50);
                  }
                }}
                style={{
                  background: '#007acc',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '9px 16px',
                  color: '#ffffff',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  minHeight: '44px',
                  whiteSpace: 'nowrap',
                }}
              >
                Pair
              </button>
            </div>

            {/* In-App Camera QR Code Scanner Trigger */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={startScanner}
                style={{
                  flex: 1,
                  background: '#242426',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '6px',
                  padding: '10px 14px',
                  color: '#ffffff',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '7px',
                }}
              >
                <Camera size={14} color="#007acc" />
                <span>Scan PC QR Code</span>
              </button>
            </div>

            {/* Direct Android APK Download Banner */}
            <div style={{ display: 'flex', gap: '8px', paddingTop: '6px', borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
              <a
                href={`http://${host || '127.0.0.1'}:${port || '4040'}/download/app.apk`}
                download="kyber-companion.apk"
                style={{
                  flex: 1,
                  background: '#141414',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  color: '#e2e8f0',
                  fontSize: '11px',
                  fontWeight: 500,
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <Download size={13} color="#0078d4" />
                <span>Download Android APK</span>
              </a>
              <a
                href="https://github.com/anshul-jpg/Kyber/releases"
                target="_blank"
                rel="noreferrer"
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  color: '#94a3b8',
                  fontSize: '11px',
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                Releases ↗
              </a>
            </div>

            {ticketFeedback && (
              <span
                style={{
                  fontSize: '11px',
                  color: ticketFeedback.includes('success') ? '#4ade80' : '#f87171',
                }}
              >
                {ticketFeedback}
              </span>
            )}

            {scannerError && (
              <span style={{ fontSize: '11px', color: '#f87171' }}>
                {scannerError}
              </span>
            )}
          </div>

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
                  Point Camera at PC QR Code
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
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    width: '240px',
                    height: '240px',
                    border: '2px solid #0078d4',
                    borderRadius: '16px',
                    boxShadow: '0 0 0 4000px rgba(0, 0, 0, 0.55)',
                    pointerEvents: 'none',
                  }}
                />
              </div>

              <div style={{ padding: '16px', textAlign: 'center', background: 'rgba(0,0,0,0.8)', color: '#a0a0a0', fontSize: '12px' }}>
                Hold steady over the QR code in the VS Code KYBER sidebar.
              </div>
            </div>
          )}
        </section>

        {/* Section 4: Connection & Presets */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div>
            <h3
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: '#858585',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                margin: '0 0 4px 0',
              }}
            >
              PC Host & Mesh Network
            </h3>
            <p style={{ fontSize: '11.5px', color: '#a0a0a0', margin: 0, lineHeight: '1.4' }}>
              Direct IP or Tailscale mesh address of your host machine.
            </p>
          </div>

          <div
            style={{
              background: '#1e1e1e',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '8px',
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '11.5px', color: '#94a3b8' }}>PC Host / Tailscale IP:</label>
              <input
                type="text"
                value={host}
                onChange={e => setHost(e.target.value)}
                placeholder="100.x.y.z or 192.168.1.x"
                style={{
                  background: '#141414',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '6px',
                  padding: '9px 12px',
                  color: '#ffffff',
                  fontSize: '12.5px',
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontSize: '10.5px', color: '#64748b' }}>Quick Switch Presets:</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setHost('127.0.0.1');
                    setPort('4040');
                    triggerHaptic(20);
                  }}
                  style={{
                    background: host === '127.0.0.1' || host === 'localhost' ? '#007acc' : '#141414',
                    border: `1px solid ${
                      host === '127.0.0.1' || host === 'localhost'
                        ? 'rgba(0, 122, 204, 0.6)'
                        : 'rgba(255, 255, 255, 0.1)'
                    }`,
                    borderRadius: '6px',
                    padding: '6px 10px',
                    color: '#ffffff',
                    fontSize: '11px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    minHeight: '36px',
                  }}
                >
                  <Globe size={12} color={host === '127.0.0.1' || host === 'localhost' ? '#ffffff' : '#858585'} />
                  <span>Localhost</span>
                </button>

                {(tailscaleIp || host.startsWith('100.')) && (
                  <button
                    type="button"
                    onClick={() => {
                      setHost(tailscaleIp || host);
                      setPort('4040');
                      triggerHaptic(20);
                    }}
                    style={{
                      background: (host === tailscaleIp || host.startsWith('100.')) ? '#007acc' : '#141414',
                      border: `1px solid ${
                        (host === tailscaleIp || host.startsWith('100.'))
                          ? 'rgba(0, 122, 204, 0.6)'
                          : 'rgba(255, 255, 255, 0.1)'
                      }`,
                      borderRadius: '6px',
                      padding: '6px 10px',
                      color: '#ffffff',
                      fontSize: '11px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      minHeight: '36px',
                    }}
                  >
                    <Globe size={12} color={(host === tailscaleIp || host.startsWith('100.')) ? '#ffffff' : '#858585'} />
                    <span>Tailscale</span>
                  </button>
                )}

                {typeof window !== 'undefined' && window.location.hostname && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1' && window.location.hostname !== tailscaleIp && (
                  <button
                    type="button"
                    onClick={() => {
                      setHost(window.location.hostname);
                      setPort(window.location.port || '4040');
                      triggerHaptic(20);
                    }}
                    style={{
                      background: host === window.location.hostname ? '#007acc' : '#141414',
                      border: `1px solid ${
                        host === window.location.hostname
                          ? 'rgba(0, 122, 204, 0.6)'
                          : 'rgba(255, 255, 255, 0.1)'
                      }`,
                      borderRadius: '6px',
                      padding: '6px 10px',
                      color: '#ffffff',
                      fontSize: '11px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      minHeight: '36px',
                    }}
                  >
                    <Globe size={12} color={host === window.location.hostname ? '#ffffff' : '#858585'} />
                    <span>Host Network</span>
                  </button>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '11.5px', color: '#94a3b8' }}>Port:</label>
              <input
                type="text"
                value={port}
                onChange={e => setPort(e.target.value)}
                placeholder="4040"
                style={{
                  background: '#141414',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '6px',
                  padding: '9px 12px',
                  color: '#ffffff',
                  fontSize: '12.5px',
                }}
              />
            </div>
          </div>
        </section>

        {/* Section 5: Android Background & Battery */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div>
            <h3
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: '#858585',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                margin: '0 0 4px 0',
              }}
            >
              OS Doze & Background Resilience
            </h3>
            <p style={{ fontSize: '11.5px', color: '#a0a0a0', margin: 0, lineHeight: '1.4' }}>
              Prevent Samsung OneUI, MIUI, and OxygenOS from sleeping the supervisory foreground service.
            </p>
          </div>

          <div
            style={{
              background: '#1e1e1e',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '8px',
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <BatteryCharging size={16} color="#4ade80" />
              <span style={{ fontSize: '12.5px', fontWeight: 600 }}>Foreground Service ID 9001</span>
            </div>
            <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0, lineHeight: '1.4' }}>
              Provides ongoing lockscreen controls with single persistent notification morphing.
            </p>
            <button
              type="button"
              onClick={() => {
                triggerHaptic(25);
                if ((window as any).AndroidHost?.requestIgnoreBatteryOptimizations) {
                  (window as any).AndroidHost.requestIgnoreBatteryOptimizations();
                  setBatteryFeedback('System prompt requested');
                } else {
                  setBatteryFeedback('Managed automatically in browser');
                }
                setTimeout(() => setBatteryFeedback(null), 3000);
              }}
              style={{
                background: '#282828',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '6px',
                padding: '9px 12px',
                color: '#ffffff',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                minHeight: '44px',
              }}
            >
              <Shield size={14} color="#4ade80" />
              <span>Request Unrestricted Battery</span>
            </button>
            {batteryFeedback && (
              <span style={{ fontSize: '11px', color: '#4ade80', textAlign: 'center' }}>
                {batteryFeedback}
              </span>
            )}
          </div>
        </section>

        {/* Section 6: Hardware & Power Controls */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <h3
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#e2e8f0',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  margin: 0,
                }}
              >
                Proceed with Caution
              </h3>
              <span
                style={{
                  fontSize: '9.5px',
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: '#a1a1aa',
                  padding: '1px 6px',
                  borderRadius: '4px',
                  fontWeight: 600,
                }}
              >
                Hardware & Power Controls
              </span>
            </div>
            <p style={{ fontSize: '11.5px', color: '#858585', margin: 0, lineHeight: '1.4' }}>
              Low-level host power states, Wake-on-LAN magic packet routing, and IDE process lifecycle.
            </p>
          </div>

          <div
            style={{
              background: '#1e1e1e',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '8px',
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            {/* Host Hardware Memory Telemetry */}
            {hostTelemetry && (
              <div
                style={{
                  padding: '9px 12px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  borderRadius: '6px',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '5px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11.5px' }}>
                  <span style={{ color: '#a1a1aa', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Cpu size={13} color="#0078d4" />
                    Host Physical RAM
                  </span>
                  <span
                    style={{
                      fontWeight: 600,
                      color: hostTelemetry.usedMemPercent > 85 ? '#f87171' : '#ffffff',
                      fontFamily: 'Geist Mono, monospace',
                    }}
                  >
                    {(hostTelemetry.usedMemMb / 1024).toFixed(1)} / {(hostTelemetry.totalMemMb / 1024).toFixed(1)} GB ({hostTelemetry.usedMemPercent}%)
                  </span>
                </div>
                <div style={{ width: '100%', height: '3px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${hostTelemetry.usedMemPercent}%`,
                      height: '100%',
                      background: hostTelemetry.usedMemPercent > 85 ? '#ef4444' : hostTelemetry.usedMemPercent > 70 ? '#f59e0b' : '#10b981',
                      borderRadius: '2px',
                      transition: 'width 250ms ease',
                    }}
                  />
                </div>
              </div>
            )}

            {/* Host IDE Policy & Universal Hook Status */}
            {hostTelemetry && (
              <div
                style={{
                  padding: '9px 12px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  borderRadius: '6px',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '7px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11.5px' }}>
                  <span style={{ color: '#a1a1aa', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Shield size={13} color="#0078d4" />
                    Host IDE Native Policy
                  </span>
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 600,
                      padding: '2px 6px',
                      borderRadius: '4px',
                      background: hostTelemetry.hostIdePolicy === 'always-proceed' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                      color: hostTelemetry.hostIdePolicy === 'always-proceed' ? '#34d399' : '#fbbf24',
                      border: `1px solid ${hostTelemetry.hostIdePolicy === 'always-proceed' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
                    }}
                  >
                    {hostTelemetry.hostIdePolicy === 'always-proceed' ? 'Autonomous (Proceed)' : hostTelemetry.hostIdePolicy === 'always-ask' ? 'Always Ask (PC Dialogs)' : 'Synchronized'}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11.5px' }}>
                  <span style={{ color: '#a1a1aa', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Globe size={13} color="#0078d4" />
                    Universal Global Hook
                  </span>
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 600,
                      padding: '2px 6px',
                      borderRadius: '4px',
                      background: hostTelemetry.isGlobalHookInstalled ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.06)',
                      color: hostTelemetry.isGlobalHookInstalled ? '#34d399' : '#858585',
                      border: `1px solid ${hostTelemetry.isGlobalHookInstalled ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255, 255, 255, 0.08)'}`,
                    }}
                  >
                    {hostTelemetry.isGlobalHookInstalled ? 'Active Everywhere' : 'Workspace Only'}
                  </span>
                </div>
              </div>
            )}

            {/* Emergency Stop Button */}
            <button
              type="button"
              onClick={() => {
                triggerHaptic(50);
                onEmergencyStop?.();
                setWolFeedback('Emergency Stop sent: pending approvals denied & agent halted');
                setTimeout(() => setWolFeedback(null), 4000);
              }}
              style={{
                width: '100%',
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                borderRadius: '6px',
                padding: '10px 14px',
                color: '#f87171',
                fontSize: '12.5px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                minHeight: '42px',
                boxSizing: 'border-box',
              }}
            >
              <OctagonAlert size={15} color="#ef4444" />
              <span>Emergency Stop (Halt Agent & Deny Approvals)</span>
            </button>

            {/* Host Lifecycle Actions */}
            <div style={{ display: 'flex', gap: '8px', width: '100%', boxSizing: 'border-box' }}>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic(30);
                  onRestartIde?.();
                  setWolFeedback('Dispatched restart command to host IDE');
                  setTimeout(() => setWolFeedback(null), 3500);
                }}
                style={{
                  flex: 1,
                  background: '#242424',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '6px',
                  padding: '9px 12px',
                  color: '#38bdf8',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  minHeight: '40px',
                  boxSizing: 'border-box',
                }}
              >
                <RotateCw size={13} color="#38bdf8" />
                <span>Restart IDE</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  triggerHaptic(40);
                  onCloseIde?.();
                  setWolFeedback('Terminated IDE process tree. ~1.5 GB RAM freed on host.');
                  setTimeout(() => setWolFeedback(null), 4000);
                }}
                style={{
                  flex: 1,
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '6px',
                  padding: '9px 12px',
                  color: '#fca5a5',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  minHeight: '40px',
                  boxSizing: 'border-box',
                }}
              >
                <Power size={13} color="#f87171" />
                <span>Close IDE (Free RAM)</span>
              </button>
            </div>

            {/* Wake-on-LAN Settings */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%', boxSizing: 'border-box' }}>
              <label style={{ fontSize: '11px', color: '#cbd5e1', fontWeight: 600 }}>
                Target Host MAC Address:
              </label>
              <input
                type="text"
                value={wolMac}
                onChange={e => {
                  setWolMac(e.target.value);
                  localStorage.setItem('agy_wol_mac', e.target.value);
                }}
                placeholder="e.g. 00:1A:2B:3C:4D:5E"
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  minWidth: 0,
                  background: '#141414',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  color: '#ffffff',
                  fontSize: '12px',
                  fontFamily: 'Geist Mono, monospace',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '8px', width: '100%', boxSizing: 'border-box' }}>
              <div style={{ flex: '3', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '11px', color: '#cbd5e1', fontWeight: 600 }}>
                  Broadcast IP:
                </label>
                <input
                  type="text"
                  value={wolBroadcast}
                  onChange={e => {
                    setWolBroadcast(e.target.value);
                    localStorage.setItem('agy_wol_broadcast', e.target.value);
                  }}
                  placeholder="255.255.255.255"
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    minWidth: 0,
                    background: '#141414',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '6px',
                    padding: '8px 10px',
                    color: '#ffffff',
                    fontSize: '12px',
                    fontFamily: 'Geist Mono, monospace',
                  }}
                />
              </div>

              <div style={{ flex: '1', minWidth: '70px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '11px', color: '#cbd5e1', fontWeight: 600 }}>
                  Port:
                </label>
                <input
                  type="text"
                  value={wolPort}
                  onChange={e => {
                    setWolPort(e.target.value);
                    localStorage.setItem('agy_wol_port', e.target.value);
                  }}
                  placeholder="9"
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    minWidth: 0,
                    background: '#141414',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '6px',
                    padding: '8px 10px',
                    color: '#ffffff',
                    fontSize: '12px',
                    fontFamily: 'Geist Mono, monospace',
                    textAlign: 'center',
                  }}
                />
              </div>
            </div>

            {/* Architecture Tip Note */}
            <div
              style={{
                background: 'rgba(0, 0, 0, 0.25)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                borderRadius: '6px',
                padding: '9px 11px',
                fontSize: '10.5px',
                color: '#94a3b8',
                lineHeight: '1.45',
              }}
            >
              <strong style={{ color: '#ededed' }}>How Wake-on-LAN operates with Windows login:</strong>
              <br />
              1. Magic packet signals NIC to boot PC from cold/sleep state.
              <br />
              2. Windows boots to the Lock Screen. The lightweight KYBER background daemon starts with zero Electron RAM, connects to Tailscale/Wi-Fi, and signals online.
              <br />
              3. Antigravity IDE is NEVER in startup. It launches on-demand from your phone only when you open a project or send a prompt.
            </div>

            {wolFeedback && (
              <span style={{ fontSize: '11px', color: '#38bdf8', textAlign: 'center', fontWeight: 500 }}>
                {wolFeedback}
              </span>
            )}
          </div>
        </section>
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
          padding: '12px 16px',
          paddingBottom: 'max(12px, env(safe-area-inset-bottom, 0px))',
          display: 'flex',
          justifyContent: 'center',
          zIndex: 101,
        }}
      >
        <button
          onClick={() => {
            triggerHaptic(30);
            onClose();
            onSaveAndReconnect();
          }}
          style={{
            width: '100%',
            maxWidth: '640px',
            background: '#0078d4',
            border: 'none',
            borderRadius: '8px',
            padding: '12px 16px',
            color: '#ffffff',
            fontSize: '13.5px',
            fontWeight: 600,
            cursor: 'pointer',
            minHeight: '44px',
            boxShadow: '0 2px 8px rgba(0, 120, 212, 0.35)',
          }}
        >
          Save & Apply Changes
        </button>
      </footer>
    </div>
  );
};
