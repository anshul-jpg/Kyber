import React, { useState, useEffect, useCallback } from 'react';
import { Monitor, RefreshCw, ZoomIn, ZoomOut, AlertCircle, Maximize2, Shield } from 'lucide-react';
import { triggerHaptic } from './CommonUI';
import { getApiBaseUrl } from '../utils/api';

interface ScreenSnapshotViewProps {
  host?: string;
  port?: string;
  getAuthHeaders?: () => Record<string, string>;
  activeWorkspaceId?: string;
}

export const ScreenSnapshotView: React.FC<ScreenSnapshotViewProps> = React.memo(({
  host = '127.0.0.1',
  port = '4040',
  getAuthHeaders,
}) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [timestamp, setTimestamp] = useState<number>(Date.now());
  const [error, setError] = useState<string | null>(null);
  const [fitMode, setFitMode] = useState<'fit' | 'actual'>('fit');
  const [autoRefresh, setAutoRefresh] = useState<boolean>(false);

  const httpBase = getApiBaseUrl(host, port);
  const authHeaders = getAuthHeaders ? getAuthHeaders() : { 'Content-Type': 'application/json' };

  const refreshSnapshot = useCallback(() => {
    triggerHaptic(15);
    setLoading(true);
    setError(null);
    setTimestamp(Date.now());
  }, []);

  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (autoRefresh) {
      timer = setInterval(() => {
        setTimestamp(Date.now());
      }, 3000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [autoRefresh]);

  const tokenParam = (() => {
    if (typeof window === 'undefined') return '';
    try {
      const stored = localStorage.getItem('agy_token');
      if (stored) return `?token=${encodeURIComponent(stored)}&t=${timestamp}`;
      const p = new URLSearchParams(window.location.search);
      const urlToken = p.get('token');
      if (urlToken) return `?token=${encodeURIComponent(urlToken)}&t=${timestamp}`;
    } catch {}
    return `?t=${timestamp}`;
  })();

  const screenUrl = `${httpBase}/api/host/screen.jpg${tokenParam}`;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        background: '#0d0d0e',
        color: '#ffffff',
        fontFamily: "'Geist Mono', Consolas, monospace",
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      {/* Top Header Controls */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          background: '#141416',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Monitor size={16} color="#ffffff" />
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#ffffff' }}>
            Desktop Mirror
          </span>
          <span
            style={{
              fontSize: '10px',
              padding: '1px 6px',
              borderRadius: '12px',
              background: autoRefresh ? 'rgba(74, 222, 128, 0.15)' : 'rgba(255, 255, 255, 0.08)',
              color: autoRefresh ? '#4ade80' : '#a1a1aa',
              border: autoRefresh ? '1px solid rgba(74, 222, 128, 0.3)' : '1px solid rgba(255, 255, 255, 0.1)',
            }}
          >
            {autoRefresh ? 'LIVE (3s)' : 'STATIC'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            onClick={() => {
              triggerHaptic(15);
              setAutoRefresh(prev => !prev);
            }}
            title="Toggle Auto Refresh"
            style={{
              background: autoRefresh ? '#27272a' : 'transparent',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '6px',
              color: autoRefresh ? '#ffffff' : '#a1a1aa',
              padding: '4px 8px',
              fontSize: '11px',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Auto
          </button>

          <button
            onClick={() => {
              triggerHaptic(15);
              setFitMode(prev => (prev === 'fit' ? 'actual' : 'fit'));
            }}
            title="Toggle Fit Mode"
            style={{
              background: 'transparent',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '6px',
              color: '#a1a1aa',
              padding: '4px 8px',
              fontSize: '11px',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {fitMode === 'fit' ? 'Fit' : '1:1'}
          </button>

          <button
            onClick={refreshSnapshot}
            disabled={loading}
            title="Capture Screenshot"
            style={{
              background: 'transparent',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '6px',
              color: '#ffffff',
              width: '28px',
              height: '28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Main Screen Viewport */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#09090a',
          position: 'relative',
          padding: '8px',
        }}
      >
        {error ? (
          <div
            style={{
              padding: '24px',
              textAlign: 'center',
              color: '#f87171',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <AlertCircle size={28} />
            <div style={{ fontSize: '13px', fontWeight: 600 }}>Screenshot Unavailable</div>
            <div style={{ fontSize: '11px', color: '#71717a', maxWidth: '300px' }}>
              Ensure companion daemon has desktop screen capture enabled and PC is awake.
            </div>
            <button
              onClick={refreshSnapshot}
              style={{
                marginTop: '8px',
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: '#ffffff',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '11.5px',
                cursor: 'pointer',
              }}
            >
              Retry Capture
            </button>
          </div>
        ) : (
          <div
            style={{
              width: fitMode === 'fit' ? '100%' : 'auto',
              height: fitMode === 'fit' ? '100%' : 'auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <img
              src={screenUrl}
              alt="Desktop Host Mirror"
              onLoad={() => setLoading(false)}
              onError={() => {
                setLoading(false);
                setError('Failed to load desktop snapshot image');
              }}
              style={{
                maxWidth: fitMode === 'fit' ? '100%' : 'none',
                maxHeight: fitMode === 'fit' ? '100%' : 'none',
                objectFit: 'contain',
                borderRadius: '6px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                boxShadow: '0 4px 24px rgba(0,0,0,0.8)',
              }}
            />
          </div>
        )}
      </div>

      {/* Footer Info Strip */}
      <div
        style={{
          padding: '8px 16px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          background: '#141416',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '10.5px',
          color: '#71717a',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <Shield size={11} color="#a1a1aa" />
          <span>Local Mirror • E2EE</span>
        </span>
        <span>Captured {new Date(timestamp).toLocaleTimeString([], { hour12: false })}</span>
      </div>
    </div>
  );
});
