import React, { useState, useEffect, useCallback } from 'react';
import {
  GitBranch,
  RefreshCw,
  Plus,
  Minus,
  Trash2,
  Check,
  ChevronRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  FileText,
} from 'lucide-react';
import { DiffViewer } from './ApprovalCards';
import { FileTypeBadge, triggerHaptic } from './CommonUI';
import { getApiBaseUrl } from '../utils/api';

export interface GitFileChange {
  file: string;
  relativePath: string;
  insertions: number;
  deletions: number;
  status: 'M' | 'A' | 'D' | 'U' | 'R' | '?';
  staged?: boolean;
}

export interface GitStatusResponse {
  branch?: string;
  files?: GitFileChange[];
  stagedCount?: number;
  unstagedCount?: number;
  clean?: boolean;
}

interface GitChangesViewProps {
  host?: string;
  port?: string;
  getAuthHeaders?: () => Record<string, string>;
  activeWorkspaceId?: string;
}

export const GitChangesView: React.FC<GitChangesViewProps> = React.memo(({
  host = '127.0.0.1',
  port = '4040',
  getAuthHeaders,
  activeWorkspaceId,
}) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [status, setStatus] = useState<GitStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<{ path: string; staged: boolean } | null>(null);
  const [fileDiff, setFileDiff] = useState<string | null>(null);
  const [diffLoading, setDiffLoading] = useState<boolean>(false);
  const [commitMessage, setCommitMessage] = useState<string>('');
  const [committing, setCommitting] = useState<boolean>(false);
  const [commitResult, setCommitResult] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  const httpBase = getApiBaseUrl(host, port);
  const authHeaders = getAuthHeaders ? getAuthHeaders() : { 'Content-Type': 'application/json' };

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const wsParam = activeWorkspaceId ? `?workspaceId=${encodeURIComponent(activeWorkspaceId)}` : '';
      const res = await fetch(`${httpBase}/api/git/status${wsParam}`, {
        headers: authHeaders,
      });
      if (res.ok) {
        const data = await res.json();
        // Support both { ok: true, status: { branch, files } } and { ok: true, changes: [...] }
        const branch = data.status?.branch || data.branch || 'main';
        const files: GitFileChange[] = data.status?.files || data.changes || [];
        const stagedCount = files.filter(f => f.staged).length;
        const unstagedCount = files.length - stagedCount;
        setStatus({
          branch,
          files,
          stagedCount,
          unstagedCount,
          clean: files.length === 0,
        });
      } else {
        const err = await res.json().catch(() => ({ error: 'Failed to fetch git status' }));
        setError(err.error || 'Failed to read git working tree');
      }
    } catch (err: any) {
      setError(err.message || 'Connection error to companion daemon');
    } finally {
      setLoading(false);
    }
  }, [httpBase, authHeaders, activeWorkspaceId]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const loadFileDiff = async (file: string, staged: boolean) => {
    triggerHaptic(15);
    setSelectedFile({ path: file, staged });
    setDiffLoading(true);
    try {
      const wsParam = activeWorkspaceId ? `&workspaceId=${encodeURIComponent(activeWorkspaceId)}` : '';
      const res = await fetch(
        `${httpBase}/api/git/diff?file=${encodeURIComponent(file)}&staged=${staged}${wsParam}`,
        { headers: authHeaders }
      );
      if (res.ok) {
        const data = await res.json();
        setFileDiff(data.diff || 'No textual changes detected.');
      } else {
        setFileDiff('Unable to load file diff.');
      }
    } catch (err: any) {
      setFileDiff(`Error loading diff: ${err.message}`);
    } finally {
      setDiffLoading(false);
    }
  };

  const stageFile = async (file: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    triggerHaptic(20);
    setActionInProgress(`stage:${file}`);
    try {
      const res = await fetch(`${httpBase}/api/git/stage`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ file, workspaceId: activeWorkspaceId }),
      });
      if (res.ok) {
        await fetchStatus();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setActionInProgress(null);
    }
  };

  const unstageFile = async (file: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    triggerHaptic(20);
    setActionInProgress(`unstage:${file}`);
    try {
      const res = await fetch(`${httpBase}/api/git/unstage`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ file, workspaceId: activeWorkspaceId }),
      });
      if (res.ok) {
        await fetchStatus();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setActionInProgress(null);
    }
  };

  const discardFile = async (file: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!window.confirm(`Discard all changes in ${file}? This cannot be undone.`)) return;
    triggerHaptic(30);
    setActionInProgress(`discard:${file}`);
    try {
      const res = await fetch(`${httpBase}/api/git/discard`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ file, workspaceId: activeWorkspaceId }),
      });
      if (res.ok) {
        await fetchStatus();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleCommit = async () => {
    if (!commitMessage.trim()) return;
    triggerHaptic(25);
    setCommitting(true);
    setCommitResult(null);
    try {
      const res = await fetch(`${httpBase}/api/git/commit`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ message: commitMessage.trim(), workspaceId: activeWorkspaceId }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setCommitMessage('');
        setCommitResult(`Committed: ${data.hash?.substring(0, 7) || 'HEAD'}`);
        await fetchStatus();
      } else {
        setCommitResult(`Failed: ${data.error || 'Commit error'}`);
      }
    } catch (err: any) {
      setCommitResult(`Error: ${err.message}`);
    } finally {
      setCommitting(false);
    }
  };

  // Divide into staged vs unstaged/untracked
  const stagedFiles = status?.files?.filter(f => f.staged) || [];
  const unstagedFiles = status?.files?.filter(f => !f.staged) || [];

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
      {/* Top Header Bar */}
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
          <GitBranch size={16} color="#ffffff" />
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#ffffff' }}>
            {status?.branch || 'git'}
          </span>
          {status && (
            <span
              style={{
                fontSize: '10px',
                padding: '1px 6px',
                borderRadius: '12px',
                background: status.clean ? 'rgba(74, 222, 128, 0.12)' : 'rgba(255, 255, 255, 0.08)',
                color: status.clean ? '#4ade80' : '#a1a1aa',
                border: status.clean ? '1px solid rgba(74, 222, 128, 0.25)' : '1px solid rgba(255, 255, 255, 0.1)',
              }}
            >
              {status.clean ? 'clean' : `${status.files?.length || 0} changed`}
            </span>
          )}
        </div>

        <button
          onClick={() => {
            triggerHaptic(15);
            fetchStatus();
          }}
          disabled={loading}
          title="Refresh Git Status"
          style={{
            background: 'transparent',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '6px',
            color: '#a1a1aa',
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

      {/* Main Content Area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {error && (
          <div
            style={{
              padding: '10px 12px',
              borderRadius: '6px',
              background: 'rgba(248, 113, 113, 0.1)',
              border: '1px solid rgba(248, 113, 113, 0.25)',
              color: '#f87171',
              fontSize: '11.5px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <AlertCircle size={14} />
            <span>{error}</span>
          </div>
        )}

        {/* Selected File Diff Inspection Sub-view */}
        {selectedFile ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 10px',
                background: '#18181b',
                borderRadius: '6px',
                marginBottom: '10px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              <button
                onClick={() => setSelectedFile(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                <ArrowLeft size={14} />
                <span>Back to File List</span>
              </button>
              <span style={{ fontSize: '11px', color: '#71717a' }}>
                {selectedFile.staged ? 'Staged Diff' : 'Working Tree Diff'}
              </span>
            </div>

            <div style={{ fontSize: '12px', fontWeight: 600, color: '#ffffff', marginBottom: '8px' }}>
              {selectedFile.path}
            </div>

            {diffLoading ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#71717a', fontSize: '11.5px' }}>
                Computing unified diff...
              </div>
            ) : (
              <div style={{ flex: 1, minHeight: 0 }}>
                <DiffViewer diff={fileDiff || ''} maxHeight="calc(100vh - 210px)" />
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Quick Commit Bar */}
            <div
              style={{
                background: '#141416',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '8px',
                padding: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#71717a' }}>
                  Commit Staged Changes
                </span>
                {commitResult && (
                  <span style={{ fontSize: '10.5px', color: commitResult.startsWith('Committed') ? '#4ade80' : '#f87171' }}>
                    {commitResult}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <input
                  type="text"
                  placeholder="Commit message..."
                  value={commitMessage}
                  onChange={e => setCommitMessage(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleCommit();
                  }}
                  style={{
                    flex: 1,
                    background: '#09090a',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '6px',
                    padding: '7px 10px',
                    color: '#ffffff',
                    fontSize: '11.5px',
                    fontFamily: 'inherit',
                    outline: 'none',
                  }}
                />
                <button
                  onClick={handleCommit}
                  disabled={committing || stagedFiles.length === 0 || !commitMessage.trim()}
                  style={{
                    background: stagedFiles.length > 0 && commitMessage.trim() ? '#ffffff' : 'rgba(255, 255, 255, 0.08)',
                    color: stagedFiles.length > 0 && commitMessage.trim() ? '#09090b' : '#71717a',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '7px 12px',
                    fontSize: '11.5px',
                    fontWeight: 600,
                    cursor: stagedFiles.length > 0 && commitMessage.trim() ? 'pointer' : 'not-allowed',
                    fontFamily: 'inherit',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                  }}
                >
                  <Check size={12} />
                  <span>Commit ({stagedFiles.length})</span>
                </button>
              </div>
            </div>

            {/* Clean Working Tree Placeholder */}
            {status?.clean && (
              <div
                style={{
                  textAlign: 'center',
                  padding: '36px 16px',
                  color: '#71717a',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <CheckCircle2 size={32} color="#4ade80" />
                <div style={{ fontSize: '13px', color: '#ffffff', fontWeight: 600 }}>Working Tree Clean</div>
                <div style={{ fontSize: '11px', maxWidth: '280px' }}>
                  No unstaged or modified files in current workspace. Any agent edits will appear here live.
                </div>
              </div>
            )}

            {/* Staged Changes Section */}
            {stagedFiles.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#4ade80' }}>
                  Staged Changes ({stagedFiles.length})
                </div>
                {stagedFiles.map((file, idx) => (
                  <div
                    key={`staged-${idx}`}
                    onClick={() => loadFileDiff(file.relativePath || file.file, true)}
                    style={{
                      background: '#141416',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '6px',
                      padding: '8px 10px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      transition: 'background 120ms ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                      <span style={{ fontSize: '9.5px', padding: '1px 4px', borderRadius: '3px', background: 'rgba(74, 222, 128, 0.15)', color: '#4ade80', fontWeight: 700 }}>
                        {file.status}
                      </span>
                      <span style={{ fontSize: '11.5px', color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {file.relativePath || file.file}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                      <span style={{ fontSize: '10px', color: '#4ade80' }}>+{file.insertions}</span>
                      <span style={{ fontSize: '10px', color: '#f87171' }}>-{file.deletions}</span>
                      <button
                        onClick={e => unstageFile(file.relativePath || file.file, e)}
                        title="Unstage file"
                        style={{
                          background: 'rgba(255, 255, 255, 0.06)',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          color: '#a1a1aa',
                          borderRadius: '4px',
                          padding: '2px 6px',
                          fontSize: '10px',
                          cursor: 'pointer',
                        }}
                      >
                        Unstage
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Unstaged / Modified Changes Section */}
            {unstagedFiles.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#71717a' }}>
                  Working Changes ({unstagedFiles.length})
                </div>
                {unstagedFiles.map((file, idx) => (
                  <div
                    key={`unstaged-${idx}`}
                    onClick={() => loadFileDiff(file.relativePath || file.file, false)}
                    style={{
                      background: '#141416',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '6px',
                      padding: '8px 10px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      transition: 'background 120ms ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                      <span style={{ fontSize: '9.5px', padding: '1px 4px', borderRadius: '3px', background: 'rgba(255, 255, 255, 0.08)', color: '#d4d4d8', fontWeight: 700 }}>
                        {file.status}
                      </span>
                      <span style={{ fontSize: '11.5px', color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {file.relativePath || file.file}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                      <span style={{ fontSize: '10px', color: '#4ade80' }}>+{file.insertions}</span>
                      <span style={{ fontSize: '10px', color: '#f87171' }}>-{file.deletions}</span>
                      <button
                        onClick={e => stageFile(file.relativePath || file.file, e)}
                        title="Stage file"
                        style={{
                          background: 'rgba(255, 255, 255, 0.08)',
                          border: '1px solid rgba(255, 255, 255, 0.14)',
                          color: '#ffffff',
                          borderRadius: '4px',
                          padding: '2px 7px',
                          fontSize: '10px',
                          cursor: 'pointer',
                          fontWeight: 600,
                        }}
                      >
                        Stage
                      </button>
                      <button
                        onClick={e => discardFile(file.relativePath || file.file, e)}
                        title="Discard changes"
                        style={{
                          background: 'transparent',
                          border: '1px solid rgba(248, 113, 113, 0.2)',
                          color: '#f87171',
                          borderRadius: '4px',
                          padding: '2px 5px',
                          fontSize: '10px',
                          cursor: 'pointer',
                        }}
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
});
