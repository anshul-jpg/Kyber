import { spawn, ChildProcess, execSync } from 'child_process';
import http from 'http';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import WebSocket from 'ws';
import * as vscode from 'vscode';
import {
  ApprovalRequest,
  WsServerMessage,
  WsClientMessage,
  DEFAULT_DAEMON_PORT,
  HOOK_IPC_PORT,
  encodePairingTicket,
  QuickAction,
  EditorTab,
  ExecutionPolicy,
} from '@agy-companion/protocol';
import { DaemonStatus, PairingEndpoint, ConnectedDevice, CompanionMode, MeshStatus, LogLine } from './types';

export class DaemonManager extends EventEmitter {
  private daemonProcess: ChildProcess | null = null;
  private wsClient: WebSocket | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private idleTimer: NodeJS.Timeout | null = null;
  private status: DaemonStatus = 'stopped';
  private outputChannel: vscode.OutputChannel;
  private endpoints: PairingEndpoint[] = [];
  private pendingApprovals: Map<string, ApprovalRequest> = new Map();
  private connectedDevices: Map<string, ConnectedDevice> = new Map();
  private currentMode: CompanionMode = 'remote';
  private logLines: LogLine[] = [];
  private maxLogs: number = 50;
  private phoneCount: number = 0;
  private tailscaleDetected: boolean = false;
  private tailscaleIp: string | null = null;
  private cloudflareActive: boolean = false;
  private cloudflareUrl: string | null = null;
  private lastActivityTimestamp: number = Date.now();
  private userExplicitlyStopped: boolean = false;
  private pendingDialogResolvers: Map<string, (choice: { decision: string; option?: number }) => void> = new Map();

  constructor(private context: vscode.ExtensionContext) {
    super();
    this.outputChannel = vscode.window.createOutputChannel('Antigravity Companion');
    this.loadGlobalMode();
  }

  public isUserExplicitlyStopped(): boolean {
    return this.userExplicitlyStopped;
  }

  public getStatus(): DaemonStatus {
    return this.status;
  }

  public getMode(): CompanionMode {
    return this.currentMode;
  }

  public getEffectiveMode(): 'remote' | 'desk' | 'autonomous' {
    if (this.currentMode === 'auto') {
      return 'autonomous';
    }
    return this.currentMode;
  }

  public getEndpoints(): PairingEndpoint[] {
    return this.endpoints;
  }

  public getPendingApprovals(): ApprovalRequest[] {
    return Array.from(this.pendingApprovals.values());
  }

  public getConnectedDevices(): ConnectedDevice[] {
    return Array.from(this.connectedDevices.values());
  }

  public getLogLines(): LogLine[] {
    return this.logLines;
  }

  public clearLogs(): void {
    this.logLines = [];
    this.emit('logs_changed', this.logLines);
  }

  public getMeshStatus(): MeshStatus {
    return {
      tailscaleMeshed: this.tailscaleDetected || this.endpoints.some(e => e.type === 'tailscale' && e.isAvailable),
      tailscaleIp: this.tailscaleIp || null,
      cloudflareRouting: this.cloudflareActive || this.endpoints.some(e => e.type === 'cloudflare' && e.isAvailable),
      cloudflareUrl: this.cloudflareUrl || null,
      phoneConnected: this.phoneCount > 0,
      phoneCount: this.phoneCount,
    };
  }

  public getQuickActions(): QuickAction[] {
    const config = vscode.workspace.getConfiguration('antigravityCompanion');
    const actions = config.get<Array<{ label: string; command: string }>>('quickActions', []);
    return actions.map((a, i) => ({ id: `qa_${i}`, label: a.label, command: a.command }));
  }

  public executeQuickAction(command: string, label?: string): void {
    this.recordActivity();
    let term = vscode.window.terminals.find(t => t.name === 'Antigravity Companion');
    if (!term) {
      term = vscode.window.createTerminal('Antigravity Companion');
    }
    term.show(true);
    term.sendText(command);
    this.addLogLine(`[Quick Action] Executing: ${command}`, 'ipc');
    vscode.window.showInformationMessage(`[Antigravity Companion] Running quick action: ${label || command}`);
  }

  // --- Secret Storage for Cloudflare Tunnel Token ---
  public async setCloudflareToken(token: string): Promise<void> {
    await this.context.secrets.store('cloudflareToken', token.trim());
    this.addLogLine('[Security] Cloudflare Tunnel token safely encrypted in OS SecretStorage.', 'info');
    vscode.window.showInformationMessage('Cloudflare Tunnel Secret Token saved securely in OS Keychain.');
    this.emit('status_changed', this.status);
  }

  public async clearCloudflareToken(): Promise<void> {
    await this.context.secrets.delete('cloudflareToken');
    this.addLogLine('[Security] Cloudflare Tunnel token cleared from OS SecretStorage.', 'info');
    vscode.window.showInformationMessage('Cloudflare Tunnel Secret Token removed.');
    this.emit('status_changed', this.status);
  }

  public async getCloudflareToken(): Promise<string | undefined> {
    return await this.context.secrets.get('cloudflareToken');
  }

  public async hasCloudflareToken(): Promise<boolean> {
    const token = await this.getCloudflareToken();
    return !!token && token.length > 0;
  }

  public async probeRunningDaemon(port?: number): Promise<boolean> {
    const config = vscode.workspace.getConfiguration('antigravityCompanion');
    const targetPort = port || config.get<number>('gatewayPort', DEFAULT_DAEMON_PORT);

    return new Promise(resolve => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: targetPort,
          path: '/api/health',
          method: 'GET',
          timeout: 2500,
        },
        (res: http.IncomingMessage) => {
          let data = '';
          res.on('data', (chunk: any) => (data += chunk));
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              if (parsed.status === 'ok') {
                if (parsed.mode && (parsed.mode === 'desk' || parsed.mode === 'remote' || parsed.mode === 'auto')) {
                  this.currentMode = parsed.mode;
                  this.emit('mode_changed', parsed.mode);
                }
                if (parsed.connectedPhoneCount !== undefined) {
                  this.phoneCount = parsed.connectedPhoneCount;
                }
                if (this.status !== 'running') {
                  this.setStatus('running');
                  this.addLogLine(`[Extension] Connected to active Companion Daemon on port ${targetPort}.`, 'info');
                }
                if (!this.wsClient || this.wsClient.readyState !== WebSocket.OPEN) {
                  this.connectInternalWebSocket(targetPort);
                }
                this.ensureDefaultEndpoints(targetPort, parsed.tailscaleIp);
                resolve(true);
                return;
              }
            } catch {}
            if (this.status === 'running' && !this.daemonProcess) {
              this.setStatus('stopped');
            }
            resolve(false);
          });
        }
      );
      req.on('error', () => {
        if (this.status === 'running' && !this.daemonProcess) {
          this.setStatus('stopped');
        }
        resolve(false);
      });
      req.on('timeout', () => {
        req.destroy();
        if (this.status === 'running' && !this.daemonProcess) {
          this.setStatus('stopped');
        }
        resolve(false);
      });
      req.end();
    });
  }

  public ensureDefaultEndpoints(port: number, tailscaleIp?: string) {
    if (this.endpoints.length > 0) return;

    const interfaces = os.networkInterfaces();
    let localIp: string | null = null;
    let tsIp: string | null = tailscaleIp || null;

    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name] || []) {
        if (iface.family === 'IPv4' && !iface.internal) {
          if (name.toLowerCase().includes('tailscale') || iface.address.startsWith('100.')) {
            tsIp = iface.address;
          } else if (!localIp && !iface.address.startsWith('169.254')) {
            localIp = iface.address;
          }
        }
      }
    }

    const authToken = this.getAuthToken();

    if (tsIp) {
      this.tailscaleDetected = true;
      this.tailscaleIp = tsIp;
      const tsTicket = encodePairingTicket({
        version: 1,
        host: tsIp,
        port,
        ssl: false,
        token: authToken,
      });
      this.endpoints.push({
        type: 'tailscale',
        title: 'Tailscale Mesh',
        url: `http://${tsIp}:${port}?ticket=${tsTicket}`,
        ticket: tsTicket,
        isAvailable: true,
      });
    }

    if (localIp) {
      const localTicket = encodePairingTicket({
        version: 1,
        host: localIp,
        port,
        ssl: false,
        token: authToken,
      });
      this.endpoints.push({
        type: 'local',
        title: 'Local Wi-Fi',
        url: `http://${localIp}:${port}?ticket=${localTicket}`,
        ticket: localTicket,
        isAvailable: true,
      });
    }

    this.emit('endpoints_changed', this.endpoints);
  }

  private getAuthToken(): string {
    const tokenPath = path.resolve(os.homedir(), '.agy-companion-token');
    try {
      if (fs.existsSync(tokenPath)) {
        const token = fs.readFileSync(tokenPath, 'utf8').trim();
        if (token.length >= 16) return token;
      }
    } catch {}
    return 'dev-token';
  }

  public async start(): Promise<void> {
    this.userExplicitlyStopped = false;
    if (this.status === 'running' || this.status === 'starting') {
      return;
    }

    // Always persist IDE executable path so remote restart commands can relaunch it
    try {
      fs.writeFileSync(path.join(os.homedir(), '.agy-ide-path'), process.execPath, 'utf8');
    } catch {}

    const config = vscode.workspace.getConfiguration('antigravityCompanion');
    const port = config.get<number>('gatewayPort', DEFAULT_DAEMON_PORT);

    // Check if daemon is already running on port
    if (await this.probeRunningDaemon(port)) {
      this.addLogLine('[Extension] Daemon is already active. Attached to running session.', 'info');
      const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (ws) {
        this.registerWorkspace(ws);
      }
      this.startIdleChecker();
      this.setStatus('running');
      vscode.window.showInformationMessage('Attached to active Antigravity Companion Daemon.');
      return;
    }

    this.setStatus('starting');
    this.outputChannel.show(true);
    const startMsg = '[Extension] Starting Antigravity Companion Daemon...';
    this.outputChannel.appendLine(startMsg);
    this.addLogLine(startMsg, 'info');

    // 1. Locate daemon script
    const cliScript = this.findDaemonScript();
    if (!cliScript) {
      const err = 'Could not locate agy-companion daemon script. Make sure @agy-companion/cli is built.';
      this.outputChannel.appendLine(`[Error] ${err}`);
      this.addLogLine(`[Error] ${err}`, 'error');
      vscode.window.showErrorMessage(err);
      this.setStatus('error');
      return;
    }

    // 2. Read configuration & secrets
    const tunnelProvider = config.get<string>('tunnelProvider', 'none');
    const cfSecretToken = await this.getCloudflareToken();

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const args = [cliScript, '--port', String(port)];
    if (workspaceRoot) {
      args.push('--workspace', workspaceRoot);
    }
    if (tunnelProvider === 'cloudflare') {
      if (cfSecretToken) {
        args.push('--cloudflare-token', cfSecretToken);
        this.addLogLine('[Security] Passing encrypted Cloudflare token from SecretStorage.', 'info');
      } else {
        args.push('--tunnel');
      }
    }

    try {
      const nodeExe = this.resolveNodeExecutable();
      const isElectronNode = nodeExe === process.execPath;
      this.daemonProcess = spawn(nodeExe, args, {
        cwd: workspaceRoot || os.homedir(),
        env: {
          ...process.env,
          ANTIGRAVITY_IDE_EXEC_PATH: process.execPath,
          ...(isElectronNode ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
        },
        detached: true,
        shell: false,
        windowsHide: true,
      });
      try {
        this.daemonProcess.unref();
      } catch {}

      this.daemonProcess.stdout?.on('error', () => {});
      this.daemonProcess.stderr?.on('error', () => {});

      this.daemonProcess.stdout?.on('data', data => {
        const text = data.toString();
        this.outputChannel.append(text);
        this.addLogLine(text, 'info');
        this.parseDaemonOutput(text);
      });

      this.daemonProcess.stderr?.on('data', data => {
        const text = data.toString();
        this.outputChannel.append(text);
        this.addLogLine(text, 'warn');
      });

      this.daemonProcess.on('close', code => {
        const exitMsg = `[Daemon Process Exited] Code: ${code}`;
        this.outputChannel.appendLine(exitMsg);
        this.addLogLine(exitMsg, 'warn');
        this.cleanup();
        this.setStatus('stopped');
      });

      this.daemonProcess.on('error', err => {
        const errMsg = `[Daemon Error] ${err.message}`;
        this.outputChannel.appendLine(errMsg);
        this.addLogLine(errMsg, 'error');
        this.cleanup();
        this.setStatus('error');
      });

      // 3. Connect internal monitoring WebSocket
      setTimeout(() => {
        this.connectInternalWebSocket(port);
      }, 1500);

      // 5. Start Idle Check Timer
      this.startIdleChecker();

      this.setStatus('running');
    } catch (err: any) {
      this.outputChannel.appendLine(`[Daemon Exception] ${err.message}`);
      this.addLogLine(`[Daemon Exception] ${err.message}`, 'error');
      this.setStatus('error');
    }
  }

  public async stop(): Promise<void> {
    this.userExplicitlyStopped = true;
    this.outputChannel.appendLine('[Extension] Stopping Companion Daemon...');
    this.addLogLine('[Extension] Stopping Companion Daemon...', 'info');
    this.cleanup();
    this.setStatus('stopped');
  }

  public async restart(): Promise<void> {
    await this.stop();
    await new Promise(r => setTimeout(r, 1000));
    await this.start();
  }

  public setMode(newMode: CompanionMode): void {
    this.currentMode = newMode;
    const globalModePath = path.resolve(os.homedir(), '.agy-companion-mode');
    try {
      fs.writeFileSync(globalModePath, newMode, 'utf8');
      if (newMode === 'remote' || newMode === 'desk') {
        fs.writeFileSync(path.resolve(os.homedir(), '.agy-companion-target'), newMode, 'utf8');
      }
    } catch {}

    // Broadcast over WebSocket if active
    if (this.wsClient && this.wsClient.readyState === WebSocket.OPEN) {
      const msg: WsClientMessage = { type: 'client:set_mode', mode: newMode };
      this.wsClient.send(JSON.stringify(msg));
    }

    this.addLogLine(`[Mode Switch] Companion mode set to: ${newMode}`, 'info');
    this.emit('mode_changed', newMode);
  }

  public toggleMode(): CompanionMode {
    const cycle: CompanionMode[] = ['remote', 'desk', 'autonomous', 'auto'];
    const next = cycle[(cycle.indexOf(this.currentMode) + 1) % cycle.length];
    this.setMode(next);
    return next;
  }

  public getExecutionPolicy(): ExecutionPolicy {
    try {
      const globalPolicy = path.resolve(os.homedir(), '.agy-companion-policy');
      if (fs.existsSync(globalPolicy)) {
        const val = fs.readFileSync(globalPolicy, 'utf8').trim().toLowerCase();
        if (val === 'force_ask' || val === 'always_proceed') return val as ExecutionPolicy;
      }
    } catch {}
    return 'always_proceed';
  }

  public setExecutionPolicy(policy: ExecutionPolicy): void {
    const globalPolicy = path.resolve(os.homedir(), '.agy-companion-policy');
    try {
      fs.writeFileSync(globalPolicy, policy, 'utf8');
    } catch {}
    if (this.wsClient && this.wsClient.readyState === WebSocket.OPEN) {
      const msg: any = { type: 'client:set_execution_policy', policy };
      this.wsClient.send(JSON.stringify(msg));
    }
    this.addLogLine(`[Policy Switch] Execution policy set to: ${policy}`, 'info');
    this.emit('status_changed', this.status);
  }

  public resolveApproval(requestId: string, decision: 'allow' | 'deny'): void {
    this.recordActivity();
    if (this.wsClient && this.wsClient.readyState === WebSocket.OPEN) {
      const msg: WsClientMessage = {
        type: 'client:respond_approval',
        payload: {
          requestId,
          decision,
        },
      };
      this.wsClient.send(JSON.stringify(msg));
    }

    this.addLogLine(`[Approval Resolved] Request ${requestId} -> ${decision.toUpperCase()}`, 'ipc');
    this.pendingApprovals.delete(requestId);
    this.emit('approvals_changed', this.getPendingApprovals());
  }

  public clearAllApprovals(): void {
    this.recordActivity();
    if (this.wsClient && this.wsClient.readyState === WebSocket.OPEN) {
      this.wsClient.send(JSON.stringify({ type: 'client:clear_approvals' }));
    }
    this.pendingApprovals.clear();
    this.emit('approvals_changed', []);
    this.addLogLine('[Approvals] Cleared all pending approvals', 'ipc');
  }

  public addLogLine(raw: string, level: LogLine['level'] = 'info'): void {
    const lines = raw.split(/\r?\n/).filter(l => l.trim().length > 0);
    const now = Date.now();
    for (const text of lines) {
      let deducedLevel = level;
      if (text.includes('[IPC]') || text.includes('[APPROVAL]')) deducedLevel = 'ipc';
      else if (text.includes('[WS]')) deducedLevel = 'ws';
      else if (text.includes('[Error]') || text.includes('[Fatal]')) deducedLevel = 'error';
      else if (text.includes('[Tunnel]') || text.includes('Warning')) deducedLevel = 'warn';

      this.logLines.push({
        id: `log_${now}_${Math.random().toString(36).substring(2, 6)}`,
        text: text.trim(),
        level: deducedLevel,
        timestamp: now,
      });
    }

    if (this.logLines.length > this.maxLogs) {
      this.logLines = this.logLines.slice(this.logLines.length - this.maxLogs);
    }

    this.emit('logs_changed', this.logLines);
  }

  private recordActivity(): void {
    this.lastActivityTimestamp = Date.now();
  }

  private startIdleChecker(): void {
    if (this.idleTimer) {
      clearInterval(this.idleTimer);
    }

    this.idleTimer = setInterval(() => {
      const config = vscode.workspace.getConfiguration('antigravityCompanion');
      const idleMinutes = config.get<number>('idleTimeoutMinutes', 0);
      if (idleMinutes > 0 && this.status === 'running') {
        const idleMs = Date.now() - this.lastActivityTimestamp;
        if (idleMs >= idleMinutes * 60 * 1000 && this.pendingApprovals.size === 0 && this.phoneCount === 0) {
          const timeoutMsg = `[Idle Timeout] Inactive for ${idleMinutes} minutes. Stopping daemon to conserve battery & RAM.`;
          this.outputChannel.appendLine(timeoutMsg);
          this.addLogLine(timeoutMsg, 'warn');
          vscode.window.showInformationMessage(`[Antigravity Companion] Daemon auto-stopped after ${idleMinutes} minutes of idle inactivity.`);
          this.stop();
        }
      }
    }, 30000);
  }

  private setStatus(newStatus: DaemonStatus) {
    this.status = newStatus;
    this.emit('status_changed', newStatus);
  }

  private loadGlobalMode() {
    const globalModePath = path.resolve(os.homedir(), '.agy-companion-mode');
    try {
      if (fs.existsSync(globalModePath)) {
        const mode = fs.readFileSync(globalModePath, 'utf8').trim().toLowerCase();
        if (mode === 'desk' || mode === 'remote' || mode === 'auto' || mode === 'autonomous') {
          this.currentMode = mode as CompanionMode;
        }
      }
    } catch {}
  }

  public registerWorkspace(wsPath: string): void {
    if (this.wsClient && this.wsClient.readyState === WebSocket.OPEN) {
      this.wsClient.send(
        JSON.stringify({
          type: 'client:register_workspace',
          path: wsPath,
        })
      );
    }
  }

  public updateActiveTabs(tabs: EditorTab[]): void {
    if (this.wsClient && this.wsClient.readyState === WebSocket.OPEN) {
      this.wsClient.send(
        JSON.stringify({
          type: 'client:update_tabs',
          tabs,
        })
      );
    }
  }

  private resolveNodeExecutable(): string {
    try {
      execSync('node -v', { stdio: 'ignore' });
      return 'node';
    } catch {
      return process.execPath;
    }
  }

  private findDaemonScript(): string | null {
    const extDaemon = path.join(this.context.extensionPath, 'dist', 'daemon', 'daemon.js');
    const localDistDaemon = path.resolve(__dirname, 'daemon', 'daemon.js');
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const candidatePaths = [
      extDaemon,
      localDistDaemon,
      workspaceRoot ? path.join(workspaceRoot, 'packages', 'cli', 'dist', 'bin', 'agy-companion.js') : '',
      path.resolve(__dirname, '..', '..', 'cli', 'dist', 'bin', 'agy-companion.js'),
      path.resolve(__dirname, '..', 'cli', 'dist', 'bin', 'agy-companion.js'),
      path.resolve(os.homedir(), '.gemini', 'antigravity-ide', 'companion', 'bin', 'agy-companion.js'),
      path.resolve(os.homedir(), '.gemini', 'antigravity-ide', 'companion', 'agy-companion.js'),
    ];

    for (const p of candidatePaths) {
      if (p && fs.existsSync(p)) return p;
    }
    return null;
  }

  private findActiveConversationId(): string | null {
    try {
      const home = os.homedir();
      // 1. Check sqlite conversations dir for currently active .db-wal / .db
      const convDir = path.join(home, '.gemini', 'antigravity-ide', 'conversations');
      if (fs.existsSync(convDir)) {
        const files = fs.readdirSync(convDir);
        const walFiles = files.filter(f => f.endsWith('.db-wal'));
        if (walFiles.length > 0) {
          walFiles.sort((a, b) => {
            return fs.statSync(path.join(convDir, b)).mtimeMs - fs.statSync(path.join(convDir, a)).mtimeMs;
          });
          return walFiles[0].replace('.db-wal', '');
        }
      }
      // 2. Check brain dir
      const brainDir = path.join(home, '.gemini', 'antigravity-ide', 'brain');
      if (fs.existsSync(brainDir)) {
        const dirs = fs.readdirSync(brainDir, { withFileTypes: true })
          .filter(d => d.isDirectory() && !d.name.startsWith('.'));
        dirs.sort((a, b) => {
          const aPath = path.join(brainDir, a.name);
          const bPath = path.join(brainDir, b.name);
          return fs.statSync(bPath).mtimeMs - fs.statSync(aPath).mtimeMs;
        });
        if (dirs.length > 0) {
          return dirs[0].name;
        }
      }
    } catch {}
    return null;
  }

  public async injectPromptIntoIde(prompt: string, images?: { base64: string; name: string }[], model?: string): Promise<void> {
    this.recordActivity();
    let finalPrompt = prompt;
    if (model && !model.toLowerCase().includes('flash')) {
      finalPrompt = `[Model Directive: ${model}]\n${prompt}`;
      this.addLogLine(`[Model Directive Applied]: ${model}`, 'info');
    }
    this.addLogLine(`[Prompt Received from Phone]: "${finalPrompt.slice(0, 50)}..."`, 'info');

    // 1. Primary: Native Antigravity IDE Agent Panel submission (verified in IDE binary)
    try {
      await vscode.commands.executeCommand('antigravity.sendPromptToAgentPanel', finalPrompt);
      this.addLogLine(`[Prompt Dispatched] Delivered directly to Antigravity Agent Chat Panel`, 'info');
      return;
    } catch (err: any) {
      this.addLogLine(`[antigravity.sendPromptToAgentPanel Failed] ${err?.message || err}. Falling back to queue marker...`, 'warn');
    }

    // 2. Fallback: Queue to active session directory if found
    const convId = this.findActiveConversationId();
    if (convId) {
      try {
        const home = os.homedir();
        const messagesDir = path.join(home, '.gemini', 'antigravity-ide', 'brain', convId, '.system_generated', 'messages');
        const undeliveredDir = path.join(messagesDir, 'undelivered');
        if (!fs.existsSync(undeliveredDir)) {
          fs.mkdirSync(undeliveredDir, { recursive: true });
        }
        const msgId = crypto.randomUUID();
        const payload = {
          id: msgId,
          recipient: convId,
          sender: 'companion',
          priority: 'MESSAGE_PRIORITY_HIGH',
          timestamp: new Date().toISOString(),
          renderDetails: {
            messageTitle: 'Prompt from Mobile Companion',
          },
          content: `[Message from Phone]: ${prompt}`,
        };
        fs.writeFileSync(path.join(messagesDir, `${msgId}.json`), JSON.stringify(payload, null, 2), 'utf8');
        fs.writeFileSync(path.join(undeliveredDir, msgId), '', 'utf8');
        this.addLogLine(`[Prompt Queued] Delivered to active session queue ${convId.slice(0, 8)}`, 'info');
      } catch (err: any) {
        this.addLogLine(`[Prompt Queue Error] ${err.message}`, 'warn');
      }
    }
  }

  private cleanup(killProcess: boolean = true) {
    if (this.wsClient) {
      try {
        this.wsClient.close();
      } catch {}
      this.wsClient = null;
    }
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.idleTimer) {
      clearInterval(this.idleTimer);
      this.idleTimer = null;
    }
    if (killProcess) {
      if (this.daemonProcess) {
        try {
          this.daemonProcess.kill();
        } catch {}
        this.daemonProcess = null;
      }
      const config = vscode.workspace.getConfiguration('antigravityCompanion');
      const port = config.get<number>('daemonPort', DEFAULT_DAEMON_PORT);
      this.killProcessOnPort(port);
      this.pendingApprovals.clear();
      this.connectedDevices.clear();
      this.phoneCount = 0;
    }
  }

  private killProcessOnPort(port: number): void {
    if (process.platform !== 'win32') return;
    try {
      const out = execSync(`netstat -ano -p tcp | findstr :${port}`, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        windowsHide: true,
      });
      const myPid = process.pid;
      for (const line of out.split('\n')) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 5 && parts[1].endsWith(`:${port}`) && parts[3] === 'LISTENING') {
          const pid = parseInt(parts[parts.length - 1], 10);
          if (pid && pid !== myPid) {
            try {
              execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore', windowsHide: true });
            } catch {}
          }
        }
      }
    } catch {}
  }

  public dispose(): void {
    // Window is closing or switching workspaces; preserve persistent companion daemon process
    this.cleanup(false);
  }

  private connectInternalWebSocket(port: number) {
    try {
      this.wsClient = new WebSocket(`ws://127.0.0.1:${port}`);

      this.wsClient.on('open', () => {
        this.outputChannel.appendLine('[Extension] Connected to Daemon WebSocket.');
        this.addLogLine('[WS] Internal monitoring channel established.', 'ws');
        const folders = vscode.workspace.workspaceFolders;
        const currentWsPath = folders && folders.length > 0 ? folders[0].uri.fsPath : undefined;
        const helloMsg: WsClientMessage = {
          type: 'client:hello',
          deviceId: 'vscode_extension_host',
          name: currentWsPath ? path.basename(currentWsPath) : 'Antigravity IDE Extension',
          workspacePath: currentWsPath,
        };
        this.wsClient?.send(JSON.stringify(helloMsg));
        this.emit('ws_connected');

        this.pingInterval = setInterval(() => {
          if (this.wsClient?.readyState === WebSocket.OPEN) {
            this.wsClient.send(JSON.stringify({ type: 'client:ping' }));
          }
        }, 15000);
      });

      this.wsClient.on('message', data => {
        try {
          const msg = JSON.parse(data.toString()) as WsServerMessage;
          this.handleServerMessage(msg);
        } catch {}
      });

      this.wsClient.on('close', () => {
        if (this.pingInterval) {
          clearInterval(this.pingInterval);
          this.pingInterval = null;
        }
        this.outputChannel.appendLine('[Extension] Daemon WebSocket disconnected. Auto-reconnecting in 2s...');
        this.addLogLine('[WS] Daemon WebSocket disconnected. Auto-reconnecting...', 'ws');
        setTimeout(() => {
          if (this.status === 'running' && (!this.wsClient || this.wsClient.readyState !== WebSocket.OPEN)) {
            this.connectInternalWebSocket(port);
          }
        }, 2000);
      });

      this.wsClient.on('error', err => {
        this.outputChannel.appendLine(`[Extension WS Error] ${err.message}`);
        this.addLogLine(`[WS Error] ${err.message}`, 'error');
      });
    } catch {}
  }

  private handleServerMessage(msg: WsServerMessage) {
    switch (msg.type) {
      case 'server:hello':
        if (msg.mode) {
          this.currentMode = msg.mode;
          this.emit('mode_changed', msg.mode);
        }
        if (msg.connectedPhoneCount !== undefined) {
          this.phoneCount = msg.connectedPhoneCount;
        }
        if (msg.tailscaleIp) {
          this.tailscaleDetected = true;
          this.tailscaleIp = msg.tailscaleIp;
        }
        this.pendingApprovals.clear();
        if (msg.workspaces) {
          for (const ws of msg.workspaces) {
            if (ws.pendingApprovals) {
              for (const req of ws.pendingApprovals) {
                this.pendingApprovals.set(req.id, req);
              }
            }
          }
        }
        this.emit('approvals_changed', this.getPendingApprovals());
        this.emit('status_changed', this.status);
        break;

      case 'server:workspaces_updated':
        this.pendingApprovals.clear();
        if (msg.workspaces) {
          for (const ws of msg.workspaces) {
            if (ws.pendingApprovals) {
              for (const req of ws.pendingApprovals) {
                this.pendingApprovals.set(req.id, req);
              }
            }
          }
        }
        this.emit('approvals_changed', this.getPendingApprovals());
        break;

      case 'server:device_count_updated':
        this.phoneCount = msg.count;
        this.recordActivity();
        this.addLogLine(`[Devices] Active companion devices connected: ${msg.count}`, 'ws');
        this.emit('status_changed', this.status);
        break;

      case 'server:run_quick_action':
        this.recordActivity();
        this.executeQuickAction(msg.command, msg.label);
        break;

      case 'server:approval_requested':
        this.recordActivity();
        this.pendingApprovals.set(msg.request.id, msg.request);
        this.emit('approvals_changed', this.getPendingApprovals());
        this.addLogLine(`[APPROVAL] ${msg.request.toolCall.name}: ${msg.request.toolCall.args?.CommandLine || ''}`, 'ipc');
        this.notifyApproval(msg.request);
        break;

      case 'server:approval_resolved':
        this.recordActivity();
        this.pendingApprovals.delete(msg.requestId);
        this.emit('approvals_changed', this.getPendingApprovals());
        this.addLogLine(`[DECISION] Approval resolved: ${msg.decision.toUpperCase()}`, 'ipc');
        const dialogResolver = this.pendingDialogResolvers.get(msg.requestId);
        if (dialogResolver) {
          this.pendingDialogResolvers.delete(msg.requestId);
          dialogResolver({ decision: msg.decision, option: msg.option, reason: msg.reason });
        }
        break;

      case 'server:mode_updated':
        this.currentMode = msg.mode;
        this.emit('mode_changed', msg.mode);
        break;

      case 'server:forward_prompt':
        this.injectPromptIntoIde(msg.prompt, msg.images, msg.model);
        break;

      case 'server:open_workspace':
        if (msg.path) {
          this.handleWorkspaceSwitch(msg.path);
        }
        break;

      case 'server:emergency_stop':
        this.recordActivity();
        this.addLogLine('[Emergency Stop] Interrupted from mobile companion. Halting active agent task...', 'warn');
        // Halt agent execution in Antigravity IDE
        const cancelCommands = [
          'antigravity.cancelAgent',
          'antigravity.stopAgent',
          'workbench.action.chat.cancel',
          'workbench.action.chat.stop',
        ];
        for (const cmd of cancelCommands) {
          try {
            vscode.commands.executeCommand(cmd);
          } catch {}
        }
        break;

      case 'server:open_editor_tab':
        if (msg.path) {
          this.openEditorTab(msg.path);
        }
        break;

      case 'server:close_editor_tab':
        if (msg.path) {
          this.closeEditorTab(msg.path);
        }
        break;

      case 'server:close_all_editor_tabs':
        this.closeAllEditorTabs();
        break;

      case 'server:chat_message':
        this.recordActivity();
        break;

      case 'server:pong':
        break;

      default:
        break;
    }
  }

  private async openEditorTab(filePath: string): Promise<void> {
    try {
      let targetUri: vscode.Uri;
      if (path.isAbsolute(filePath)) {
        targetUri = vscode.Uri.file(filePath);
      } else {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        targetUri = workspaceRoot ? vscode.Uri.file(path.join(workspaceRoot, filePath)) : vscode.Uri.file(filePath);
      }
      const doc = await vscode.workspace.openTextDocument(targetUri);
      await vscode.window.showTextDocument(doc, { preview: false, preserveFocus: false });
      this.addLogLine(`[Editor Tab] Switched active editor tab to: ${filePath}`, 'info');
    } catch (err: any) {
      this.addLogLine(`[Editor Tab] Failed to switch editor tab: ${err?.message || err}`, 'warn');
    }
  }

  private async closeEditorTab(filePath: string): Promise<void> {
    try {
      const norm = path.resolve(filePath).toLowerCase();
      for (const group of vscode.window.tabGroups.all) {
        for (const tab of group.tabs) {
          if (tab.input instanceof vscode.TabInputText) {
            if (path.resolve(tab.input.uri.fsPath).toLowerCase() === norm) {
              await vscode.window.tabGroups.close(tab);
            }
          }
        }
      }
    } catch (err: any) {
      this.addLogLine(`[Editor Tab] Failed to close editor tab: ${err?.message || err}`, 'warn');
    }
  }

  private async closeAllEditorTabs(): Promise<void> {
    try {
      await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    } catch (err: any) {
      this.addLogLine(`[Editor Tab] Failed to close all editor tabs: ${err?.message || err}`, 'warn');
    }
  }

  private async handleWorkspaceSwitch(targetPath: string): Promise<void> {
    try {
      this.loadGlobalMode();
      const mode = this.getEffectiveMode();
      this.addLogLine(`[Open Workspace] Requested switch to: ${targetPath} (mode: ${mode})`, 'info');
      const dirtyDocs = vscode.workspace.textDocuments.filter(d => d.isDirty);

      if (dirtyDocs.length === 0) {
        vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(targetPath), false);
        return;
      }

      // Desk mode: popup appears on desk only, taking input from desktop IDE
      if (mode === 'desk') {
        this.addLogLine('[Open Workspace] Desk mode: delegating confirmation dialog to desktop IDE.', 'info');
        vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(targetPath), false);
        return;
      }

      // Remote mode: popup appears on phone only, taking input from phone with zero desktop prompts
      const dialogId = `dialog_save_${Date.now()}`;
      const fileNames = dirtyDocs.map(d => path.basename(d.fileName)).slice(0, 3).join(', ');
      const extraCount = dirtyDocs.length > 3 ? ` and ${dirtyDocs.length - 3} more` : '';
      const promptTitle = `Do you want to save the changes you made to ${fileNames}${extraCount}?`;
      const promptDetail = "Your changes will be lost if you don't save them.";

      if (this.wsClient && this.wsClient.readyState === WebSocket.OPEN) {
        this.wsClient.send(
          JSON.stringify({
            type: 'client:prompt_dialog',
            dialogId,
            title: promptTitle,
            message: promptDetail,
            options: ['Save', "Don't Save", 'Cancel'],
            workspacePath: targetPath,
            dialogType: 'warning',
          })
        );

        this.pendingDialogResolvers.set(dialogId, async (choice: { decision: string; option?: number; reason?: string }) => {
          const opt = choice.option;
          const reasonStr = (choice.reason || '').toLowerCase();
          const isDontSave = opt === 2 || reasonStr.includes("don't save") || reasonStr.includes('dont save') || reasonStr.includes('discard');
          const isSave = opt === 1 || choice.decision === 'allow' || reasonStr === 'save' || (reasonStr.includes('save') && !reasonStr.includes("don't") && !reasonStr.includes('dont'));
          const isCancel = opt === 3 || reasonStr.includes('cancel') || reasonStr.includes('skip') || (choice.decision === 'deny' && !isDontSave && !isSave);

          if (isCancel) {
            this.addLogLine('[Open Workspace] User cancelled workspace switch from phone.', 'info');
            return;
          }

          if (isDontSave) {
            this.addLogLine("[Open Workspace] User selected: Don't Save from phone", 'info');
            for (const doc of dirtyDocs) {
              try {
                await vscode.window.showTextDocument(doc.uri, { preview: true, preserveFocus: false });
                await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
              } catch {
                try {
                  await vscode.commands.executeCommand('workbench.action.files.revert', doc.uri);
                } catch {}
              }
            }
            vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(targetPath), false);
          } else if (isSave) {
            this.addLogLine('[Open Workspace] User selected: Save from phone', 'info');
            let customName = '';
            if (choice.reason && choice.reason.toLowerCase().startsWith('save:')) {
              customName = choice.reason.slice(5).trim();
            }

            for (const doc of dirtyDocs) {
              try {
                if (doc.isUntitled) {
                  const wsFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || targetPath;
                  let baseName = customName || path.basename(doc.fileName) || 'Untitled-1';
                  if (!baseName.includes('.')) baseName = `${baseName}.txt`;

                  let targetPathOnDisk = path.join(wsFolder, baseName);
                  if (fs.existsSync(targetPathOnDisk)) {
                    const ext = path.extname(baseName);
                    const nameOnly = path.basename(baseName, ext);
                    targetPathOnDisk = path.join(wsFolder, `${nameOnly}_${Date.now()}${ext}`);
                  }

                  const targetUri = vscode.Uri.file(targetPathOnDisk);
                  await vscode.workspace.fs.writeFile(targetUri, Buffer.from(doc.getText(), 'utf8'));
                  await vscode.window.showTextDocument(doc.uri, { preview: true, preserveFocus: false });
                  await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
                } else {
                  await doc.save();
                }
              } catch (docErr: any) {
                this.addLogLine(`[Open Workspace] Error saving doc ${doc.fileName}: ${docErr.message}`, 'warn');
              }
            }
            await vscode.workspace.saveAll(false);
            vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(targetPath), false);
          }
        });
      } else {
        vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(targetPath), false);
      }
    } catch (err: any) {
      this.addLogLine(`[Open Workspace Error] ${err.message}`, 'error');
    }
  }

  private notifyApproval(req: ApprovalRequest) {
    const config = vscode.workspace.getConfiguration('antigravityCompanion');
    if (!config.get<boolean>('showToastNotifications', false)) {
      return;
    }

    const toolName = req.toolCall.name;
    const cmd = req.toolCall.args?.CommandLine || '';
    const label = cmd ? `run "${cmd.length > 50 ? cmd.slice(0, 50) + '...' : cmd}"` : `execute ${toolName}`;

    vscode.window
      .showInformationMessage(`[Antigravity Companion] Tool Approval Required: ${label}`, 'Approve', 'Deny')
      .then(choice => {
        if (choice === 'Approve') {
          this.resolveApproval(req.id, 'allow');
        } else if (choice === 'Deny') {
          this.resolveApproval(req.id, 'deny');
        }
      });
  }

  private parseDaemonOutput(text: string) {
    const urlMatches = text.matchAll(/(?:URL:\s+)(https?:\/\/[^\s]+)/g);
    for (const match of urlMatches) {
      const fullUrl = match[1];
      const isCloudflare = fullUrl.includes('trycloudflare.com') || fullUrl.includes('cloudflare-tunnel');
      const isTailscale = fullUrl.includes('100.');
      const type = isCloudflare ? 'cloudflare' : (isTailscale ? 'tailscale' : 'local');
      const title = isCloudflare ? 'Cloudflare Tunnel' : (isTailscale ? 'Tailscale Mesh' : 'Local Wi-Fi');

      if (isCloudflare) {
        this.cloudflareActive = true;
        this.cloudflareUrl = fullUrl;
      }
      if (isTailscale) {
        this.tailscaleDetected = true;
        this.tailscaleIp = fullUrl;
      }

      const ticketMatch = fullUrl.match(/[?&]ticket=([a-zA-Z0-9_-]+)/);
      const ticket = ticketMatch ? ticketMatch[1] : '';

      const idx = this.endpoints.findIndex(e => e.type === type);
      const endpoint: PairingEndpoint = {
        type,
        title,
        url: fullUrl,
        ticket,
        isAvailable: true,
      };

      if (idx !== -1) {
        this.endpoints[idx] = endpoint;
      } else {
        this.endpoints.push(endpoint);
      }

      this.emit('endpoints_changed', this.endpoints);
      this.emit('status_changed', this.status);
    }
  }
}
