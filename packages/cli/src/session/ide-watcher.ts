import fs from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import { ChatMessage } from '@agy-companion/protocol';

export class IdeTranscriptWatcher extends EventEmitter {
  private activeTranscriptPath: string | null = null;
  private lastReadBytes: number = 0;
  private watchTimer: NodeJS.Timeout | null = null;
  private messageHistory: ChatMessage[] = [];

  constructor() {
    super();
  }

  public setTranscriptPath(transcriptPath: string): void {
    if (this.activeTranscriptPath === transcriptPath) return;

    this.activeTranscriptPath = transcriptPath;
    this.lastReadBytes = 0;
    this.messageHistory = [];
    console.log(`[IdeWatcher] Now tracking IDE transcript: ${transcriptPath}`);
    this.readNewEntries();
    this.startWatching();
  }

  public getHistory(): ChatMessage[] {
    if (this.messageHistory.length === 0 && this.activeTranscriptPath && fs.existsSync(this.activeTranscriptPath)) {
      try {
        const content = fs.readFileSync(this.activeTranscriptPath, 'utf8');
        const lines = content.split('\n').filter(l => l.trim().length > 0);
        for (const line of lines) {
          try {
            const entry = JSON.parse(line);
            this.handleTranscriptEntry(entry, false);
          } catch {}
        }
        this.lastReadBytes = fs.statSync(this.activeTranscriptPath).size;
      } catch {}
    }
    return [...this.messageHistory];
  }

  public autoDiscoverActiveConversation(workspaceDir?: string): string | null {
    try {
      const home = os.homedir();
      const brainDir = path.join(home, '.gemini', 'antigravity-ide', 'brain');
      if (!fs.existsSync(brainDir)) return null;

      const entries = fs.readdirSync(brainDir, { withFileTypes: true });
      const dirs = entries.filter(e => e.isDirectory() && !e.name.startsWith('.'));

      if (dirs.length === 0) return null;

      // Sort by modified time of transcript.jsonl descending
      const candidates = dirs
        .map(d => {
          const transcriptPath = path.join(brainDir, d.name, '.system_generated', 'logs', 'transcript.jsonl');
          try {
            if (!fs.existsSync(transcriptPath)) return null;
            const stat = fs.statSync(transcriptPath);
            return { name: d.name, path: transcriptPath, mtime: stat.mtimeMs };
          } catch {
            return null;
          }
        })
        .filter((d): d is { name: string; path: string; mtime: number } => d !== null)
        .sort((a, b) => b.mtime - a.mtime);

      if (candidates.length > 0) {
        this.setTranscriptPath(candidates[0].path);
        return candidates[0].path;
      }
    } catch (err: any) {
      console.warn(`[IdeWatcher] Auto-discover warning: ${err.message}`);
    }
    return null;
  }

  private startWatching(): void {
    if (this.watchTimer) clearInterval(this.watchTimer);

    // Poll file every 500ms for new lines (robust across Windows file locks)
    this.watchTimer = setInterval(() => {
      this.readNewEntries();
    }, 500);
  }

  private readNewEntries(): void {
    if (!this.activeTranscriptPath || !fs.existsSync(this.activeTranscriptPath)) return;

    try {
      const stat = fs.statSync(this.activeTranscriptPath);
      if (stat.size <= this.lastReadBytes) return;

      const stream = fs.createReadStream(this.activeTranscriptPath, {
        start: this.lastReadBytes,
        end: stat.size,
        encoding: 'utf8',
      });

      let buffer = '';
      stream.on('data', chunk => {
        buffer += chunk;
      });

      stream.on('end', () => {
        this.lastReadBytes = stat.size;
        const lines = buffer.split('\n').filter(l => l.trim().length > 0);

        for (const line of lines) {
          try {
            const entry = JSON.parse(line);
            this.handleTranscriptEntry(entry);
          } catch {
            // Incomplete JSON line, will be read on next tick
          }
        }
      });
    } catch {
      // Ignore transient read errors while IDE is writing
    }
  }

  private recordMessage(msg: ChatMessage, emitLive: boolean = true): void {
    if (!this.messageHistory.some(m => m.id === msg.id)) {
      this.messageHistory.push(msg);
      if (emitLive) {
        this.emit('message', msg);
      }
    }
  }

  private handleTranscriptEntry(entry: any, emitLive: boolean = true): void {
    // 1. User Message in IDE
    if (entry.type === 'USER_INPUT' && entry.content) {
      let cleanContent = entry.content;
      // Strip metadata tags like <USER_REQUEST>...</USER_REQUEST>
      const match = entry.content.match(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/);
      if (match) {
        cleanContent = match[1].trim();
      }

      const msg: ChatMessage = {
        id: `ide_u_${entry.step_index || Date.now()}`,
        role: 'user',
        content: cleanContent,
        timestamp: entry.created_at ? new Date(entry.created_at).getTime() : Date.now(),
      };
      this.recordMessage(msg, emitLive);
    }

    // 2. Model Response in IDE
    if (entry.type === 'PLANNER_RESPONSE') {
      if (entry.content) {
        const msg: ChatMessage = {
          id: `ide_a_${entry.step_index || Date.now()}`,
          role: 'assistant',
          content: entry.content,
          timestamp: entry.created_at ? new Date(entry.created_at).getTime() : Date.now(),
          thought: entry.thinking,
        };
        this.recordMessage(msg, emitLive);
      } else if (entry.tool_calls && entry.tool_calls.length > 0) {
        for (const tc of entry.tool_calls) {
          const summary = this.getToolSummary(tc.name, tc.args);
          const msg: ChatMessage = {
            id: `ide_t_${entry.step_index || Date.now()}_${tc.name}`,
            role: 'tool',
            content: summary,
            timestamp: entry.created_at ? new Date(entry.created_at).getTime() : Date.now(),
            toolCall: {
              name: tc.name,
              args: tc.args || {},
            },
          };
          this.recordMessage(msg, emitLive);
        }
      }
    }
  }

  private getToolSummary(name: string, args: any): string {
    if (!args) return name;
    if (args.toolSummary) return args.toolSummary;
    if (args.toolAction) return args.toolAction;
    if (args.Description) return args.Description;
    if (name === 'run_command' && args.CommandLine) return args.CommandLine;
    if ((name === 'view_file' || name === 'replace_file_content' || name === 'write_to_file') && (args.AbsolutePath || args.TargetFile)) {
      const p = (args.AbsolutePath || args.TargetFile).replace(/\\/g, '/').split('/');
      return `${name === 'view_file' ? 'View' : 'Edit'} ${p[p.length - 1]}`;
    }
    if (name === 'grep_search' && args.Query) return `Search "${args.Query}"`;
    return name;
  }

  public stop(): void {
    if (this.watchTimer) {
      clearInterval(this.watchTimer);
      this.watchTimer = null;
    }
  }

  public getActiveConversationId(): string | null {
    if (!this.activeTranscriptPath) return null;
    const normalized = this.activeTranscriptPath.replace(/\\/g, '/');
    const match = normalized.match(/\/brain\/([^\/]+)\//);
    return match ? match[1] : null;
  }

  public injectMessageToIde(
    content: string,
    images?: { base64: string; name: string }[] | { base64?: string; name?: string },
    imageName?: string
  ): { success: boolean; imageSavedPaths: string[] } {
    const convId = this.getActiveConversationId();
    if (!convId) return { success: false, imageSavedPaths: [] };

    const home = os.homedir();
    const messagesDir = path.join(
      home,
      '.gemini',
      'antigravity-ide',
      'brain',
      convId,
      '.system_generated',
      'messages'
    );
    const undeliveredDir = path.join(messagesDir, 'undelivered');
    const userUploadedDir = path.join(
      home,
      '.gemini',
      'antigravity-ide',
      'brain',
      convId,
      '.user_uploaded'
    );

    const savedPaths: string[] = [];

    try {
      if (!fs.existsSync(messagesDir)) {
        fs.mkdirSync(messagesDir, { recursive: true });
      }
      if (!fs.existsSync(undeliveredDir)) {
        fs.mkdirSync(undeliveredDir, { recursive: true });
      }

      // Normalize images input
      let imageList: { base64: string; name: string }[] = [];
      if (Array.isArray(images)) {
        imageList = images;
      } else if (typeof images === 'string') {
        imageList = [{ base64: images, name: imageName || 'mobile_photo.png' }];
      } else if (images && (images as any).base64) {
        imageList = [{ base64: (images as any).base64, name: (images as any).name || 'mobile_photo.png' }];
      }

      if (imageList.length > 0) {
        if (!fs.existsSync(userUploadedDir)) {
          fs.mkdirSync(userUploadedDir, { recursive: true });
        }
        for (const img of imageList) {
          const safeName = (img.name || 'mobile_photo.png').replace(/[^a-zA-Z0-9._-]/g, '_');
          const filename = `mobile_${Date.now()}_${Math.floor(Math.random() * 1000)}_${safeName}`;
          const targetPath = path.join(userUploadedDir, filename);
          const buf = Buffer.from(img.base64, 'base64');
          fs.writeFileSync(targetPath, buf);
          savedPaths.push(targetPath);
        }
      }

      // Generate RFC4122 v4 UUID
      const msgId = crypto.randomUUID();
      let fullContent = `[📱 Message from Phone]: ${content}`;
      if (savedPaths.length > 0) {
        fullContent +=
          '\n\n' + savedPaths.map(p => `[Attached Media]: file:///${p.replace(/\\/g, '/')}`).join('\n');
      }

      const payload = {
        id: msgId,
        recipient: convId,
        sender: 'companion',
        priority: 'MESSAGE_PRIORITY_HIGH',
        timestamp: new Date().toISOString(),
        renderDetails: {
          messageTitle: 'Prompt from Mobile Companion',
        },
        content: fullContent,
      };

      // Antigravity IDE protocol:
      // 1. Full JSON payload resides in messages/<msgId>.json
      const messageFile = path.join(messagesDir, `${msgId}.json`);
      fs.writeFileSync(messageFile, JSON.stringify(payload, null, 2), 'utf8');

      // 2. 0-byte queue marker resides in messages/undelivered/<msgId> (WITHOUT .json)
      const markerFile = path.join(undeliveredDir, msgId);
      fs.writeFileSync(markerFile, '', 'utf8');

      // 3. Trigger instant sub-second wakeup via local wake listener (0ms debounce)
      try {
        const req = http.request({
          hostname: '127.0.0.1',
          port: 4049,
          path: '/wake',
          method: 'GET',
          timeout: 200,
        });
        req.on('error', () => {});
        req.end();
      } catch {}

      console.log(
        `\n🔔 [INPUT NEEDED] Mobile prompt dispatched to Antigravity: "${content}" ${
          savedPaths.length > 0 ? `[with media: ${savedPaths.join(', ')}]` : ''
        }\n`
      );
      return { success: true, imageSavedPaths: savedPaths };
    } catch (err: any) {
      console.error(`[IdeWatcher] Failed to inject message into IDE:`, err.message);
      return { success: false, imageSavedPaths: [] };
    }
  }
}
