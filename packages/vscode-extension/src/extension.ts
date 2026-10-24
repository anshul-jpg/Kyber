import * as vscode from 'vscode';
import { DaemonManager } from './daemon-manager';
import { HookManager } from './hook-manager';
import { CompanionStatusBar } from './status-bar';
import { CompanionSidebarProvider } from './sidebar-provider';

export function activate(context: vscode.ExtensionContext) {
  const daemonManager = new DaemonManager(context);
  const hookManager = new HookManager(context.extensionPath);
  const statusBar = new CompanionStatusBar(daemonManager);
  statusBar.show();

  const sidebarProvider = new CompanionSidebarProvider(context.extensionUri, daemonManager, hookManager);
  context.subscriptions.push(daemonManager);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(CompanionSidebarProvider.viewType, sidebarProvider)
  );

  // Command: Start Daemon
  context.subscriptions.push(
    vscode.commands.registerCommand('antigravityCompanion.startDaemon', async () => {
      await daemonManager.start();
    })
  );

  // Command: Stop Daemon
  context.subscriptions.push(
    vscode.commands.registerCommand('antigravityCompanion.stopDaemon', async () => {
      await daemonManager.stop();
    })
  );

  // Command: Restart Daemon
  context.subscriptions.push(
    vscode.commands.registerCommand('antigravityCompanion.restartDaemon', async () => {
      await daemonManager.restart();
    })
  );

  // Command: Toggle Desk/Remote/Auto Mode
  context.subscriptions.push(
    vscode.commands.registerCommand('antigravityCompanion.toggleMode', () => {
      const newMode = daemonManager.toggleMode();
      const modeLabel =
        newMode === 'remote'
          ? 'Remote (Phone Approval Priority)'
          : newMode === 'desk'
          ? 'Desk (PC IDE Dialogs)'
          : 'Auto (Dynamic Adaptive)';
      vscode.window.showInformationMessage(`Antigravity Companion mode set to: ${modeLabel}`);
    })
  );

  // Command: Clear Pending Approvals
  context.subscriptions.push(
    vscode.commands.registerCommand('antigravityCompanion.clearApprovals', () => {
      daemonManager.clearAllApprovals();
      sidebarProvider.updateWebview();
      vscode.window.showInformationMessage('Antigravity Companion: Cleared all pending approvals.');
    })
  );

  // Command: Hot-Reload Extension Host (Soft reload without losing window or chat context)
  context.subscriptions.push(
    vscode.commands.registerCommand('antigravityCompanion.restartExtensionHost', async () => {
      await vscode.commands.executeCommand('workbench.action.restartExtensionHost');
    })
  );

  // Command: Enable Hook in Workspace
  context.subscriptions.push(
    vscode.commands.registerCommand('antigravityCompanion.enableInWorkspace', async () => {
      await hookManager.enableInCurrentWorkspace();
      sidebarProvider.updateWebview();
    })
  );

  // Command: Master 1-Click Start & Link Workspace
  context.subscriptions.push(
    vscode.commands.registerCommand('antigravityCompanion.masterStartAndLink', async () => {
      await hookManager.enableInCurrentWorkspace();
      const wsPath = hookManager.getActiveWorkspacePath();
      await daemonManager.start();
      if (wsPath) {
        daemonManager.registerWorkspace(wsPath);
      }
      sidebarProvider.updateWebview();
      vscode.window.showInformationMessage('⚡ Antigravity Companion: Daemon active & workspace linked!');
    })
  );

  // Command: Disable Hook in Workspace
  context.subscriptions.push(
    vscode.commands.registerCommand('antigravityCompanion.disableInWorkspace', async () => {
      await hookManager.disableInCurrentWorkspace();
      sidebarProvider.updateWebview();
    })
  );

  // Command: Set Cloudflare Token (Secure OS Secrets Storage)
  context.subscriptions.push(
    vscode.commands.registerCommand('antigravityCompanion.setCloudflareToken', async () => {
      const token = await vscode.window.showInputBox({
        title: 'Cloudflare Tunnel Secret Token',
        prompt: 'Enter your Cloudflare Named Tunnel token to store safely in OS SecretStorage',
        password: true,
        placeHolder: 'eyJhIjoiY2... (paste token here)',
        ignoreFocusOut: true,
      });
      if (token) {
        await daemonManager.setCloudflareToken(token);
        sidebarProvider.updateWebview();
      }
    })
  );

  // Command: Clear Cloudflare Token
  context.subscriptions.push(
    vscode.commands.registerCommand('antigravityCompanion.clearCloudflareToken', async () => {
      await daemonManager.clearCloudflareToken();
      sidebarProvider.updateWebview();
    })
  );

  // Command: Execute Quick Action Command
  context.subscriptions.push(
    vscode.commands.registerCommand('antigravityCompanion.runQuickAction', async (command?: string, label?: string) => {
      if (!command) {
        const actions = daemonManager.getQuickActions();
        if (actions.length === 0) {
          vscode.window.showWarningMessage('No quick actions configured in settings.');
          return;
        }
        const picked = await vscode.window.showQuickPick(
          actions.map(a => ({ label: a.label, description: a.command, cmd: a.command })),
          { placeHolder: 'Select a quick action to run in terminal' }
        );
        if (picked) {
          daemonManager.executeQuickAction(picked.cmd, picked.label);
        }
      } else {
        daemonManager.executeQuickAction(command, label);
      }
    })
  );

  // Command: Show Pairing Ticket
  context.subscriptions.push(
    vscode.commands.registerCommand('antigravityCompanion.showPairing', () => {
      const endpoints = daemonManager.getEndpoints();
      if (endpoints.length === 0) {
        vscode.window.showWarningMessage('Antigravity Companion daemon is not running. Start daemon first.');
        return;
      }
      const primary = endpoints[0];
      vscode.env.clipboard.writeText(primary.ticket);
      vscode.window.showInformationMessage(`Copied Pairing Ticket (${primary.title}) to clipboard!`);
    })
  );

  // Command: Open Settings
  context.subscriptions.push(
    vscode.commands.registerCommand('antigravityCompanion.openSettings', () => {
      vscode.commands.executeCommand('workbench.action.openSettings', 'antigravityCompanion');
    })
  );

  // Workspace change watcher
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      sidebarProvider.updateWebview();
      checkAutoStart();
    })
  );

  // Configuration change watcher
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('antigravityCompanion')) {
        sidebarProvider.updateWebview();
        statusBar.update();
      }
    })
  );

  context.subscriptions.push(statusBar);

  // Active Editor Tabs Synchronization to Companion Daemon
  function syncActiveTabs() {
    try {
      const tabs: import('@agy-companion/protocol').EditorTab[] = [];
      if (vscode.window.tabGroups && vscode.window.tabGroups.all) {
        for (const group of vscode.window.tabGroups.all) {
          for (const tab of group.tabs) {
            const input = tab.input as any;
            const uri: vscode.Uri | undefined = input?.uri || input?.modified;
            let filePath = uri?.fsPath || '';
            if (uri) {
              const rel = vscode.workspace.asRelativePath(uri, false);
              if (rel) filePath = rel.replace(/\\/g, '/');
            }
            tabs.push({
              label: tab.label,
              path: filePath,
              isActive: tab.isActive && group.isActive,
              isDirty: tab.isDirty,
            });
          }
        }
      }
      daemonManager.updateActiveTabs(tabs);
    } catch {}
  }

  if (vscode.window.tabGroups) {
    context.subscriptions.push(
      vscode.window.tabGroups.onDidChangeTabs(() => syncActiveTabs()),
      vscode.window.tabGroups.onDidChangeTabGroups(() => syncActiveTabs())
    );
  }
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => syncActiveTabs())
  );

  setTimeout(syncActiveTabs, 1500);

  // Smart Auto-Start Rules Checker
  function checkAutoStart() {
    const config = vscode.workspace.getConfiguration('antigravityCompanion');
    const autoStartSetting = config.get<string | boolean>('autoStart', 'always');
    let shouldStart = false;

    if (autoStartSetting === true || autoStartSetting === 'always') {
      shouldStart = true;
    } else if (autoStartSetting === 'workspace') {
      shouldStart = hookManager.isInstalledInCurrentWorkspace();
    } // 'manual' or false -> do not auto start

    if (shouldStart && daemonManager.getStatus() === 'stopped') {
      daemonManager.start();
    }
  }

  // Initial probe and auto-start
  daemonManager.probeRunningDaemon().then(running => {
    if (!running) {
      checkAutoStart();
    }
  });

  // Background health probe: keeps sidebar status & metrics synchronized and auto-resurrects daemon if offline
  const probeTimer = setInterval(() => {
    daemonManager.probeRunningDaemon().then(running => {
      if (!running) {
        checkAutoStart();
      }
    });
  }, 3000);
  context.subscriptions.push({ dispose: () => clearInterval(probeTimer) });
}

export function deactivate() {
  // Managed by disposables
}
