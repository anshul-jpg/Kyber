import * as vscode from 'vscode';
import QRCode from 'qrcode';
import { DaemonManager } from './daemon-manager';
import { HookManager } from './hook-manager';
import { renderSidebarHtml } from './sidebar-template';

export class CompanionSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'antigravityCompanion.sidebar';
  private view?: vscode.WebviewView;
  private activeEndpointType: 'local' | 'tailscale' | 'cloudflare' = 'local';
  private updateScheduled = false;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly daemonManager: DaemonManager,
    private readonly hookManager: HookManager
  ) {
    this.daemonManager.on('status_changed', () => this.scheduleUpdate());
    this.daemonManager.on('mode_changed', () => this.scheduleUpdate());
    this.daemonManager.on('endpoints_changed', () => this.scheduleUpdate());
    this.daemonManager.on('approvals_changed', () => this.scheduleUpdate());
    this.daemonManager.on('logs_changed', (logs) => {
      if (this.view) {
        this.view.webview.postMessage({ command: 'updateLogs', logs });
      }
    });
    this.hookManager.on('hook_status_changed', () => this.scheduleUpdate());
  }

  private scheduleUpdate(): void {
    if (this.updateScheduled) return;
    this.updateScheduled = true;
    setTimeout(() => {
      this.updateScheduled = false;
      this.updateWebview();
    }, 80);
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.webview.onDidReceiveMessage(async data => {
      switch (data.command) {
        case 'startDaemon':
          await this.daemonManager.start();
          break;
        case 'stopDaemon':
          await this.daemonManager.stop();
          break;
        case 'restartDaemon':
          await this.daemonManager.restart();
          break;
        case 'setMode':
          this.daemonManager.setMode(data.mode);
          break;
        case 'setExecutionPolicy':
          this.daemonManager.setExecutionPolicy(data.policy);
          this.updateWebview();
          break;
        case 'openUrl':
          if (data.url) {
            vscode.env.openExternal(vscode.Uri.parse(data.url));
          }
          break;
        case 'selectEndpoint':
          this.activeEndpointType = data.endpointType;
          this.updateWebview();
          break;
        case 'copyText':
          vscode.env.clipboard.writeText(data.text);
          vscode.window.showInformationMessage(`Copied to clipboard: ${data.label || 'Text'}`);
          break;
        case 'masterStartAndLink':
          await this.hookManager.enableInCurrentWorkspace();
          const wsPath = this.hookManager.getActiveWorkspacePath();
          await this.daemonManager.start();
          if (wsPath) {
            this.daemonManager.registerWorkspace(wsPath);
          }
          this.updateWebview();
          break;
        case 'enableHook':
          await this.hookManager.enableInCurrentWorkspace();
          this.updateWebview();
          break;
        case 'disableHook':
          await this.hookManager.disableInCurrentWorkspace();
          this.updateWebview();
          break;
        case 'enableGlobalHook':
          await this.hookManager.enableGlobally();
          this.updateWebview();
          break;
        case 'disableGlobalHook':
          await this.hookManager.disableGlobally();
          this.updateWebview();
          break;
        case 'resolveApproval':
          this.daemonManager.resolveApproval(data.requestId, data.decision);
          break;
        case 'clearApprovals':
          this.daemonManager.clearAllApprovals();
          this.updateWebview();
          break;
        case 'runQuickAction':
          this.daemonManager.executeQuickAction(data.command, data.label);
          break;
        case 'clearLogs':
          this.daemonManager.clearLogs();
          break;
        case 'promptCloudflareToken':
          await this.handleCloudflareTokenPrompt();
          break;
        case 'openSettings':
          vscode.commands.executeCommand('workbench.action.openSettings', 'antigravityCompanion');
          break;
        case 'enableStartupService':
          this.daemonManager.enableStartupService();
          this.updateWebview();
          break;
        case 'disableStartupService':
          this.daemonManager.disableStartupService();
          this.updateWebview();
          break;
        case 'restartExtensionHost':
          await vscode.commands.executeCommand('workbench.action.restartExtensionHost');
          break;
        default:
          break;
      }
    });

    this.view.webview.html = this.getInitialLoadingHtml();
    this.updateWebview();
  }

  private async handleCloudflareTokenPrompt(): Promise<void> {
    const hasExisting = await this.daemonManager.hasCloudflareToken();
    if (hasExisting) {
      const choice = await vscode.window.showQuickPick(
        ['Update Cloudflare Tunnel Secret Token', 'Remove Saved Secret Token', 'Cancel'],
        { placeHolder: 'Cloudflare Tunnel Secret is currently configured' }
      );
      if (choice === 'Remove Saved Secret Token') {
        await this.daemonManager.clearCloudflareToken();
        this.updateWebview();
        return;
      } else if (choice !== 'Update Cloudflare Tunnel Secret Token') {
        return;
      }
    }

    const token = await vscode.window.showInputBox({
      title: 'Cloudflare Tunnel Secret Token',
      prompt: 'Enter your Cloudflare Named Tunnel token (encrypted via OS Keychain)',
      password: true,
      placeHolder: 'eyJhIjoiY2... (paste token here)',
      ignoreFocusOut: true,
    });

    if (token) {
      await this.daemonManager.setCloudflareToken(token);
      this.updateWebview();
    }
  }

  private getInitialLoadingHtml(): string {
    return `<!DOCTYPE html><html><body style="background:#0d0d0e;color:#cccccc;font-family:'Geist Mono',Consolas,monospace;padding:16px;font-size:11.5px;"><div style="display:flex;align-items:center;gap:8px;"><svg width="18" height="18" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="18" y="16" width="13" height="68" rx="2.5" fill="#ffffff"/><path d="M52 16 L31 50 L52 84 H39 L22 50 L39 16 H52 Z" fill="#ffffff"/><path d="M82 16 L61 50 L82 84 H69 L52 50 L69 16 H82 Z" fill="#ffffff" opacity="0.8"/></svg><strong style="color:#ffffff;font-size:14px;letter-spacing:-0.02em;">kyber.</strong></div><p style="margin-top:10px;color:#71717a;font-size:11px;">Connecting to workspace daemon...</p></body></html>`;
  }

  public async updateWebview(): Promise<void> {
    if (!this.view) return;
    try {
      this.view.webview.html = await this.getHtmlForWebview();
    } catch (e: any) {
      this.view.webview.html = `<!DOCTYPE html><html><body style="background:#181818;color:#f87171;font-family:sans-serif;padding:12px;font-size:11.5px;"><strong>View Error:</strong><pre style="white-space:pre-wrap;margin-top:8px;color:#858585;font-size:10px;">${e.stack || e.message}</pre></body></html>`;
    }
  }

  private async getHtmlForWebview(): Promise<string> {
    const status = this.daemonManager.getStatus();
    const mode = this.daemonManager.getMode();
    const effectiveMode = this.daemonManager.getEffectiveMode();
    const endpoints = this.daemonManager.getEndpoints();
    const approvals = this.daemonManager.getPendingApprovals();
    const meshStatus = this.daemonManager.getMeshStatus();
    const quickActions = this.daemonManager.getQuickActions();
    const logs = this.daemonManager.getLogLines();
    const hasCfToken = await this.daemonManager.hasCloudflareToken();
    const isHookInstalled = this.hookManager.isInstalledInCurrentWorkspace();

    // Find active endpoint or fallback
    let currentEndpoint = endpoints.find(e => e.type === this.activeEndpointType);
    if (!currentEndpoint && endpoints.length > 0) {
      currentEndpoint = endpoints[0];
      this.activeEndpointType = currentEndpoint.type;
    }

    // Generate high-craft dark mode QR Code SVG
    let qrSvg = '';
    let apkQrSvg = '';
    if (currentEndpoint && currentEndpoint.url) {
      try {
        qrSvg = await QRCode.toString(currentEndpoint.url, {
          type: 'svg',
          margin: 1,
          color: {
            dark: '#cccccc',
            light: '#141414',
          },
        });
        apkQrSvg = await QRCode.toString(`${currentEndpoint.url}/download/app.apk`, {
          type: 'svg',
          margin: 1,
          color: {
            dark: '#cccccc',
            light: '#141414',
          },
        });
      } catch {
        qrSvg = '<div style="color:#858585;font-size:10px;text-align:center;">QR generation failed</div>';
        apkQrSvg = '<div style="color:#858585;font-size:10px;text-align:center;">APK QR generation failed</div>';
      }
    }

    return renderSidebarHtml({
      status,
      mode,
      effectiveMode,
      endpoints,
      approvals,
      meshStatus,
      quickActions,
      logs,
      hasCfToken,
      isHookInstalled,
      isGlobalHookInstalled: this.hookManager.isInstalledGlobally(),
      activeEndpointType: this.activeEndpointType,
      executionPolicy: this.daemonManager.getExecutionPolicy(),
      isStartupServiceEnabled: this.daemonManager.isStartupServiceEnabled(),
      qrSvg,
      apkQrSvg,
    });
  }
}
