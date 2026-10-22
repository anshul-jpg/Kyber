import * as vscode from 'vscode';
import { DaemonManager } from './daemon-manager';

export class CompanionStatusBar {
  private item: vscode.StatusBarItem;

  constructor(private daemonManager: DaemonManager) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = 'antigravityCompanion.toggleMode';
    this.update();

    this.daemonManager.on('status_changed', () => this.update());
    this.daemonManager.on('mode_changed', () => this.update());
    this.daemonManager.on('approvals_changed', () => this.update());
  }

  public show(): void {
    this.item.show();
  }

  public hide(): void {
    this.item.hide();
  }

  public update(): void {
    const status = this.daemonManager.getStatus();
    const mode = this.daemonManager.getMode();
    const pending = this.daemonManager.getPendingApprovals();

    if (status === 'stopped') {
      this.item.text = '$(circle-slash) Companion: Off';
      this.item.tooltip = 'Antigravity Companion daemon is stopped. Click to toggle mode or run Start Daemon.';
      this.item.backgroundColor = undefined;
      this.item.color = '#858585';
    } else if (status === 'starting') {
      this.item.text = '$(sync~spin) Companion: Starting...';
      this.item.tooltip = 'Starting daemon and tunnel...';
      this.item.backgroundColor = undefined;
      this.item.color = '#f59e0b';
    } else if (pending.length > 0) {
      this.item.text = `$(bell-dot) Approval Required (${pending.length})`;
      this.item.tooltip = `${pending.length} pending tool approval(s). Click to review in Companion Hub.`;
      this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      this.item.color = undefined;
    } else if (mode === 'auto') {
      const eff = this.daemonManager.getEffectiveMode();
      this.item.text = `$(sparkle) Auto (${eff === 'remote' ? 'Phone' : 'PC'})`;
      this.item.tooltip = `Antigravity Companion: Auto Adaptive Mode (Currently resolving to ${eff === 'remote' ? 'Phone' : 'PC'}). Click to toggle mode.`;
      this.item.backgroundColor = undefined;
      this.item.color = '#c084fc';
    } else if (mode === 'remote') {
      this.item.text = '$(device-mobile) Remote Active';
      this.item.tooltip = 'Antigravity Companion: Remote Mode (Approvals routed to phone). Click to switch to Desk Mode.';
      this.item.backgroundColor = undefined;
      this.item.color = '#0098ff';
    } else {
      this.item.text = '$(vm) Desk Active';
      this.item.tooltip = 'Antigravity Companion: Desk Mode (Approvals routed to desktop screen). Click to switch to Auto/Remote Mode.';
      this.item.backgroundColor = undefined;
      this.item.color = '#4ade80';
    }
  }

  public dispose(): void {
    this.item.dispose();
  }
}
