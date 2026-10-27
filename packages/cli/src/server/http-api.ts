import http from 'http';
import fs from 'fs';
import path from 'path';
import { execSync, execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { WebSocket } from 'ws';
import { getRecentProjects, launchRecentProject } from '../session/recent-projects.js';
import { closeProvider, restartProvider, getHostTelemetry } from '../provider/provider-lifecycle.js';
import { getWorkspaceGitChanges } from '../hooks/ipc-server.js';
import { getLiveAgentQuotas } from '../session/quota-tracker.js';
import {
  getGitStatus,
  getGitDiff,
  getGitBranches,
  stageGitFile,
  unstageGitFile,
  discardGitFile,
  commitGitChanges,
  checkoutGitBranch,
} from '../session/git-service.js';
import { captureDesktopSnapshot } from './screen-capture.js';
import type { WsGateway } from './ws-gateway.js';

const _filename = typeof __filename !== 'undefined' ? __filename : fileURLToPath(import.meta.url);
const _dirname = typeof __dirname !== 'undefined' ? __dirname : path.dirname(_filename);

export function handleHttpRequest(gateway: WsGateway, req: http.IncomingMessage, res: http.ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const rawUrl = req.url || '/';
  const parsedUrl = new URL(rawUrl, 'http://localhost');
  const url = parsedUrl.pathname;

  // Allow public/benign endpoints without pairing token
  const isPublicEndpoint =
    url === '/health' ||
    url === '/api/health' ||
    url === '/api/apk-status' ||
    url === '/api/version' ||
    url === '/api/agent-quotas' ||
    url === '/api/quotas' ||
    url === '/download/app.apk' ||
    url === '/app.apk' ||
    url === '/download/kyber.vsix' ||
    url === '/download/extension.vsix' ||
    url === '/kyber.vsix' ||
    !url.startsWith('/api/');

  if (!isPublicEndpoint && !gateway.isRequestAuthorized(req, parsedUrl)) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized: Valid pairing token required' }));
    return;
  }

  if (url === '/health' || url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'ok',
        version: '0.1.0',
        workspacesCount: gateway.getWorkspaceManager().listWorkspaces().length,
        pendingApprovals: gateway.getHookIpc().getPendingRequests().length,
        connectedPhoneCount: gateway.getPhoneClients().size,
        lastPhoneActivity: gateway.getLastPhoneActivity(),
        mode: gateway.getMode(),
      })
    );
    return;
  }

  if (url === '/api/mode' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ mode: gateway.getMode(), connectedPhoneCount: gateway.getPhoneClients().size, lastPhoneActivity: gateway.getLastPhoneActivity() }));
    return;
  }

  if (url === '/api/mode' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        if (data.mode === 'desk' || data.mode === 'remote' || data.mode === 'auto' || data.mode === 'autonomous') {
          gateway.setMode(data.mode);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, mode: data.mode }));
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Mode must be desk, remote, auto, or autonomous' }));
        }
      } catch (err: any) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (url === '/api/policy' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ policy: gateway.getExecutionPolicy() }));
    return;
  }

  if (url === '/api/policy' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const pol = data.policy === 'autonomous' ? 'always_proceed' : data.policy;
        if (pol === 'force_ask' || pol === 'always_proceed') {
          gateway.setExecutionPolicy(pol);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, policy: pol }));
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Policy must be force_ask, always_proceed, or autonomous' }));
        }
      } catch (err: any) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if ((url === '/api/agent-quotas' || url === '/api/quotas') && req.method === 'GET') {
    const force = parsedUrl.searchParams.get('force') === 'true';
    getLiveAgentQuotas(force)
      .then(liveQuotas => {
        const quotas = liveQuotas.length > 0 ? liveQuotas : gateway.getIdeWatcher().getAgentQuotas();
        if (force && quotas.length > 0) {
          gateway.broadcast({
            type: 'server:agent_quotas',
            quotas,
          });
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, quotas, timestamp: Date.now() }));
      })
      .catch(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, quotas: gateway.getIdeWatcher().getAgentQuotas(), timestamp: Date.now() }));
      });
    return;
  }

  // Desktop Screen Snapshot Fallback (Transplant 3)
  if ((url === '/api/host/screen.jpg' || url === '/api/screen.jpg') && req.method === 'GET') {
    captureDesktopSnapshot()
      .then(jpeg => {
        if (!jpeg) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Desktop screen capture unavailable' }));
          return;
        }
        res.writeHead(200, {
          'Content-Type': 'image/jpeg',
          'Content-Length': jpeg.length,
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        });
        res.end(jpeg);
      })
      .catch(err => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      });
    return;
  }

  // --- Headless Git Working Tree API (Transplant 2) ---
  if ((url === '/api/git/status' || url === '/api/workspace/git/status') && req.method === 'GET') {
    try {
      const targetWs = gateway.resolveWorkspace(parsedUrl.searchParams.get('workspaceId'));
      getGitStatus(targetWs.path)
        .then(status => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, workspaceId: targetWs.id, workspacePath: targetWs.path, status, changes: status.files }));
        })
        .catch(err => {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        });
    } catch (err: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if ((url === '/api/git/diff' || url === '/api/workspace/git/diff') && req.method === 'GET') {
    try {
      const targetWs = gateway.resolveWorkspace(parsedUrl.searchParams.get('workspaceId'));
      const file = (parsedUrl.searchParams.get('file') || parsedUrl.searchParams.get('filePath') || parsedUrl.searchParams.get('path') || '').trim();
      const staged = parsedUrl.searchParams.get('staged') === 'true';
      getGitDiff(targetWs.path, file, staged)
        .then(diffData => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, ...diffData, filePath: file || null }));
        })
        .catch(err => {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        });
    } catch (err: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (url === '/api/git/branches' && req.method === 'GET') {
    try {
      const targetWs = gateway.resolveWorkspace(parsedUrl.searchParams.get('workspaceId'));
      getGitBranches(targetWs.path)
        .then(branches => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, ...branches }));
        })
        .catch(err => {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        });
    } catch (err: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (url === '/api/git/stage' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { workspaceId, file } = JSON.parse(body);
        const targetWs = gateway.resolveWorkspace(workspaceId);
        stageGitFile(targetWs.path, file)
          .then(result => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, ...result }));
          })
          .catch(err => {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
          });
      } catch (err: any) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (url === '/api/git/unstage' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { workspaceId, file } = JSON.parse(body);
        const targetWs = gateway.resolveWorkspace(workspaceId);
        unstageGitFile(targetWs.path, file)
          .then(result => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, ...result }));
          })
          .catch(err => {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
          });
      } catch (err: any) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (url === '/api/git/discard' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { workspaceId, file, untracked } = JSON.parse(body);
        const targetWs = gateway.resolveWorkspace(workspaceId);
        discardGitFile(targetWs.path, file, untracked)
          .then(result => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, ...result }));
          })
          .catch(err => {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
          });
      } catch (err: any) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (url === '/api/git/commit' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { workspaceId, message } = JSON.parse(body);
        const targetWs = gateway.resolveWorkspace(workspaceId);
        commitGitChanges(targetWs.path, message)
          .then(result => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, ...result }));
          })
          .catch(err => {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
          });
      } catch (err: any) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (url === '/api/git/checkout' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { workspaceId, branch, create } = JSON.parse(body);
        const targetWs = gateway.resolveWorkspace(workspaceId);
        checkoutGitBranch(targetWs.path, branch, create)
          .then(result => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, ...result }));
          })
          .catch(err => {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
          });
      } catch (err: any) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Live Workspace Directory Crawler for Mobile File Explorer
  if (url.startsWith('/api/workspace/files') || url.startsWith('/api/files')) {
    try {
      const parsed = new URL(url, 'http://localhost');
      const targetWs = gateway.resolveWorkspace(parsed.searchParams.get('workspaceId'));
      const rootPath = path.resolve(targetWs.path);
      const relSub = (parsed.searchParams.get('subPath') || '').replace(/^(\/|\\)+/, '');
      const targetPath = path.resolve(rootPath, relSub);
      const relFromRoot = path.relative(rootPath, targetPath);
      if (relFromRoot.startsWith('..') || path.isAbsolute(relFromRoot) || !fs.existsSync(targetPath)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Directory not found or invalid' }));
        return;
      }
      const dirents = fs.readdirSync(targetPath, { withFileTypes: true });
      const ignored = new Set(['.git', 'node_modules', 'dist', '.tempmediaStorage', '.gemini', 'coverage', '.idea', '.vscode']);
      const files = dirents
        .filter(d => !ignored.has(d.name))
        .map(d => ({
          name: d.name,
          isDirectory: d.isDirectory(),
          path: relSub ? `${relSub}/${d.name}` : d.name,
        }))
        .sort((a, b) => {
          if (a.isDirectory && !b.isDirectory) return -1;
          if (!a.isDirectory && b.isDirectory) return 1;
          return a.name.localeCompare(b.name);
        });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, workspaceId: targetWs.id, workspaceName: targetWs.name, subPath: relSub, files }));
    } catch (err: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Live Workspace File Content Reader for Mobile Explorer Preview
  if (url.startsWith('/api/workspace/file/content') || url.startsWith('/api/file/content')) {
    try {
      const parsed = new URL(url, 'http://localhost');
      const targetWs = gateway.resolveWorkspace(parsed.searchParams.get('workspaceId'));
      const rootPath = path.resolve(targetWs.path);
      const rawFile = (parsed.searchParams.get('filePath') || parsed.searchParams.get('path') || '').trim();
      let targetPath = '';
      if (path.isAbsolute(rawFile)) {
        targetPath = path.resolve(rawFile);
      } else {
        targetPath = path.resolve(rootPath, rawFile.replace(/^(\/|\\)+/, ''));
      }
      const allWorkspaces = gateway.getWorkspaceManager().listWorkspaces();
      const isInsideAnyWs = allWorkspaces.some(ws => {
        const wsRoot = path.resolve(ws.path);
        const rel = path.relative(wsRoot, targetPath);
        return !rel.startsWith('..') && !path.isAbsolute(rel);
      });
      const relToRoot = path.relative(rootPath, targetPath);
      const isInsideRoot = !relToRoot.startsWith('..') && !path.isAbsolute(relToRoot);
      const isInsideCodeRoots = gateway.getCodeRootsManager().isPathAllowed(targetPath);

      if ((!isInsideAnyWs && !isInsideRoot && !isInsideCodeRoots) || !fs.existsSync(targetPath) || fs.statSync(targetPath).isDirectory()) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'File not found or invalid' }));
        return;
      }
      const relFile = path.relative(rootPath, targetPath).replace(/\\/g, '/');
      const stat = fs.statSync(targetPath);
      const ext = path.extname(targetPath).toLowerCase();
      const isImage = ['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif'].includes(ext);

      let mimeType = 'text/plain';
      if (ext === '.md') mimeType = 'text/markdown';
      else if (ext === '.html') mimeType = 'text/html';
      else if (ext === '.json') mimeType = 'application/json';
      else if (ext === '.png') mimeType = 'image/png';
      else if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
      else if (ext === '.webp') mimeType = 'image/webp';
      else if (ext === '.svg') mimeType = 'image/svg+xml';

      if (isImage) {
        const data = fs.readFileSync(targetPath);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: true,
          path: relFile,
          name: path.basename(targetPath),
          size: stat.size,
          isText: false,
          base64: data.toString('base64'),
          mimeType,
        }));
        return;
      }

      if (stat.size > 500 * 1024) {
        const buf = Buffer.alloc(50 * 1024);
        const fd = fs.openSync(targetPath, 'r');
        fs.readSync(fd, buf, 0, 50 * 1024, 0);
        fs.closeSync(fd);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: true,
          path: relFile,
          name: path.basename(targetPath),
          size: stat.size,
          isText: true,
          truncated: true,
          content: buf.toString('utf8') + '\n\n... (truncated: file exceeds 500KB)',
          mimeType,
        }));
        return;
      }

      const content = fs.readFileSync(targetPath, 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        path: relFile,
        name: path.basename(targetPath),
        size: stat.size,
        isText: true,
        truncated: false,
        content,
        mimeType,
      }));
    } catch (err: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Live Session Artifacts List for Mobile Artifacts Viewer
  if (url.startsWith('/api/session/artifacts') && req.method === 'GET') {
    try {
      const artifacts = gateway.getIdeWatcher().getSessionArtifacts();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, artifacts, count: artifacts.length }));
    } catch (err: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Live Session Artifact Content Reader
  if (url.startsWith('/api/session/artifact/content') || url.startsWith('/api/session/artifact')) {
    try {
      const parsed = new URL(url, 'http://localhost');
      const relPath = (parsed.searchParams.get('path') || parsed.searchParams.get('name') || '').replace(/^(\/|\\)+/, '');
      if (!relPath) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing artifact path' }));
        return;
      }
      const data = gateway.getIdeWatcher().getArtifactContent(relPath);
      if (!data) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Artifact not found' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, ...data }));
    } catch (err: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }



  // Live Workspace Active Editor Tabs
  if (url.startsWith('/api/workspace/tabs') || url.startsWith('/api/tabs')) {
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          if (Array.isArray(data.tabs)) {
            gateway.setActiveTabs(data.tabs);
            gateway.broadcast({
              type: 'server:tabs_updated',
              tabs: data.tabs,
              workspaceId: data.workspaceId,
            });
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, count: (data.tabs || []).length }));
        } catch (e: any) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }
    const parsed = new URL(url, 'http://localhost');
    const targetWs = gateway.resolveWorkspace(parsed.searchParams.get('workspaceId'));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, tabs: gateway.getActiveTabs(targetWs.id) }));
    return;
  }

  // Open / Switch Tab in IDE
  if (url === '/api/tabs/open' || url === '/api/workspace/tabs/open') {
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          if (data.path) {
            gateway.broadcast({
              type: 'server:open_editor_tab',
              path: data.path,
            });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, path: data.path }));
            return;
          }
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing path in request body' }));
        } catch (e: any) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }
  }

  // Close Tab in IDE
  if (url === '/api/tabs/close' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const targetPath = data.path;
        const targetLabel = data.label;
        gateway.broadcast({
          type: 'server:close_editor_tab',
          path: targetPath,
          label: targetLabel,
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e: any) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // Close All Tabs in IDE
  if (url === '/api/tabs/close-all' && req.method === 'POST') {
    gateway.broadcast({
      type: 'server:close_all_editor_tabs',
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // Live Terminal Logs History
  if (url === '/api/terminal/history' || url.startsWith('/api/terminal/history')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, entries: gateway.getIdeWatcher().getTerminalHistory() }));
    return;
  }

  // Recent & Discovered Projects Hub API across all roots
  if (url === '/api/workspace/recent' || url === '/api/workspace/projects' || url === '/api/recent-projects' || url.startsWith('/api/workspace/recent')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, projects: gateway.getAllProjects() }));
    return;
  }

  // Launch Project in IDE
  if ((url === '/api/workspace/launch' || url === '/api/workspace/open') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        if (data.path) {
          const targetPath = path.resolve(data.path);
          const targetWs = gateway.getWorkspaceManager().registerWorkspace(targetPath);
          targetWs.lastActive = Date.now();

          const activeConvId = gateway.getIdeWatcher().autoDiscoverActiveConversation(targetPath);
          const history = activeConvId ? gateway.getIdeWatcher().getHistory() : [];
          const convTitle = activeConvId ? gateway.getIdeWatcher().getConversationTitle() : `Opening ${targetWs.name}...`;

          gateway.broadcast({
            type: 'server:active_workspace',
            workspaceId: targetWs.id,
          });
          gateway.broadcast({
            type: 'server:history',
            workspaceId: targetWs.id,
            messages: history,
            conversationTitle: convTitle,
          });
          gateway.broadcast({
            type: 'server:workspaces_updated',
            workspaces: gateway.getWorkspaceManager().listWorkspaces(),
          });

          const isAlive = gateway.isIdeActive();
          const forwardCb = isAlive ? (p: string) => {
            let sent = false;
            for (const extWs of gateway.getExtensionClients()) {
              if (extWs.readyState === WebSocket.OPEN) {
                extWs.send(JSON.stringify({ type: 'server:open_workspace', path: p }));
                sent = true;
              }
            }
            return sent;
          } : undefined;
          const result = await launchRecentProject(targetPath, forwardCb);
          gateway.broadcast({
            type: 'server:recent_projects_updated',
            projects: gateway.getAllProjects(),
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing project path' }));
        }
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Configured Code Roots (Multi-directory like emulator game folders)
  if (url === '/api/workspace/roots') {
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, roots: gateway.getCodeRootsManager().getRoots() }));
      return;
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const data = JSON.parse(body || '{}');
          const targetPath = data.path || data.root || data.dir;
          if (!targetPath) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing directory path' }));
            return;
          }
          const result = gateway.getCodeRootsManager().addRoot(targetPath);
          gateway.broadcast({
            type: 'server:recent_projects_updated',
            projects: gateway.getAllProjects(),
          });
          res.writeHead(result.ok ? 200 : 400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (err: any) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }
    if (req.method === 'DELETE') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const parsedBody = body ? JSON.parse(body) : {};
          const target = parsedUrl.searchParams.get('path') || parsedUrl.searchParams.get('root') || parsedBody.path || parsedBody.root;
          if (!target) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing directory path' }));
            return;
          }
          const result = gateway.getCodeRootsManager().removeRoot(target);
          gateway.broadcast({
            type: 'server:recent_projects_updated',
            projects: gateway.getAllProjects(),
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (err: any) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }
  }

  // Create New Project in Scoped Code Root
  if (url === '/api/workspace/create' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');
        const rootPath = data.rootPath || data.root || gateway.getCodeRootsManager().getRoots()[0];
        const projectName = data.name || data.projectName;
        if (!rootPath || !projectName) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing rootPath or project name' }));
          return;
        }
        const result = gateway.getCodeRootsManager().createProject(rootPath, projectName);
        if (result.ok) {
          gateway.broadcast({
            type: 'server:recent_projects_updated',
            projects: gateway.getAllProjects(),
          });
        }
        res.writeHead(result.ok ? 200 : 400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Host Hardware Telemetry API
  if (url === '/api/host/telemetry' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, telemetry: getHostTelemetry(gateway.isIdeActive() ? 'active' : 'dormant') }));
    return;
  }

  // Close IDE / Provider Process API
  if (url === '/api/host/close-ide' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = body ? JSON.parse(body) : {};
        const result = closeProvider(data.providerId || 'antigravity');
        gateway.broadcast({ type: 'server:ide_status', status: 'dormant' });
        gateway.broadcast({ type: 'server:host_telemetry', telemetry: getHostTelemetry('dormant', data.providerId || 'antigravity') });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Restart IDE / Provider Process API
  if (url === '/api/host/restart-ide' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const data = body ? JSON.parse(body) : {};
        const targetPath = gateway.resolveTargetWorkspace(data.path || data.workspacePath);
        gateway.getExtensionClients().clear();
        gateway.getExtensionWorkspaces().clear();
        gateway.broadcast({ type: 'server:ide_status', status: 'dormant' });
        const activeWs = gateway.getWorkspaceManager().listWorkspaces()[0];
        gateway.broadcast({
          type: 'server:chat_message',
          workspaceId: activeWs?.id || 'default',
          message: {
            id: `restart_ide_${Date.now()}`,
            role: 'system',
            content: `**Host IDE Restarting:** Executing detached batch restart script for Antigravity IDE...`,
            timestamp: Date.now(),
          },
        });
        const result = await restartProvider(data.providerId || 'antigravity', targetPath);
        gateway.broadcast({
          type: 'server:ide_status',
          status: result.ok ? 'active' : 'dormant',
        });
        gateway.broadcast({
          type: 'server:host_telemetry',
          telemetry: getHostTelemetry(result.ok ? 'active' : 'dormant', data.providerId || 'antigravity'),
        });
        gateway.broadcast({
          type: 'server:recent_projects_updated',
          projects: getRecentProjects(gateway.getWorkspaceManager().listWorkspaces()),
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Direct HTTP fallback for mobile approvals (notifications / background tasks)
  if ((url === '/api/hook/approval' || url === '/api/approval') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        if (payload && payload.requestId && payload.decision) {
          const pausedReq = gateway.getHookIpc().getPausedRequest(payload.requestId);
          if (pausedReq) {
            gateway.getHookIpc().clearPausedRequest(payload.requestId);
            gateway.getWorkspaceManager().removePendingApproval(payload.requestId);
            gateway.broadcast({
              type: 'server:approval_resolved',
              requestId: payload.requestId,
              decision: payload.decision,
            });
            if (payload.decision === 'allow') {
              const targetTool = pausedReq.toolTitle || pausedReq.toolCall?.name || 'action';
              gateway.handleSendPrompt(`[Approved via Mobile]: Proceed with ${targetTool}`, pausedReq.workspacePath);
            } else {
              const answerPrompt = payload.interceptPrompt || payload.reason;
              if (answerPrompt) {
                gateway.handleSendPrompt(answerPrompt, pausedReq.workspacePath);
              }
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, resumed: true }));
            return;
          }

          const ok = gateway.getHookIpc().resolveApproval(payload);
          gateway.getWorkspaceManager().removePendingApproval(payload.requestId);
          gateway.broadcast({
            type: 'server:approval_resolved',
            requestId: payload.requestId,
            decision: payload.decision,
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, resolved: ok }));
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing requestId or decision' }));
        }
      } catch (err: any) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Direct HTTP endpoint to clear any stale/ghost approvals
  if ((url === '/api/approvals/clear' || url === '/api/hook/clear') && req.method === 'POST') {
    gateway.getHookIpc().clearAllApprovals('Cleared by user via API');
    for (const ws of gateway.getWorkspaceManager().listWorkspaces()) {
      ws.pendingApprovals = [];
      if (ws.status === 'waiting_approval') ws.status = 'idle';
    }
    gateway.broadcast({
      type: 'server:workspaces_updated',
      workspaces: gateway.getWorkspaceManager().listWorkspaces(),
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, message: 'All pending approvals cleared' }));
    return;
  }

  // Direct HTTP fallback for prompts/messages (in case WebSocket is reconnecting)
  if ((url === '/api/prompt' || url === '/api/chat') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        if (data && (data.prompt || data.audio || (data.images && data.images.length > 0))) {
          const ok = gateway.handleSendPrompt(data.prompt || '', data.workspaceId, data.images, data.audio, data.model);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok }));
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing prompt or audio' }));
        }
      } catch (err: any) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Direct HTTP fallback for emergency stop / interrupt
  if ((url === '/api/stop' || url === '/api/abort') && req.method === 'POST') {
    const pending = gateway.getHookIpc().getPendingRequests();
    for (const p of pending) {
      gateway.getHookIpc().resolveApproval({
        requestId: p.id,
        decision: 'deny',
        reason: 'Aborted remotely via emergency stop',
      });
    }

    // Broadcast interrupt to all attached VS Code Extension Hosts
    for (const ext of gateway.getExtensionClients()) {
      if (ext.readyState === WebSocket.OPEN) {
        ext.send(JSON.stringify({ type: 'server:emergency_stop' }));
      }
    }

    const activeWs = gateway.getWorkspaceManager().listWorkspaces()[0];
    gateway.broadcast({
      type: 'server:chat_message',
      workspaceId: activeWs ? activeWs.id : 'default',
      message: {
        id: `stop_${Date.now()}`,
        role: 'system',
        content: 'Emergency Stop: All pending approvals denied and agent paused.',
        timestamp: Date.now(),
      },
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // Serve compiled Android APK
  if (url === '/download/app.apk' || url === '/app.apk') {
    const candidateApkPaths = [
      path.resolve(_dirname, '../../../../packages/web/android/app/build/outputs/apk/debug/app-debug.apk'),
      path.resolve(_dirname, '../apk/app-debug.apk'),
      path.resolve(_dirname, '../web/app-debug.apk'),
      path.resolve(process.cwd(), 'packages/web/android/app/build/outputs/apk/debug/app-debug.apk'),
      path.resolve(process.cwd(), 'packages/cli/dist/apk/app-debug.apk'),
    ];
    const existingApks = candidateApkPaths
      .filter(p => fs.existsSync(p))
      .map(p => ({ path: p, mtime: fs.statSync(p).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    const apkPath = existingApks[0]?.path;
    if (apkPath) {
      const stat = fs.statSync(apkPath);
      res.writeHead(200, {
        'Content-Type': 'application/vnd.android.package-archive',
        'Content-Disposition': 'attachment; filename="AntigravityCompanion.apk"',
        'Content-Length': stat.size,
      });
      fs.createReadStream(apkPath).pipe(res);
      return;
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'APK is compiling or not found' }));
      return;
    }
  }

  // Serve compiled VS Code VSIX extension package
  if (url === '/download/kyber.vsix' || url === '/download/extension.vsix' || url === '/kyber.vsix') {
    const candidateVsixPaths = [
      path.resolve(_dirname, '../../../../packages/vscode-extension/antigravity-companion-0.1.0.vsix'),
      path.resolve(_dirname, '../extension/antigravity-companion-0.1.0.vsix'),
      path.resolve(process.cwd(), 'packages/vscode-extension/antigravity-companion-0.1.0.vsix'),
    ];
    const vsixPath = candidateVsixPaths.find(p => fs.existsSync(p));
    if (vsixPath) {
      const stat = fs.statSync(vsixPath);
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': 'attachment; filename="kyber-0.1.0.vsix"',
        'Content-Length': stat.size,
      });
      fs.createReadStream(vsixPath).pipe(res);
      return;
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'VSIX package not found' }));
      return;
    }
  }

  // Serve APK build status / version
  if (url === '/api/apk-status' || url === '/api/version') {
    const details = gateway.getApkDetails();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ version: '0.1.0', ...details }));
    return;
  }

  // Serve built web companion UI
  if (gateway.serveStatic(url, res)) {
    return;
  }

  res.writeHead(404);
  res.end();
}
