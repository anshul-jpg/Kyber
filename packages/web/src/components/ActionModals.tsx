import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  FileText,
  Terminal,
  Image as ImageIcon,
  Globe,
  Folder,
  ChevronDown,
  ChevronRight,
  File,
  RefreshCw,
} from 'lucide-react';
import { FileTypeBadge } from './CommonUI';

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

interface ActionModalsProps {
  activeActionModal: 'diff' | 'terminal' | 'artifacts' | 'browser' | 'explorer' | null;
  onClose: () => void;
  expandedFolders: Record<string, boolean>;
  onToggleFolder: (path: string) => void;
  modifiedFilesList: ModifiedFile[];
  terminalLogs: string[];
  activeWorkspaceId?: string;
  activeWorkspaceName?: string;
  host?: string;
  port?: string;
}

export const ActionModals = React.memo<ActionModalsProps>(({
  activeActionModal,
  onClose,
  expandedFolders,
  onToggleFolder,
  modifiedFilesList,
  terminalLogs,
  activeWorkspaceId,
  activeWorkspaceName,
  host,
  port,
}) => {
  const [workspaceFiles, setWorkspaceFiles] = useState<Record<string, FileEntry[]>>({});
  const [loadingPaths, setLoadingPaths] = useState<Record<string, boolean>>({});

  const fetchFiles = useCallback(async (subPath: string = '') => {
    setLoadingPaths(prev => ({ ...prev, [subPath]: true }));
    try {
      const cleanH = (host || '').trim().replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '').replace(/\/$/, '');
      const hostNoPort = cleanH.replace(/:\d+$/, '');
      const httpBase = cleanH.includes('.trycloudflare.com')
        ? `https://${hostNoPort}`
        : `http://${hostNoPort || '100.107.129.104'}:${(!port || port === '443') ? '4040' : port}`;

      const res = await fetch(
        `${httpBase}/api/workspace/files?workspaceId=${encodeURIComponent(activeWorkspaceId || '')}&subPath=${encodeURIComponent(subPath)}`
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
  }, [host, port, activeWorkspaceId]);

  useEffect(() => {
    if (activeActionModal === 'explorer') {
      fetchFiles('');
    }
  }, [activeActionModal, activeWorkspaceId, fetchFiles]);

  const handleToggleFolder = (folderPath: string) => {
    const isExpanding = !expandedFolders[folderPath];
    onToggleFolder(folderPath);
    if (isExpanding && !workspaceFiles[folderPath]) {
      fetchFiles(folderPath);
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
        <div style={{ paddingLeft: `${depth * 16 + 8}px`, padding: '4px 8px', fontSize: '11px', color: '#666666' }}>
          (empty)
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
                    padding: '3px 6px',
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
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '2px 6px 2px 20px',
                color: '#cccccc',
                fontSize: '12.5px',
              }}
            >
              <FileTypeBadge name={item.name} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
            </div>
          );
        })}
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
          height: '75vh',
          background: '#181818',
          borderTopLeftRadius: '16px',
          borderTopRightRadius: '16px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
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
              {activeActionModal === 'explorer' && 'Explorer'}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: '#858585', cursor: 'pointer' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          {/* Live Dynamic File Explorer Tree */}
          {activeActionModal === 'explorer' && (
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
          )}

          {/* Diff Modal */}
          {activeActionModal === 'diff' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {modifiedFilesList.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: '#858585', fontSize: '13px' }}>
                  Working tree clean. No modified files detected.
                </div>
              ) : (
                modifiedFilesList.map((f, i) => (
                  <div
                    key={i}
                    style={{
                      background: '#1e1e1e',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '6px',
                      padding: '10px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '12.5px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <FileTypeBadge name={f.file} />
                      <span style={{ color: '#ffffff', fontFamily: 'monospace' }}>{f.file}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
          )}

          {/* Terminal Modal */}
          {activeActionModal === 'terminal' && (
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
              {terminalLogs.length === 0 ? (
                <span style={{ color: '#666666' }}>No terminal commands executed yet.</span>
              ) : (
                terminalLogs.join('\n\n')
              )}
            </div>
          )}

          {/* Artifacts Modal */}
          {activeActionModal === 'artifacts' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ color: '#858585', fontSize: '12px' }}>Session Artifacts:</div>
              <div
                style={{
                  background: '#1e1e1e',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '8px',
                  padding: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <FileText size={24} color="#007acc" />
                <div>
                  <div style={{ color: '#ffffff', fontSize: '13px', fontWeight: 600 }}>DESIGN.md</div>
                  <div style={{ color: '#858585', fontSize: '11px' }}>Master design system specification</div>
                </div>
              </div>
            </div>
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
