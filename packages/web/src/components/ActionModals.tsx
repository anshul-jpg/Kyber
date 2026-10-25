import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  X,
  FileText,
  Terminal,
  Image as ImageIcon,
  Globe,
  Folder,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  ArrowLeft,
} from 'lucide-react';
import { FileTypeBadge, CopyButton, MarkdownContent, triggerHaptic } from './CommonUI';
import { DiffViewer } from './ApprovalCards';
import { decodePairingTicket, TerminalEntry } from '@agy-companion/protocol';
import { getApiBaseUrl } from '../utils/api';

interface ModifiedFile {
  file: string;
  ins: number;
  del: number;
  isNew: boolean;
}

export interface FileEntry {
  name: string;
  isDirectory: boolean;
  path: string;
  size?: number;
}

export interface SessionArtifactItem {
  name: string;
  relPath: string;
  size: number;
  mtime: number;
  type: 'markdown' | 'image' | 'code' | 'other';
}

export interface ActivePreviewItem {
  title: string;
  path: string;
  isArtifact: boolean;
  isDiff?: boolean;
  content?: string;
  base64?: string;
  mimeType?: string;
  isText?: boolean;
  size?: number;
  loading: boolean;
  error?: string;
}

interface ActionModalsProps {
  activeActionModal: 'diff' | 'terminal' | 'artifacts' | 'browser' | 'explorer' | null;
  onClose: () => void;
  expandedFolders: Record<string, boolean>;
  onToggleFolder: (path: string) => void;
  modifiedFilesList: ModifiedFile[];
  terminalLogs: string[];
  terminalEntries?: TerminalEntry[];
  activeWorkspaceId?: string;
  activeWorkspaceName?: string;
  host?: string;
  port?: string;
  initialOpenFile?: { path: string; name: string } | null;
}

export const ActionModals = React.memo<ActionModalsProps>(({
  activeActionModal,
  onClose,
  expandedFolders,
  onToggleFolder,
  modifiedFilesList,
  terminalLogs,
  terminalEntries = [],
  activeWorkspaceId,
  activeWorkspaceName,
  host,
  port,
  initialOpenFile,
}) => {
  const [workspaceFiles, setWorkspaceFiles] = useState<Record<string, FileEntry[]>>({});
  const [loadingPaths, setLoadingPaths] = useState<Record<string, boolean>>({});
  const [artifacts, setArtifacts] = useState<SessionArtifactItem[]>([]);
  const [loadingArtifacts, setLoadingArtifacts] = useState<boolean>(false);
  const [previewItem, setPreviewItem] = useState<ActivePreviewItem | null>(null);
  const terminalBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeActionModal === 'terminal') {
      terminalBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [terminalEntries, terminalLogs, activeActionModal]);

  const getHttpBase = useCallback(() => {
    return getApiBaseUrl(host, port);
  }, [host, port]);

  const getAuthToken = useCallback((): string => {
    if (typeof window === 'undefined') return '';
    const stored = localStorage.getItem('agy_token');
    if (stored) return stored;
    try {
      const p = new URLSearchParams(window.location.search);
      const urlToken = p.get('token');
      if (urlToken) return urlToken;
      const rawTicket = p.get('ticket');
      if (rawTicket) {
        const decoded = decodePairingTicket(rawTicket);
        if (decoded?.token) return decoded.token;
      }
    } catch {}
    return '';
  }, []);

  const getAuthHeaders = useCallback((): Record<string, string> => {
    const token = getAuthToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }, [getAuthToken]);

  const fetchFiles = useCallback(async (subPath: string = '') => {
    setLoadingPaths(prev => ({ ...prev, [subPath]: true }));
    try {
      const httpBase = getHttpBase();
      const token = getAuthToken();
      const tokenParam = token ? `&token=${encodeURIComponent(token)}` : '';
      const res = await fetch(
        `${httpBase}/api/workspace/files?workspaceId=${encodeURIComponent(activeWorkspaceId || '')}&subPath=${encodeURIComponent(subPath)}${tokenParam}`,
        { headers: getAuthHeaders() }
      );
      if (res.ok) {
        const data = await res.json();
        if (data.files) {
          setWorkspaceFiles(prev => ({ ...prev, [subPath]: data.files }));
        }
      }
    } catch {
    } finally {
      setLoadingPaths(prev => ({ ...prev, [subPath]: false }));
    }
  }, [getHttpBase, getAuthHeaders, getAuthToken, activeWorkspaceId]);

  const fetchArtifacts = useCallback(async () => {
    setLoadingArtifacts(true);
    try {
      const httpBase = getHttpBase();
      const token = getAuthToken();
      const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';
      const res = await fetch(`${httpBase}/api/session/artifacts${tokenParam}`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.artifacts)) {
          setArtifacts(data.artifacts);
        }
      }
    } catch {
    } finally {
      setLoadingArtifacts(false);
    }
  }, [getHttpBase, getAuthHeaders, getAuthToken]);

  useEffect(() => {
    setPreviewItem(null);
    setWorkspaceFiles({});
    if (activeActionModal === 'explorer') {
      fetchFiles('');
      if (initialOpenFile) {
        handleOpenFile(initialOpenFile.path, initialOpenFile.name);
      }
    } else if (activeActionModal === 'artifacts') {
      fetchArtifacts();
    }
  }, [activeActionModal, activeWorkspaceId, initialOpenFile, fetchFiles, fetchArtifacts]);

  const handleToggleFolder = (folderPath: string) => {
    const isExpanding = !expandedFolders[folderPath];
    onToggleFolder(folderPath);
    if (isExpanding && !workspaceFiles[folderPath]) {
      fetchFiles(folderPath);
    }
  };

  const handleOpenFile = async (filePath: string, fileName: string) => {
    triggerHaptic(15);
    setPreviewItem({
      title: fileName,
      path: filePath,
      isArtifact: false,
      loading: true,
    });
    try {
      const httpBase = getHttpBase();
      const token = getAuthToken();
      const tokenParam = token ? `&token=${encodeURIComponent(token)}` : '';
      const res = await fetch(
        `${httpBase}/api/workspace/file/content?workspaceId=${encodeURIComponent(activeWorkspaceId || '')}&filePath=${encodeURIComponent(filePath)}${tokenParam}`,
        { headers: getAuthHeaders() }
      );
      if (res.ok) {
        const data = await res.json();
        setPreviewItem({
          title: data.name || fileName,
          path: filePath,
          isArtifact: false,
          content: data.content,
          base64: data.base64,
          mimeType: data.mimeType,
          isText: data.isText,
          size: data.size,
          loading: false,
        });
      } else {
        const err = await res.json().catch(() => ({ error: 'Failed to read file' }));
        setPreviewItem(prev => (prev ? { ...prev, loading: false, error: err.error || 'Failed to load file' } : null));
      }
    } catch (err: any) {
      setPreviewItem(prev => (prev ? { ...prev, loading: false, error: err.message || 'Connection error' } : null));
    }
  };

  const handleOpenDiff = async (filePath: string, titleName: string) => {
    triggerHaptic(15);
    setPreviewItem({
      title: titleName ? `${titleName} (Diff)` : 'Full Workspace Diff',
      path: filePath,
      isArtifact: false,
      isDiff: true,
      loading: true,
    });
    try {
      const httpBase = getHttpBase();
      const token = getAuthToken();
      const tokenParam = token ? `&token=${encodeURIComponent(token)}` : '';
      const res = await fetch(
        `${httpBase}/api/workspace/git/diff?workspaceId=${encodeURIComponent(activeWorkspaceId || '')}&filePath=${encodeURIComponent(filePath)}${tokenParam}`,
        { headers: getAuthHeaders() }
      );
      if (res.ok) {
        const data = await res.json();
        setPreviewItem({
          title: titleName ? `${titleName} (Diff)` : 'Full Workspace Diff',
          path: filePath,
          isArtifact: false,
          isDiff: true,
          content: data.diff || 'Working tree clean. No differences found.',
          isText: true,
          loading: false,
        });
      } else {
        const err = await res.json().catch(() => ({ error: 'Failed to read diff' }));
        setPreviewItem(prev => (prev ? { ...prev, loading: false, error: err.error || 'Failed to load diff' } : null));
      }
    } catch (err: any) {
      setPreviewItem(prev => (prev ? { ...prev, loading: false, error: err.message || 'Connection error' } : null));
    }
  };

  const handleOpenArtifact = async (art: SessionArtifactItem) => {
    triggerHaptic(15);
    setPreviewItem({
      title: art.name,
      path: art.relPath,
      isArtifact: true,
      size: art.size,
      loading: true,
    });
    try {
      const httpBase = getHttpBase();
      const token = getAuthToken();
      const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';
      const res = await fetch(`${httpBase}/api/session/artifact/content?path=${encodeURIComponent(art.relPath)}${tokenParam}`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setPreviewItem({
          title: data.name || art.name,
          path: art.relPath,
          isArtifact: true,
          content: data.content,
          base64: data.base64,
          mimeType: data.mimeType,
          isText: data.isText,
          size: data.size || art.size,
          loading: false,
        });
      } else {
        const err = await res.json().catch(() => ({ error: 'Failed to read artifact' }));
        setPreviewItem(prev => (prev ? { ...prev, loading: false, error: err.error || 'Failed to load artifact' } : null));
      }
    } catch (err: any) {
      setPreviewItem(prev => (prev ? { ...prev, loading: false, error: err.message || 'Connection error' } : null));
    }
  };

  const renderDirectoryNode = (subPath: string = '', depth: number = 0): React.ReactNode => {
    const files = workspaceFiles[subPath];
    if (loadingPaths[subPath] && !files) {
      return (
        <div style={{ paddingLeft: `${depth * 16 + 8}px`, padding: '6px 8px', fontSize: '11.5px', color: '#858585', fontStyle: 'italic' }}>
          Scanning directory...
        </div>
      );
    }
    if (!files || files.length === 0) {
      if (loadingPaths[subPath]) return null;
      return (
        <div style={{ paddingLeft: `${depth * 16 + 8}px`, padding: '8px 10px', fontSize: '11.5px', color: '#858585', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>(empty)</span>
          {depth === 0 && (
            <button
              onClick={() => fetchFiles('')}
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '4px',
                color: '#cccccc',
                padding: '2px 8px',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              Scan Again
            </button>
          )}
        </div>
      );
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingLeft: depth === 0 ? '0' : '16px' }}>
        {files.map(item => {
          const isExp = Boolean(expandedFolders[item.path]);
          if (item.isDirectory) {
            return (
              <div key={item.path}>
                <div
                  onClick={() => handleToggleFolder(item.path)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 6px',
                    cursor: 'pointer',
                    color: '#cccccc',
                    borderRadius: '4px',
                    fontSize: '12.5px',
                  }}
                >
                  <ChevronDown
                    size={13}
                    color="#858585"
                    style={{
                      transform: isExp ? 'none' : 'rotate(-90deg)',
                      transition: 'transform 120ms ease',
                      flexShrink: 0,
                    }}
                  />
                  <Folder size={14} color="#007acc" style={{ flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                  {loadingPaths[item.path] && (
                    <span style={{ fontSize: '10px', color: '#858585', marginLeft: 'auto' }}>...</span>
                  )}
                </div>
                {isExp && renderDirectoryNode(item.path, depth + 1)}
              </div>
            );
          }

          return (
            <div
              key={item.path}
              onClick={() => handleOpenFile(item.path, item.name)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 6px 4px 20px',
                color: '#cccccc',
                fontSize: '12.5px',
                cursor: 'pointer',
                borderRadius: '4px',
                transition: 'background 0.1s ease',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <FileTypeBadge name={item.name} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
            </div>
          );
        })}
      </div>
    );
  };

  const renderPreviewView = () => {
    if (!previewItem) return null;

    const sizeStr = previewItem.size !== undefined
      ? previewItem.size > 1024
        ? `${(previewItem.size / 1024).toFixed(1)} KB`
        : `${previewItem.size} B`
      : '';

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {/* Preview Sub-Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(255, 255, 255, 0.04)',
            borderRadius: '6px',
            padding: '6px 8px',
          }}
        >
          <button
            onClick={() => {
              triggerHaptic(10);
              setPreviewItem(null);
            }}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '5px',
              color: '#cccccc',
              padding: '3px 8px',
              fontSize: '11px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              cursor: 'pointer',
            }}
          >
            <ArrowLeft size={12} />
            <span>Back</span>
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden', margin: '0 8px' }}>
            <FileTypeBadge name={previewItem.title} />
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {previewItem.title}
            </span>
            {sizeStr && <span style={{ fontSize: '10px', color: '#858585', flexShrink: 0 }}>({sizeStr})</span>}
          </div>

          <div>
            {previewItem.isText && previewItem.content && (
              <CopyButton text={previewItem.content} />
            )}
          </div>
        </div>

        {/* Preview Body */}
        {previewItem.loading ? (
          <div style={{ padding: '36px', textAlign: 'center', color: '#858585', fontSize: '12.5px', fontStyle: 'italic' }}>
            Loading file contents...
          </div>
        ) : previewItem.error ? (
          <div
            style={{
              padding: '16px',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              borderRadius: '6px',
              color: '#fca5a5',
              fontSize: '12px',
            }}
          >
            {previewItem.error}
          </div>
        ) : !previewItem.isText && previewItem.base64 ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '16px', background: '#121213', borderRadius: '6px' }}>
            <img
              src={`data:${previewItem.mimeType || 'image/png'};base64,${previewItem.base64}`}
              alt={previewItem.title}
              style={{ maxWidth: '100%', maxHeight: '420px', borderRadius: '4px', objectFit: 'contain' }}
            />
          </div>
        ) : previewItem.isDiff ? (
          <DiffViewer diff={previewItem.content || ''} maxHeight="480px" />
        ) : previewItem.title.toLowerCase().endsWith('.md') ? (
          <div
            style={{
              background: '#161617',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '6px',
              padding: '14px',
              color: '#e4e4e7',
              fontSize: '12.5px',
              lineHeight: '1.55',
            }}
          >
            <MarkdownContent content={previewItem.content || ''} />
          </div>
        ) : (
          <div
            style={{
              background: '#121213',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '6px',
              overflowX: 'auto',
              padding: '10px',
              fontSize: '11px',
              fontFamily: 'monospace',
              lineHeight: '1.6',
              color: '#e4e4e7',
              whiteSpace: 'pre',
              maxHeight: '480px',
            }}
          >
            {(previewItem.content || '').split('\n').map((line, idx) => (
              <div key={idx} style={{ display: 'flex', gap: '12px' }}>
                <span style={{ color: '#52525b', minWidth: '28px', textAlign: 'right', userSelect: 'none', flexShrink: 0 }}>
                  {idx + 1}
                </span>
                <span>{line || ' '}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  if (!activeActionModal) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 80,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '680px',
          maxHeight: '85vh',
          background: '#181818',
          borderTopLeftRadius: '16px',
          borderTopRightRadius: '16px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderBottom: 'none',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 -8px 32px rgba(0,0,0,0.5)',
          overflow: 'hidden',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {activeActionModal === 'diff' && <FileText size={16} color="#007acc" />}
            {activeActionModal === 'terminal' && <Terminal size={16} color="#007acc" />}
            {activeActionModal === 'artifacts' && <ImageIcon size={16} color="#007acc" />}
            {activeActionModal === 'browser' && <Globe size={16} color="#007acc" />}
            {activeActionModal === 'explorer' && <Folder size={16} color="#007acc" />}
            <span style={{ fontSize: '13.5px', fontWeight: 600, color: '#ffffff', textTransform: 'capitalize' }}>
              {activeActionModal === 'diff' && 'Changed Files & Diffs'}
              {activeActionModal === 'terminal' && 'Terminal Execution'}
              {activeActionModal === 'artifacts' && 'Generated Artifacts'}
              {activeActionModal === 'browser' && 'Browser Preview'}
              {activeActionModal === 'explorer' && (
                <span>
                  Workspace Explorer <span style={{ fontSize: '11.5px', fontWeight: 500, color: '#0078d4' }}>({activeWorkspaceName || 'Current'})</span>
                </span>
              )}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: '#858585', cursor: 'pointer', padding: '4px' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          {/* Live Dynamic File Explorer Tree */}
          {activeActionModal === 'explorer' && (
            previewItem ? renderPreviewView() : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontFamily: 'monospace', fontSize: '12.5px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 8px',
                    background: 'rgba(255, 255, 255, 0.04)',
                    borderRadius: '6px',
                    marginBottom: '8px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px', color: '#ffffff', fontWeight: 600 }}>
                    <Folder size={15} color="#007acc" />
                    <span style={{ fontSize: '13px' }}>{activeWorkspaceName || 'Workspace Files'}</span>
                  </div>
                  <button
                    onClick={() => fetchFiles('')}
                    title="Refresh Files"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#858585',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      padding: '4px',
                      borderRadius: '4px',
                    }}
                  >
                    <RefreshCw size={13} className={loadingPaths[''] ? 'animate-spin' : ''} />
                  </button>
                </div>

                {renderDirectoryNode('', 0)}
              </div>
            )
          )}

          {/* Diff Modal */}
          {activeActionModal === 'diff' && (
            previewItem ? renderPreviewView() : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 8px',
                    background: 'rgba(255, 255, 255, 0.04)',
                    borderRadius: '6px',
                    marginBottom: '4px',
                  }}
                >
                  <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#ffffff' }}>
                    Modified Files ({modifiedFilesList.length})
                  </span>
                  <button
                    onClick={() => handleOpenDiff('', 'Workspace Changes')}
                    style={{
                      background: 'rgba(0, 120, 212, 0.15)',
                      border: '1px solid rgba(0, 120, 212, 0.3)',
                      color: '#60a5fa',
                      borderRadius: '5px',
                      padding: '4px 10px',
                      fontSize: '11.5px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <span>Full Workspace Diff</span>
                  </button>
                </div>

                {modifiedFilesList.length === 0 ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: '#858585', fontSize: '13px' }}>
                    Working tree clean. No modified files detected.
                  </div>
                ) : (
                  modifiedFilesList.map((f, i) => (
                    <div
                      key={i}
                      onClick={() => handleOpenDiff(f.file, f.file)}
                      style={{
                        background: '#1e1e1e',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '6px',
                        padding: '10px 12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: '12.5px',
                        cursor: 'pointer',
                        transition: 'background 0.1s ease',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#252528')}
                      onMouseLeave={e => (e.currentTarget.style.background = '#1e1e1e')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                        <FileTypeBadge name={f.file} />
                        <span style={{ color: '#ffffff', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {f.file}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                        <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#4ade80' }}>+{f.ins}</span>
                        <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#f87171' }}>-{f.del}</span>
                        <span style={{ fontSize: '11px', color: f.isNew ? '#4ade80' : '#f59e0b', background: 'rgba(255, 255, 255, 0.05)', padding: '2px 6px', borderRadius: '4px' }}>
                          {f.isNew ? 'U' : 'M'}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )
          )}

          {/* Terminal Modal */}
          {activeActionModal === 'terminal' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 10px',
                  background: 'rgba(255, 255, 255, 0.04)',
                  borderRadius: '6px',
                  marginBottom: '4px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      width: '7px',
                      height: '7px',
                      borderRadius: '50%',
                      background: '#10b981',
                      display: 'inline-block',
                      boxShadow: '0 0 8px rgba(16, 185, 129, 0.6)',
                    }}
                  />
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#e2e8f0' }}>
                    Live Console Stream
                  </span>
                  <span style={{ fontSize: '10.5px', color: '#71717a' }}>
                    ({terminalEntries.length > 0 ? terminalEntries.length : terminalLogs.length} events)
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {(terminalEntries.length > 0 || terminalLogs.length > 0) && (
                    <button
                      onClick={() => {
                        const fullText = terminalEntries.length > 0
                          ? terminalEntries.map(e => (e.command ? `$ ${e.command}\n${e.output}` : e.output)).join('\n\n')
                          : terminalLogs.join('\n\n');
                        navigator.clipboard?.writeText(fullText);
                        triggerHaptic(20);
                      }}
                      style={{
                        background: '#252525',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '4px',
                        color: '#d4d4d8',
                        fontSize: '11px',
                        padding: '3px 8px',
                        cursor: 'pointer',
                      }}
                    >
                      Copy All
                    </button>
                  )}
                </div>
              </div>

              {terminalEntries.length === 0 && terminalLogs.length === 0 ? (
                <div
                  style={{
                    background: '#0c0c0c',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '8px',
                    padding: '24px 16px',
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    color: '#71717a',
                    textAlign: 'center',
                  }}
                >
                  No terminal commands or output captured yet.
                </div>
              ) : terminalEntries.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {terminalEntries.map(entry => {
                    const timeStr = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : '';
                    const isSuccess = entry.exitCode === undefined || entry.exitCode === 0;
                    return (
                      <div
                        key={entry.id}
                        style={{
                          background: '#0c0c0c',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                          borderRadius: '8px',
                          overflow: 'hidden',
                          fontFamily: 'monospace',
                          fontSize: '11.5px',
                        }}
                      >
                        {entry.command && (
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '6px 10px',
                              background: '#161616',
                              borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                              gap: '8px',
                            }}
                          >
                            <span style={{ color: '#38bdf8', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              $ {entry.command}
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                              {entry.exitCode !== undefined && (
                                <span
                                  style={{
                                    fontSize: '9.5px',
                                    fontWeight: 700,
                                    padding: '1px 5px',
                                    borderRadius: '3px',
                                    background: isSuccess ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                    color: isSuccess ? '#34d399' : '#f87171',
                                    border: `1px solid ${isSuccess ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                                  }}
                                >
                                  exit {entry.exitCode}
                                </span>
                              )}
                              {timeStr && <span style={{ fontSize: '10px', color: '#52525b' }}>{timeStr}</span>}
                            </div>
                          </div>
                        )}
                        <div
                          style={{
                            padding: '10px',
                            color: '#e2e8f0',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-all',
                            lineHeight: 1.45,
                            maxHeight: '300px',
                            overflowY: 'auto',
                          }}
                        >
                          {entry.output || <span style={{ color: '#52525b' }}>(no output)</span>}
                        </div>
                      </div>
                    );
                  })}
                  <div ref={terminalBottomRef} />
                </div>
              ) : (
                <div
                  style={{
                    background: '#0c0c0c',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '8px',
                    padding: '12px',
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    color: '#e2e8f0',
                    whiteSpace: 'pre-wrap',
                    minHeight: '200px',
                  }}
                >
                  {terminalLogs.join('\n\n')}
                </div>
              )}
            </div>
          )}

          {/* Real Live Artifacts Modal */}
          {activeActionModal === 'artifacts' && (
            previewItem ? renderPreviewView() : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 8px',
                    background: 'rgba(255, 255, 255, 0.04)',
                    borderRadius: '6px',
                    marginBottom: '6px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px', color: '#ffffff', fontWeight: 600 }}>
                    <ImageIcon size={15} color="#007acc" />
                    <span style={{ fontSize: '13px' }}>Session Artifacts ({artifacts.length})</span>
                  </div>
                  <button
                    onClick={fetchArtifacts}
                    title="Refresh Artifacts"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#858585',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      padding: '4px',
                      borderRadius: '4px',
                    }}
                  >
                    <RefreshCw size={13} className={loadingArtifacts ? 'animate-spin' : ''} />
                  </button>
                </div>

                {loadingArtifacts && artifacts.length === 0 ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: '#858585', fontSize: '12.5px', fontStyle: 'italic' }}>
                    Loading session artifacts...
                  </div>
                ) : artifacts.length === 0 ? (
                  <div style={{ padding: '30px 16px', textAlign: 'center', color: '#858585', fontSize: '12.5px' }}>
                    No artifacts generated in this session yet.
                  </div>
                ) : (
                  artifacts.map((art, idx) => (
                    <div
                      key={idx}
                      onClick={() => handleOpenArtifact(art)}
                      style={{
                        background: '#1e1e1e',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '6px',
                        padding: '10px 12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: '12.5px',
                        cursor: 'pointer',
                        transition: 'background 0.15s ease',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#252525')}
                      onMouseLeave={e => (e.currentTarget.style.background = '#1e1e1e')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
                        <FileTypeBadge name={art.name} />
                        <div style={{ overflow: 'hidden' }}>
                          <div style={{ color: '#ffffff', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {art.name}
                          </div>
                          <div style={{ color: '#858585', fontSize: '11px' }}>
                            {art.size > 1024 ? `${(art.size / 1024).toFixed(1)} KB` : `${art.size} B`} • {new Date(art.mtime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      </div>
                      <ChevronRight size={14} color="#858585" />
                    </div>
                  ))
                )}
              </div>
            )
          )}

          {/* Browser Modal */}
          {activeActionModal === 'browser' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', textAlign: 'center', padding: '40px 0', color: '#858585' }}>
              <Globe size={32} style={{ margin: '0 auto' }} />
              <div style={{ fontSize: '13px', color: '#ffffff' }}>No active browser subagent running.</div>
              <div style={{ fontSize: '11px' }}>Browser recordings and DOM snapshots will appear here when invoked.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
