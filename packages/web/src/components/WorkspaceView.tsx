import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { EditorTab, RecentProject } from '@agy-companion/protocol';
import {
  FileCode,
  Monitor,
  Eye,
  Circle,
  Folder,
  FolderPlus,
  Plus,
  Trash2,
  RefreshCw,
  Search,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  Layers,
  Sparkles,
  X,
  GitBranch,
} from 'lucide-react';
import { FileTypeBadge, triggerHaptic } from './CommonUI';
import { getApiBaseUrl } from '../utils/api';
import { GitChangesView } from './GitChangesView';
import { ScreenSnapshotView } from './ScreenSnapshotView';

export interface FileEntry {
  name: string;
  isDirectory: boolean;
  path: string;
  size?: number;
}

interface WorkspaceViewProps {
  tabs: EditorTab[];
  activeWorkspaceId?: string;
  activeWorkspaceName?: string;
  onSelectTab: (tab: EditorTab) => void;
  onInspectTab: (tab: EditorTab) => void;
  onOpenExplorer?: () => void;
  modifiedFiles?: { file: string; fullPath?: string }[];
  host?: string;
  port?: string;
  getAuthHeaders?: () => Record<string, string>;
  recentProjects?: RecentProject[];
  onLaunchRecentProject?: (path: string) => void;
  onPreviewFile?: (file: { path: string; name: string }) => void;
  onCloseTab?: (tab: EditorTab) => void;
  onCloseAllTabs?: () => void;
}

export const WorkspaceView: React.FC<WorkspaceViewProps> = React.memo(({
  tabs,
  activeWorkspaceId,
  activeWorkspaceName,
  onSelectTab,
  onInspectTab,
  modifiedFiles = [],
  host = '127.0.0.1',
  port = '4040',
  getAuthHeaders,
  recentProjects = [],
  onLaunchRecentProject,
  onPreviewFile,
  onCloseTab,
  onCloseAllTabs,
}) => {
  const [activeFilter, setActiveFilter] = useState<'all' | 'tabs' | 'files' | 'projects' | 'changes' | 'screen'>('all');
  const [roots, setRoots] = useState<string[]>([]);
  const [loadingRoots, setLoadingRoots] = useState<boolean>(false);
  const [showAddRootModal, setShowAddRootModal] = useState<boolean>(false);
  const [newRootInput, setNewRootInput] = useState<string>('');
  const [showNewProjectModal, setShowNewProjectModal] = useState<boolean>(false);
  const [newProjectName, setNewProjectName] = useState<string>('');
  const [selectedRootForNew, setSelectedRootForNew] = useState<string>('');
  const [creatingProject, setCreatingProject] = useState<boolean>(false);
  const [projectSearch, setProjectSearch] = useState<string>('');

  // File tree state
  const [workspaceFiles, setWorkspaceFiles] = useState<Record<string, FileEntry[]>>({});
  const [loadingTreePaths, setLoadingTreePaths] = useState<Record<string, boolean>>({});
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});

  const [launchingProject, setLaunchingProject] = useState<string | null>(null);
  const [fileTreeError, setFileTreeError] = useState<string | null>(null);

  const modifiedSet = useMemo(() => new Set(modifiedFiles.map(f => f.file)), [modifiedFiles]);
  const httpBase = useMemo(() => getApiBaseUrl(host, port), [host, port]);

  const authHeaders = useMemo(() => {
    return getAuthHeaders ? getAuthHeaders() : { 'Content-Type': 'application/json' };
  }, [getAuthHeaders]);

  // Fetch Code Roots
  const fetchRoots = useCallback(async () => {
    setLoadingRoots(true);
    try {
      const res = await fetch(`${httpBase}/api/workspace/roots`, {
        headers: authHeaders,
      });
      if (res.ok) {
        const data = await res.json();
        if (data.roots) {
          setRoots(data.roots);
          if (data.roots.length > 0) {
            setSelectedRootForNew(prev => prev || data.roots[0]);
          }
        }
      }
    } catch {}
    setLoadingRoots(false);
  }, [httpBase, authHeaders]);

  // Fetch Files in subPath
  const fetchFiles = useCallback(async (subPath: string = '') => {
    setLoadingTreePaths(prev => ({ ...prev, [subPath]: true }));
    setFileTreeError(null);
    try {
      const qs = new URLSearchParams();
      if (activeWorkspaceId) qs.set('workspaceId', activeWorkspaceId);
      if (subPath) qs.set('subPath', subPath);

      const res = await fetch(`${httpBase}/api/workspace/files?${qs.toString()}`, {
        headers: authHeaders,
      });
      if (res.ok) {
        const data = await res.json();
        if (data.files) {
          setWorkspaceFiles(prev => ({ ...prev, [subPath]: data.files }));
        }
      } else {
        const err = await res.json().catch(() => ({ error: 'Failed to load files' }));
        setFileTreeError(err.error || 'Failed to load directory');
      }
    } catch (err: any) {
      setFileTreeError(err?.message || 'Connection error loading files');
    } finally {
      setLoadingTreePaths(prev => ({ ...prev, [subPath]: false }));
    }
  }, [httpBase, activeWorkspaceId, authHeaders]);

  useEffect(() => {
    setWorkspaceFiles({});
    setExpandedFolders({});
    setFileTreeError(null);
    fetchRoots();
    fetchFiles('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspaceId]);

  const handleAddRoot = async () => {
    if (!newRootInput.trim()) return;
    triggerHaptic(20);
    try {
      const res = await fetch(`${httpBase}/api/workspace/roots`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ path: newRootInput.trim(), root: newRootInput.trim() }),
      });
      if (res.ok) {
        setNewRootInput('');
        setShowAddRootModal(false);
        fetchRoots();
      }
    } catch {}
  };

  const handleRemoveRoot = async (rootToRemove: string) => {
    triggerHaptic(20);
    try {
      const res = await fetch(`${httpBase}/api/workspace/roots`, {
        method: 'DELETE',
        headers: authHeaders,
        body: JSON.stringify({ path: rootToRemove, root: rootToRemove }),
      });
      if (res.ok) {
        fetchRoots();
      }
    } catch {}
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim() || !selectedRootForNew) return;
    triggerHaptic(20);
    setCreatingProject(true);
    try {
      const res = await fetch(`${httpBase}/api/workspace/create`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          rootPath: selectedRootForNew,
          root: selectedRootForNew,
          name: newProjectName.trim(),
          projectName: newProjectName.trim(),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setNewProjectName('');
        setShowNewProjectModal(false);
        const targetPath = data.projectPath || data.path;
        if (targetPath && onLaunchRecentProject) {
          onLaunchRecentProject(targetPath);
        }
        fetchRoots();
      }
    } catch {}
    setCreatingProject(false);
  };

  const toggleFolder = (subPath: string) => {
    triggerHaptic(15);
    const nextState = !expandedFolders[subPath];
    setExpandedFolders(prev => ({ ...prev, [subPath]: nextState }));
    if (nextState && !workspaceFiles[subPath]) {
      fetchFiles(subPath);
    }
  };

  // Filtered projects
  const filteredProjects = useMemo(() => {
    if (!projectSearch.trim()) return recentProjects;
    const q = projectSearch.toLowerCase();
    return recentProjects.filter(p => p.name.toLowerCase().includes(q) || p.path.toLowerCase().includes(q));
  }, [recentProjects, projectSearch]);

  const renderFileNode = (subPath: string, depth: number = 0) => {
    if (depth > 8) {
      return (
        <div style={{ paddingLeft: `${8 + depth * 14}px`, padding: '4px 8px', fontSize: '11px', color: '#71717a' }}>
          Depth limit reached
        </div>
      );
    }

    const items = workspaceFiles[subPath];
    const isLoading = Boolean(loadingTreePaths[subPath]);

    if (isLoading && (!items || items.length === 0)) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px', paddingLeft: `${8 + depth * 14}px`, fontSize: '11px', color: '#71717a' }}>
          <RefreshCw size={12} className="animate-spin" />
          <span>Loading files...</span>
        </div>
      );
    }

    if (items === undefined) {
      return (
        <div style={{ padding: '6px 12px', paddingLeft: `${8 + depth * 14}px`, fontSize: '11.5px', color: '#71717a' }}>
          <button
            onClick={() => fetchFiles(subPath)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#0078d4',
              fontSize: '11.5px',
              cursor: 'pointer',
              padding: 0,
              textDecoration: 'underline',
            }}
          >
            Load files...
          </button>
        </div>
      );
    }

    if (items.length === 0) {
      return (
        <div style={{ padding: '8px 12px', paddingLeft: `${8 + depth * 14}px`, fontSize: '11.5px', color: '#71717a', fontStyle: 'italic', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>{fileTreeError || 'No files in this folder'}</span>
          <button
            onClick={() => fetchFiles(subPath)}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '4px',
              padding: '2px 8px',
              color: '#cccccc',
              fontSize: '11px',
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      );
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {items.map(item => {
          const itemSubPath = item.path;
          const isExpanded = Boolean(expandedFolders[itemSubPath]);

          if (item.isDirectory) {
            return (
              <div key={item.path} style={{ display: 'flex', flexDirection: 'column' }}>
                <div
                  onClick={() => toggleFolder(itemSubPath)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 8px',
                    paddingLeft: `${8 + depth * 14}px`,
                    borderRadius: '6px',
                    cursor: 'pointer',
                    userSelect: 'none',
                    fontSize: '12px',
                    color: '#e4e4e7',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#222226')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  {isExpanded ? <ChevronDown size={14} color="#71717a" /> : <ChevronRight size={14} color="#71717a" />}
                  <Folder size={14} color="#a1a1aa" />
                  <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.name}
                  </span>
                </div>
                {isExpanded && renderFileNode(itemSubPath, depth + 1)}
              </div>
            );
          }

          return (
            <div
              key={item.path}
              onClick={() => {
                triggerHaptic(15);
                if (onPreviewFile) {
                  onPreviewFile({ path: item.path, name: item.name });
                } else {
                  onInspectTab({ label: item.name, path: item.path, isDirty: false, isActive: false });
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '5px 8px',
                paddingLeft: `${22 + depth * 14}px`,
                borderRadius: '6px',
                cursor: 'pointer',
                userSelect: 'none',
                fontSize: '11.5px',
                color: '#cccccc',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#222226')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                <FileTypeBadge name={item.name} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.name}
                </span>
              </div>
              <Eye size={12} color="#71717a" style={{ flexShrink: 0 }} />
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        paddingBottom: '32px',
      }}
    >
      {/* Sub-navigation Filter Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          overflowX: 'auto',
          padding: '2px 0 6px 0',
          scrollbarWidth: 'none',
        }}
      >
        <button
          onClick={() => {
            triggerHaptic(15);
            setActiveFilter('all');
          }}
          style={{
            background: activeFilter === 'all' ? '#27272a' : '#18181b',
            border: activeFilter === 'all' ? '1px solid rgba(255, 255, 255, 0.3)' : '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '6px',
            padding: '5px 10px',
            color: activeFilter === 'all' ? '#ffffff' : '#8e8e93',
            fontSize: '11px',
            fontWeight: activeFilter === 'all' ? 600 : 500,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          All
        </button>

        <button
          onClick={() => {
            triggerHaptic(15);
            setActiveFilter('tabs');
          }}
          style={{
            background: activeFilter === 'tabs' ? '#27272a' : '#18181b',
            border: activeFilter === 'tabs' ? '1px solid rgba(255, 255, 255, 0.3)' : '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '6px',
            padding: '5px 10px',
            color: activeFilter === 'tabs' ? '#ffffff' : '#8e8e93',
            fontSize: '11px',
            fontWeight: activeFilter === 'tabs' ? 600 : 500,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            whiteSpace: 'nowrap',
          }}
        >
          <span>Open Tabs</span>
          <span
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              borderRadius: '4px',
              padding: '1px 4px',
              fontSize: '10px',
            }}
          >
            {tabs.length}
          </span>
        </button>

        <button
          onClick={() => {
            triggerHaptic(15);
            setActiveFilter('changes');
          }}
          style={{
            background: activeFilter === 'changes' ? '#27272a' : '#18181b',
            border: activeFilter === 'changes' ? '1px solid rgba(255, 255, 255, 0.3)' : '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '6px',
            padding: '5px 10px',
            color: activeFilter === 'changes' ? '#ffffff' : '#8e8e93',
            fontSize: '11px',
            fontWeight: activeFilter === 'changes' ? 600 : 500,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            whiteSpace: 'nowrap',
          }}
        >
          <GitBranch size={11} color={activeFilter === 'changes' ? '#ffffff' : '#8e8e93'} />
          <span>Git Changes</span>
          {modifiedFiles.length > 0 && (
            <span
              style={{
                background: 'rgba(255, 255, 255, 0.15)',
                color: '#ffffff',
                borderRadius: '4px',
                padding: '1px 4px',
                fontSize: '10px',
                fontWeight: 700,
              }}
            >
              {modifiedFiles.length}
            </span>
          )}
        </button>

        <button
          onClick={() => {
            triggerHaptic(15);
            setActiveFilter('files');
          }}
          style={{
            background: activeFilter === 'files' ? '#27272a' : '#18181b',
            border: activeFilter === 'files' ? '1px solid rgba(255, 255, 255, 0.3)' : '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '6px',
            padding: '5px 10px',
            color: activeFilter === 'files' ? '#ffffff' : '#8e8e93',
            fontSize: '11px',
            fontWeight: activeFilter === 'files' ? 600 : 500,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          File Tree
        </button>

        <button
          onClick={() => {
            triggerHaptic(15);
            setActiveFilter('projects');
          }}
          style={{
            background: activeFilter === 'projects' ? '#27272a' : '#18181b',
            border: activeFilter === 'projects' ? '1px solid rgba(255, 255, 255, 0.3)' : '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '6px',
            padding: '5px 10px',
            color: activeFilter === 'projects' ? '#ffffff' : '#8e8e93',
            fontSize: '11px',
            fontWeight: activeFilter === 'projects' ? 600 : 500,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            whiteSpace: 'nowrap',
          }}
        >
          <span>Code Roots & Projects</span>
          <span
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              color: '#ffffff',
              borderRadius: '4px',
              padding: '1px 4px',
              fontSize: '10px',
            }}
          >
            {recentProjects.length}
          </span>
        </button>

        <button
          onClick={() => {
            triggerHaptic(15);
            setActiveFilter('screen');
          }}
          style={{
            background: activeFilter === 'screen' ? '#27272a' : '#18181b',
            border: activeFilter === 'screen' ? '1px solid rgba(255, 255, 255, 0.3)' : '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '6px',
            padding: '5px 10px',
            color: activeFilter === 'screen' ? '#ffffff' : '#8e8e93',
            fontSize: '11px',
            fontWeight: activeFilter === 'screen' ? 600 : 500,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            whiteSpace: 'nowrap',
          }}
        >
          <Monitor size={11} color={activeFilter === 'screen' ? '#ffffff' : '#8e8e93'} />
          <span>Desktop Screen</span>
        </button>
      </div>

      {/* SECTION: Desktop Screen Snapshot */}
      {activeFilter === 'screen' && (
        <ScreenSnapshotView
          host={host}
          port={port}
          getAuthHeaders={getAuthHeaders}
          activeWorkspaceId={activeWorkspaceId}
        />
      )}

      {/* SECTION: Git Working Tree Changes */}
      {activeFilter === 'changes' && (
        <GitChangesView
          host={host}
          port={port}
          getAuthHeaders={getAuthHeaders}
          activeWorkspaceId={activeWorkspaceId}
        />
      )}

      {/* SECTION 1: Open Editor Tabs */}
      {(activeFilter === 'all' || activeFilter === 'tabs') && (
        <div
          style={{
            background: '#19191b',
            border: '1px solid rgba(255, 255, 255, 0.07)',
            borderRadius: '8px',
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Layers size={14} color="#ffffff" />
              <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#ffffff' }}>
                Open Tabs on PC ({tabs.length})
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {onCloseAllTabs && tabs.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic(25);
                    onCloseAllTabs();
                  }}
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '4px',
                    color: '#a1a1aa',
                    fontSize: '10.5px',
                    fontWeight: 500,
                    padding: '2px 7px',
                    cursor: 'pointer',
                  }}
                >
                  Close All
                </button>
              )}
              <span style={{ fontSize: '11px', color: '#71717a' }}>
                {activeWorkspaceName || 'Current Workspace'}
              </span>
            </div>
          </div>

          {tabs.length === 0 ? (
            <div
              style={{
                padding: '16px',
                textAlign: 'center',
                color: '#71717a',
                fontSize: '12px',
                background: 'rgba(255, 255, 255, 0.02)',
                borderRadius: '6px',
              }}
            >
              No active editor tabs open in IDE.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {tabs.map((tab, idx) => {
                const isModified = modifiedSet.has(tab.label);
                const isActive = Boolean(tab.isActive);

                return (
                  <div
                    key={`${tab.path || tab.label}-${idx}`}
                    style={{
                      background: isActive ? '#222226' : '#1c1c1f',
                      border: isActive ? '1px solid rgba(255, 255, 255, 0.25)' : '1px solid rgba(255, 255, 255, 0.05)',
                      borderRadius: '6px',
                      padding: '8px 10px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                      <FileTypeBadge name={tab.label} />
                      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <span
                            style={{
                              fontSize: '12px',
                              fontWeight: isActive ? 600 : 500,
                              color: isActive ? '#ffffff' : '#d4d4d8',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {tab.label}
                          </span>
                          {tab.isDirty && <Circle size={5} fill="#ffffff" color="#ffffff" style={{ opacity: 0.8 }} />}
                          {isModified && (
                            <span
                              style={{
                                fontSize: '9px',
                                color: '#fbbf24',
                                fontWeight: 700,
                                background: 'rgba(251, 191, 36, 0.1)',
                                padding: '1px 3px',
                                borderRadius: '3px',
                              }}
                            >
                              MODIFIED
                            </span>
                          )}
                        </div>
                        {tab.path && tab.path !== tab.label && (
                          <span
                            style={{
                              fontSize: '10px',
                              fontFamily: 'monospace',
                              color: '#71717a',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {tab.path}
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                      <button
                        onClick={() => {
                          triggerHaptic(15);
                          onSelectTab(tab);
                        }}
                        title="Focus on PC"
                        style={{
                          background: isActive ? '#ffffff' : '#27272a',
                          border: isActive ? 'none' : '1px solid rgba(255, 255, 255, 0.08)',
                          borderRadius: '5px',
                          padding: '5px 8px',
                          color: isActive ? '#000000' : '#ffffff',
                          fontSize: '11px',
                          fontWeight: isActive ? 700 : 500,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <Monitor size={11} color={isActive ? '#000000' : '#ffffff'} />
                        <span>{isActive ? 'Active' : 'Focus'}</span>
                      </button>

                      <button
                        onClick={() => {
                          triggerHaptic(15);
                          onInspectTab(tab);
                        }}
                        title="Preview Code"
                        style={{
                          background: '#27272a',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                          borderRadius: '5px',
                          padding: '5px 8px',
                          color: '#e4e4e7',
                          fontSize: '11px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <Eye size={11} />
                      </button>

                      {onCloseTab && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            triggerHaptic(15);
                            onCloseTab(tab);
                          }}
                          title="Close tab"
                          style={{
                            background: '#27272a',
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                            borderRadius: '5px',
                            padding: '5px 7px',
                            color: '#a1a1aa',
                            fontSize: '11px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <X size={11} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SECTION 2: Current Workspace File Tree */}
      {(activeFilter === 'all' || activeFilter === 'files') && (
        <div
          style={{
            background: '#19191b',
            border: '1px solid rgba(255, 255, 255, 0.07)',
            borderRadius: '8px',
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Folder size={14} color="#a1a1aa" />
              <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#ffffff' }}>
                Files in {activeWorkspaceName || 'Workspace'}
              </span>
            </div>
            <button
              onClick={() => {
                triggerHaptic(15);
                fetchFiles('');
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#71717a',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
              }}
              title="Refresh Files"
            >
              <RefreshCw size={12} className={loadingTreePaths[''] ? 'animate-spin' : ''} />
            </button>
          </div>

          <div
            style={{
              background: '#141416',
              border: '1px solid rgba(255, 255, 255, 0.04)',
              borderRadius: '6px',
              padding: '6px 4px',
              maxHeight: '380px',
              overflowY: 'auto',
            }}
          >
            {renderFileNode('', 0)}
          </div>
        </div>
      )}

      {/* SECTION 3: Code Roots & Projects Hub (Multi-Directory / Emulator Style) */}
      {(activeFilter === 'all' || activeFilter === 'projects') && (
        <div
          style={{
            background: '#19191b',
            border: '1px solid rgba(255, 255, 255, 0.07)',
            borderRadius: '8px',
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Sparkles size={14} color="#ffffff" />
              <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#ffffff' }}>
                Code Roots & Projects Hub
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                onClick={() => {
                  triggerHaptic(15);
                  setShowAddRootModal(true);
                }}
                style={{
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '5px',
                  padding: '4px 8px',
                  color: '#ffffff',
                  fontSize: '11px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <Plus size={11} />
                <span>Add Root</span>
              </button>

              <button
                onClick={() => {
                  triggerHaptic(15);
                  setShowNewProjectModal(true);
                }}
                style={{
                  background: '#ffffff',
                  border: 'none',
                  borderRadius: '5px',
                  padding: '4px 9px',
                  color: '#000000',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  boxShadow: '0 1px 6px rgba(0, 0, 0, 0.4)',
                }}
              >
                <FolderPlus size={11} color="#000000" />
                <span>New Project</span>
              </button>
            </div>
          </div>

          {/* Configured Roots Pills */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '10.5px', color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Active Scan Directories (Emulator Style)
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {roots.map(r => (
                <div
                  key={r}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '3px 8px',
                    background: '#141416',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '5px',
                    fontSize: '11px',
                    fontFamily: 'monospace',
                    color: '#e4e4e7',
                  }}
                >
                  <Folder size={11} color="#a1a1aa" />
                  <span>{r}</span>
                  {roots.length > 1 && (
                    <button
                      onClick={() => handleRemoveRoot(r)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#ef4444',
                        cursor: 'pointer',
                        padding: '1px',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                      title="Remove Root"
                    >
                      <Trash2 size={10} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Search bar for 20-30 projects */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: '#141416',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '6px',
              padding: '6px 8px',
            }}
          >
            <Search size={13} color="#71717a" />
            <input
              type="text"
              placeholder={`Search ${recentProjects.length} projects across drives...`}
              value={projectSearch}
              onChange={e => setProjectSearch(e.target.value)}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                color: '#ffffff',
                fontSize: '11.5px',
                outline: 'none',
              }}
            />
            {projectSearch && (
              <button
                onClick={() => setProjectSearch('')}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#71717a',
                  cursor: 'pointer',
                  fontSize: '11px',
                }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Projects List */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              maxHeight: '340px',
              overflowY: 'auto',
            }}
          >
            {filteredProjects.length === 0 ? (
              <div style={{ padding: '16px', textAlign: 'center', color: '#71717a', fontSize: '11.5px' }}>
                No projects matched your search.
              </div>
            ) : (
              filteredProjects.map((p, idx) => (
                <div
                  key={`${p.path}-${idx}`}
                  style={{
                    background: '#1c1c1f',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                    borderRadius: '6px',
                    padding: '8px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.name}
                      </span>
                    </div>
                    <span style={{ fontSize: '10.5px', fontFamily: 'monospace', color: '#71717a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.path}
                    </span>
                  </div>

                  <button
                    disabled={launchingProject === p.path}
                    onClick={async () => {
                      triggerHaptic(20);
                      setLaunchingProject(p.path);
                      try {
                        if (onLaunchRecentProject) {
                          await onLaunchRecentProject(p.path);
                        }
                      } finally {
                        setTimeout(() => setLaunchingProject(null), 1500);
                      }
                    }}
                    style={{
                      background: launchingProject === p.path ? '#ffffff' : '#27272a',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '5px',
                      padding: '5px 8px',
                      color: launchingProject === p.path ? '#000000' : '#ffffff',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: launchingProject === p.path ? 'default' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      flexShrink: 0,
                    }}
                  >
                    {launchingProject === p.path ? (
                      <>
                        <RefreshCw size={11} className="animate-spin" />
                        <span>Opening...</span>
                      </>
                    ) : (
                      <>
                        <ExternalLink size={11} />
                        <span>Open</span>
                      </>
                    )}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Add Code Root Modal */}
      {showAddRootModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px',
          }}
        >
          <div
            style={{
              background: '#1e1e22',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              padding: '16px',
              maxWidth: '380px',
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#ffffff' }}>
                Add Code Root Directory
              </span>
              <button
                onClick={() => setShowAddRootModal(false)}
                style={{ background: 'transparent', border: 'none', color: '#71717a', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>
            <p style={{ margin: 0, fontSize: '11.5px', color: '#a0a0a0', lineHeight: '1.4' }}>
              Provide an absolute path on your host PC (e.g. <code>d:\CODE</code> or <code>c:\Projects</code>). The companion will auto-scan all sub-projects.
            </p>
            <input
              type="text"
              placeholder="e.g. d:\Projects"
              value={newRootInput}
              onChange={e => setNewRootInput(e.target.value)}
              style={{
                background: '#141416',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '6px',
                padding: '8px 10px',
                color: '#ffffff',
                fontSize: '12px',
                outline: 'none',
              }}
            />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
              <button
                onClick={() => setShowAddRootModal(false)}
                style={{
                  background: '#27272a',
                  border: 'none',
                  borderRadius: '5px',
                  padding: '6px 12px',
                  color: '#cccccc',
                  fontSize: '11.5px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleAddRoot}
                disabled={!newRootInput.trim()}
                style={{
                  background: '#ffffff',
                  border: 'none',
                  borderRadius: '5px',
                  padding: '6px 14px',
                  color: '#000000',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Add Root
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create New Project Modal */}
      {showNewProjectModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px',
          }}
        >
          <div
            style={{
              background: '#1e1e22',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              padding: '16px',
              maxWidth: '380px',
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#ffffff' }}>
                Create New Project
              </span>
              <button
                onClick={() => setShowNewProjectModal(false)}
                style={{ background: 'transparent', border: 'none', color: '#71717a', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>
            <p style={{ margin: 0, fontSize: '11.5px', color: '#a0a0a0', lineHeight: '1.4' }}>
              Directly initializes a new folder, runs <code>git init</code>, installs companion hooks, and launches it in your IDE.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', color: '#71717a' }}>Target Code Root</label>
              <select
                value={selectedRootForNew}
                onChange={e => setSelectedRootForNew(e.target.value)}
                style={{
                  background: '#141416',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '6px',
                  padding: '7px 10px',
                  color: '#ffffff',
                  fontSize: '12px',
                  outline: 'none',
                }}
              >
                {roots.map(r => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', color: '#71717a' }}>Project Name</label>
              <input
                type="text"
                placeholder="e.g. awesome-agent"
                value={newProjectName}
                onChange={e => setNewProjectName(e.target.value)}
                style={{
                  background: '#141416',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '6px',
                  padding: '8px 10px',
                  color: '#ffffff',
                  fontSize: '12px',
                  outline: 'none',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
              <button
                onClick={() => setShowNewProjectModal(false)}
                style={{
                  background: '#27272a',
                  border: 'none',
                  borderRadius: '5px',
                  padding: '6px 12px',
                  color: '#cccccc',
                  fontSize: '11.5px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateProject}
                disabled={!newProjectName.trim() || !selectedRootForNew || creatingProject}
                style={{
                  background: '#ffffff',
                  border: 'none',
                  borderRadius: '5px',
                  padding: '6px 14px',
                  color: '#000000',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  opacity: creatingProject ? 0.6 : 1,
                }}
              >
                {creatingProject ? 'Creating...' : 'Create & Open'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export const WorkspaceTabsView = WorkspaceView;
