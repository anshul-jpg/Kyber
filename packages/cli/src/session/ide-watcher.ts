import fs from 'fs';
import path from 'path';
import os from 'os';
import { EventEmitter } from 'events';
import { ChatMessage } from '@agy-companion/protocol';

export class IdeTranscriptWatcher extends EventEmitter {
  private activeTranscriptPath: string | null = null;
  private lastReadBytes: number = 0;
  private watchTimer: NodeJS.Timeout | null = null;

  constructor() {
    super();
  }

  public setTranscriptPath(transcriptPath: string): void {
    if (this.activeTranscriptPath === transcriptPath) return;

    this.activeTranscriptPath = transcriptPath;
    this.lastReadBytes = 0;
    console.log(`[IdeWatcher] Now tracking IDE transcript: ${transcriptPath}`);
    this.readNewEntries();
    this.startWatching();
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

  private handleTranscriptEntry(entry: any): void {
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
      this.emit('message', msg);
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
        this.emit('message', msg);
      } else if (entry.tool_calls && entry.tool_calls.length > 0) {
        for (const tc of entry.tool_calls) {
          const msg: ChatMessage = {
            id: `ide_t_${entry.step_index || Date.now()}_${tc.name}`,
            role: 'assistant',
            content: `🔧 Running tool: **${tc.name}**\n\`\`\`json\n${JSON.stringify(tc.args, null, 2)}\n\`\`\``,
            timestamp: entry.created_at ? new Date(entry.created_at).getTime() : Date.now(),
            toolCall: {
              name: tc.name,
              args: tc.args || {},
            },
          };
          this.emit('message', msg);
        }
      }
    }
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

  public injectMessageToIde(content: string): boolean {
    const convId = this.getActiveConversationId();
    if (!convId) return false;

    const home = os.homedir();
    const undeliveredDir = path.join(
      home,
      '.gemini',
      'antigravity-ide',
      'brain',
      convId,
      '.system_generated',
      'messages',
      'undelivered'
    );

    try {
      if (!fs.existsSync(undeliveredDir)) {
        fs.mkdirSync(undeliveredDir, { recursive: true });
      }

      const msgId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const payload = {
        id: msgId,
        recipient: convId,
        sender: 'companion-phone',
        priority: 'MESSAGE_PRIORITY_HIGH',
        timestamp: new Date().toISOString(),
        renderDetails: {
          messageTitle: 'Prompt from Mobile Companion',
        },
        content: `[📱 Message from Phone]: ${content}`,
      };

      const targetFile = path.join(undeliveredDir, `${msgId}.json`);
      fs.writeFileSync(targetFile, JSON.stringify(payload, null, 2), 'utf8');
      console.log(`\n📱 [PHONE -> IDE] Delivered prompt to active IDE chat: "${content}"\n`);
      return true;
    } catch (err: any) {
      console.error(`[IdeWatcher] Failed to inject message into IDE:`, err.message);
      return false;
    }
  }
}
