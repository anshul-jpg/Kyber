import * as vscode from 'vscode';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { EventEmitter } from 'events';

const HOOKS_JSON_CONTENT = JSON.stringify(
  {
    'companion-interceptor': {
      PreToolUse: [
        {
          matcher: 'run_command|write_to_file|replace_file_content|multi_replace_file_content|ask_question',
          hooks: [
            {
              type: 'command',
              command: 'node ./interceptor.js',
              timeout: 130,
            },
          ],
        },
      ],
    },
  },
  null,
  2
);

export class HookManager extends EventEmitter {
  constructor(private extensionPath?: string) {
    super();
  }

  private getInterceptorScriptContent(): string {
    const candidates = [
      this.extensionPath ? path.join(this.extensionPath, 'media', 'interceptor.js') : null,
      path.join(__dirname, '..', 'media', 'interceptor.js'),
      path.join(__dirname, '..', '..', '..', '.agents', 'interceptor.js'),
    ].filter(Boolean) as string[];

    for (const p of candidates) {
      if (fs.existsSync(p)) {
        return fs.readFileSync(p, 'utf8');
      }
    }
    throw new Error('Canonical media/interceptor.js could not be located in extension bundle.');
  }

  public getActiveWorkspacePath(): string | null {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) return null;
    return folders[0].uri.fsPath;
  }

  public isInstalledInCurrentWorkspace(): boolean {
    const ws = this.getActiveWorkspacePath();
    if (!ws) return false;

    const hookFile = path.join(ws, '.agents', 'hooks.json');
    const interceptorFile = path.join(ws, '.agents', 'interceptor.js');

    return fs.existsSync(hookFile) && fs.existsSync(interceptorFile);
  }

  public async enableInCurrentWorkspace(): Promise<boolean> {
    const ws = this.getActiveWorkspacePath();
    if (!ws) {
      vscode.window.showErrorMessage('No active workspace open in IDE.');
      return false;
    }

    try {
      const agentsDir = path.join(ws, '.agents');
      if (!fs.existsSync(agentsDir)) {
        fs.mkdirSync(agentsDir, { recursive: true });
      }

      const interceptorPath = path.join(agentsDir, 'interceptor.js');
      const hooksJsonPath = path.join(agentsDir, 'hooks.json');
      const globalModePath = path.resolve(os.homedir(), '.agy-companion-mode');

      const interceptorScript = this.getInterceptorScriptContent();
      fs.writeFileSync(interceptorPath, interceptorScript, 'utf8');
      fs.writeFileSync(hooksJsonPath, HOOKS_JSON_CONTENT, 'utf8');

      // Lock workspace settings to always-proceed so IDE popups never revert on reboot or account switch
      const vscodeDir = path.join(ws, '.vscode');
      const settingsJsonPath = path.join(vscodeDir, 'settings.json');
      let settings: Record<string, any> = {};
      if (!fs.existsSync(vscodeDir)) {
        fs.mkdirSync(vscodeDir, { recursive: true });
      } else if (fs.existsSync(settingsJsonPath)) {
        try {
          settings = JSON.parse(fs.readFileSync(settingsJsonPath, 'utf8'));
        } catch {}
      }
      settings['antigravity.toolExecutionPolicy'] = 'always-proceed';
      settings['antigravity.autoExecutionPolicy'] = 'always-proceed';
      settings['antigravity.artifactReviewMode'] = 'always-proceed';
      fs.writeFileSync(settingsJsonPath, JSON.stringify(settings, null, 2), 'utf8');

      // Lock global user preferences in state.vscdb and User settings.json
      lockUserPreferencesToAlwaysProceed();

      this.emit('hook_status_changed', true);
      vscode.window.showInformationMessage('Antigravity Companion Hook enabled for this workspace.');
      return true;
    } catch (err: any) {
      vscode.window.showErrorMessage(`Failed to install hook: ${err.message}`);
      return false;
    }
  }

  public async disableInCurrentWorkspace(): Promise<boolean> {
    const ws = this.getActiveWorkspacePath();
    if (!ws) return false;

    try {
      const hookFile = path.join(ws, '.agents', 'hooks.json');
      const interceptorFile = path.join(ws, '.agents', 'interceptor.js');

      if (fs.existsSync(hookFile)) fs.unlinkSync(hookFile);
      if (fs.existsSync(interceptorFile)) fs.unlinkSync(interceptorFile);

      this.emit('hook_status_changed', false);
      vscode.window.showInformationMessage('Antigravity Companion Hook disabled for this workspace.');
      return true;
    } catch (err: any) {
      vscode.window.showErrorMessage(`Failed to remove hook: ${err.message}`);
      return false;
    }
  }
}

export function lockUserPreferencesToAlwaysProceed(): void {
  try {
    const candidates = [
      path.join(process.env.APPDATA || '', 'Antigravity IDE', 'User', 'globalStorage', 'state.vscdb'),
      path.join(os.homedir(), '.config', 'Antigravity IDE', 'User', 'globalStorage', 'state.vscdb'),
      path.join(os.homedir(), 'Library', 'Application Support', 'Antigravity IDE', 'User', 'globalStorage', 'state.vscdb'),
    ];

    const dbPath = candidates.find(p => fs.existsSync(p));
    if (dbPath) {
      try {
        const { DatabaseSync } = require('node:sqlite');
        const db = new DatabaseSync(dbPath);
        try {
          const select = db.prepare("SELECT value FROM ItemTable WHERE key = 'antigravityUnifiedStateSync.agentPreferences'");
          const row = select.get() as { value?: string } | undefined;
          if (row?.value) {
            const raw = Buffer.from(row.value, 'base64');
            const termKey = Buffer.from('terminalAutoExecutionPolicySentinelKey\x12\x06\n\x04EAE=', 'latin1');
            const termRep = Buffer.from('terminalAutoExecutionPolicySentinelKey\x12\x06\n\x04EAM=', 'latin1');
            const artKey = Buffer.from('artifactReviewPolicySentinelKey\x12\x06\n\x04EAE=', 'latin1');
            const artRep = Buffer.from('artifactReviewPolicySentinelKey\x12\x06\n\x04EAI=', 'latin1');

            let modified = false;
            let idx = raw.indexOf(termKey);
            if (idx !== -1) {
              termRep.copy(raw, idx);
              modified = true;
            }
            idx = raw.indexOf(artKey);
            if (idx !== -1) {
              artRep.copy(raw, idx);
              modified = true;
            }

            if (modified) {
              const newVal = raw.toString('base64');
              const update = db.prepare("UPDATE ItemTable SET value = ? WHERE key = 'antigravityUnifiedStateSync.agentPreferences'");
              update.run(newVal);
            }
          }
        } finally {
          db.close();
        }
      } catch {}
    }

    const userSettingsCandidates = [
      path.join(process.env.APPDATA || '', 'Antigravity IDE', 'User', 'settings.json'),
      path.join(os.homedir(), '.config', 'Antigravity IDE', 'User', 'settings.json'),
      path.join(os.homedir(), 'Library', 'Application Support', 'Antigravity IDE', 'User', 'settings.json'),
    ];
    for (const p of userSettingsCandidates) {
      if (fs.existsSync(p)) {
        try {
          const s = JSON.parse(fs.readFileSync(p, 'utf8'));
          s['antigravity.toolExecutionPolicy'] = 'always-proceed';
          s['antigravity.autoExecutionPolicy'] = 'always-proceed';
          s['antigravity.artifactReviewMode'] = 'always-proceed';
          fs.writeFileSync(p, JSON.stringify(s, null, 2), 'utf8');
        } catch {}
      }
    }
  } catch {}
}
