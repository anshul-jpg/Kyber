import fs from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';
import { fileURLToPath } from 'url';
import { EventEmitter } from 'events';
import { ChatMessage, AgentQuota, AudioAttachment, TerminalEntry } from '@agy-companion/protocol';
import { getLiveAgentQuotas, getActiveIdeModel, setActiveIdeModel, quotaEventEmitter } from './quota-tracker.js';

export class IdeTranscriptWatcher extends EventEmitter {
  private activeTranscriptPath: string | null = null;
  private currentWorkspaceDir?: string;
  private lastReadBytes: number = 0;
  private remainderBuffer: string = '';
  private lastThought: string | null = null;
  private autoDiscoverTicks: number = 0;
  private watchTimer: NodeJS.Timeout | null = null;
  private messageHistory: ChatMessage[] = [];
  private terminalHistory: TerminalEntry[] = [];
  private taskFileOffsets: Map<string, number> = new Map();
  private convWorkspaceCache: Map<string, string> = new Map();
  private cachedLiveQuotas: AgentQuota[] = [];
  private lastLiveQuotaFetch: number = 0;
  private detectedModel: string = 'Gemini 3.8 Flash (High)';
  private activeModelOverride: string | null = null;

  constructor() {
    super();
    quotaEventEmitter.on('account_switched', () => {
      getLiveAgentQuotas(true).then(quotas => {
        if (quotas && quotas.length > 0) {
          this.cachedLiveQuotas = quotas;
          this.emit('quotas_updated', quotas);
        }
      }).catch(() => {});
    });
  }

  public setActiveModel(model: string): void {
    this.activeModelOverride = model;
    this.detectedModel = model;
    setActiveIdeModel(model);
    this.emit('model_updated', model);
    this.emit('quotas_updated', this.getAgentQuotas());
  }

  public getActiveModel(): string {
    return this.activeModelOverride || getActiveIdeModel() || this.detectedModel;
  }

  public setTranscriptPath(transcriptPath: string | null): void {
    if (this.activeTranscriptPath === transcriptPath) return;

    this.activeTranscriptPath = transcriptPath;
    this.lastReadBytes = 0;
    this.remainderBuffer = '';
    this.lastThought = null;
    this.messageHistory = [];
    this.terminalHistory = [];
    this.taskFileOffsets.clear();
    if (transcriptPath) {
      console.log(`[IdeWatcher] Now tracking IDE transcript: ${transcriptPath}`);
      this.readNewEntries();
      this.startWatching();
    }
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

  public getTerminalHistory(): TerminalEntry[] {
    return [...this.terminalHistory];
  }

  private recordTerminalEntry(entry: TerminalEntry): void {
    if (!this.terminalHistory.some(t => t.id === entry.id)) {
      this.terminalHistory.push(entry);
      if (this.terminalHistory.length > 100) {
        this.terminalHistory.shift();
      }
    }
  }

  public getWorkspaceStorageMappings(workspaceDir: string): { targetIds: Set<string>; otherIds: Set<string> } {
    const targetIds = new Set<string>();
    const otherIds = new Set<string>();
    try {
      const home = os.homedir();
      const storageCandidates = [
        path.join(home, 'AppData', 'Roaming', 'Antigravity IDE', 'User', 'workspaceStorage'),
        path.join(home, 'AppData', 'Roaming', 'Code', 'User', 'workspaceStorage'),
        path.join(home, 'Library', 'Application Support', 'Antigravity IDE', 'User', 'workspaceStorage'),
        path.join(home, '.config', 'Antigravity IDE', 'User', 'workspaceStorage'),
      ];
      const storageDir = storageCandidates.find(p => fs.existsSync(p));
      if (!storageDir) return { targetIds, otherIds };

      const normTarget = path.resolve(workspaceDir).toLowerCase().replace(/\\/g, '/');

      const subs = fs.readdirSync(storageDir, { withFileTypes: true });
      for (const sub of subs) {
        if (!sub.isDirectory()) continue;
        const wsJsonPath = path.join(storageDir, sub.name, 'workspace.json');
        if (!fs.existsSync(wsJsonPath)) continue;

        try {
          const wsJson = JSON.parse(fs.readFileSync(wsJsonPath, 'utf8'));
          if (!wsJson.folder) continue;
          let folder = wsJson.folder;
          if (folder.startsWith('file:///')) {
            folder = decodeURIComponent(folder.replace('file:///', ''));
          } else if (folder.startsWith('file://')) {
            folder = decodeURIComponent(folder.replace('file://', ''));
          }
          const normFolder = path.resolve(folder).toLowerCase().replace(/\\/g, '/');
          const isTarget = normFolder === normTarget;

          const dbPath = path.join(storageDir, sub.name, 'state.vscdb');
          if (fs.existsSync(dbPath)) {
            const raw = fs.readFileSync(dbPath).toString('binary');
            const matches = raw.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/g);
            if (matches) {
              for (const m of matches) {
                if (isTarget) {
                  targetIds.add(m);
                } else {
                  otherIds.add(m);
                }
              }
            }
          }
        } catch {}
      }
    } catch (err: any) {
      console.warn(`[IdeWatcher] getWorkspaceStorageMappings warning: ${err.message}`);
    }

    const normTarget = path.resolve(workspaceDir).toLowerCase().replace(/\\/g, '/');
    for (const [convId, cachedWs] of this.convWorkspaceCache.entries()) {
      if (cachedWs === normTarget) {
        targetIds.add(convId);
      } else {
        otherIds.add(convId);
      }
    }

    return { targetIds, otherIds };
  }

  public getConversationIdsForWorkspace(workspaceDir: string): Set<string> {
    return this.getWorkspaceStorageMappings(workspaceDir).targetIds;
  }

  private isConversationForWorkspace(
    convId: string,
    transcriptPath: string,
    targetDir: string,
    mappings: { targetIds: Set<string>; otherIds: Set<string> }
  ): boolean {
    const normTarget = path.resolve(targetDir).toLowerCase().replace(/\\/g, '/');

    // 1. Explicitly recorded for target workspace
    if (mappings.targetIds.has(convId)) {
      return true;
    }

    // 2. Explicitly recorded for a different workspace
    if (mappings.otherIds.has(convId)) {
      return false;
    }

    // 3. Fast inspection of step 0 header in transcript (covers active and newly created sessions)
    try {
      if (fs.existsSync(transcriptPath)) {
        const fd = fs.openSync(transcriptPath, 'r');
        const buf = Buffer.alloc(8192);
        const bytesRead = fs.readSync(fd, buf, 0, 8192, 0);
        fs.closeSync(fd);
        if (bytesRead > 0) {
          const header = buf.subarray(0, bytesRead).toString('utf8').toLowerCase().replace(/\\\\/g, '/');
          if (header.includes(normTarget)) {
            this.convWorkspaceCache.set(convId, normTarget);
            mappings.targetIds.add(convId);
            return true;
          }
        }
      }
    } catch {}

    return false;
  }

  public getAntigravityBrainDirs(): string[] {
    const home = os.homedir();
    const dirs = [
      path.join(home, '.gemini', 'antigravity-ide', 'brain'),
      path.join(home, '.gemini', 'antigravity', 'brain'),
    ];
    return dirs.filter(d => fs.existsSync(d));
  }

  public getAntigravityBaseDir(): string {
    const home = os.homedir();
    const ideBrain = path.join(home, '.gemini', 'antigravity-ide', 'brain');
    const modernBrain = path.join(home, '.gemini', 'antigravity', 'brain');

    const ideExists = fs.existsSync(ideBrain);
    const modernExists = fs.existsSync(modernBrain);

    if (ideExists && modernExists) {
      try {
        const ideTime = fs.statSync(ideBrain).mtimeMs;
        const modernTime = fs.statSync(modernBrain).mtimeMs;
        return modernTime > ideTime
          ? path.join(home, '.gemini', 'antigravity')
          : path.join(home, '.gemini', 'antigravity-ide');
      } catch {
        return path.join(home, '.gemini', 'antigravity-ide');
      }
    }
    if (modernExists) return path.join(home, '.gemini', 'antigravity');
    return path.join(home, '.gemini', 'antigravity-ide');
  }

  public getAntigravityBrainDir(): string {
    return path.join(this.getAntigravityBaseDir(), 'brain');
  }

  public autoDiscoverActiveConversation(workspaceDir?: string): string | null {
    try {
      const brainDirs = this.getAntigravityBrainDirs();
      if (brainDirs.length === 0) return null;

      const targetDir = workspaceDir || this.currentWorkspaceDir;
      if (workspaceDir) {
        this.currentWorkspaceDir = workspaceDir;
      }

      const allCandidates: { name: string; path: string; mtime: number; brainDir: string }[] = [];

      for (const brainDir of brainDirs) {
        try {
          const entries = fs.readdirSync(brainDir, { withFileTypes: true });
          const dirs = entries.filter(e => e.isDirectory() && !e.name.startsWith('.'));
          for (const d of dirs) {
            const fullPath = path.join(brainDir, d.name, '.system_generated', 'logs', 'transcript_full.jsonl');
            const compactPath = path.join(brainDir, d.name, '.system_generated', 'logs', 'transcript.jsonl');
            const transcriptPath = fs.existsSync(fullPath) ? fullPath : compactPath;
            if (fs.existsSync(transcriptPath)) {
              try {
                const stat = fs.statSync(transcriptPath);
                allCandidates.push({ name: d.name, path: transcriptPath, mtime: stat.mtimeMs, brainDir });
              } catch {}
            }
          }
        } catch {}
      }

      if (allCandidates.length === 0) return null;

      // Sort by modified time of transcript descending
      const candidates = allCandidates.sort((a, b) => b.mtime - a.mtime);

      let best: { name: string; path: string; mtime: number } | null = null;

      if (targetDir) {
        const mappings = this.getWorkspaceStorageMappings(targetDir);
        for (const candidate of candidates) {
          if (this.isConversationForWorkspace(candidate.name, candidate.path, targetDir, mappings)) {
            best = candidate;
            break;
          }
        }
      } else {
        best = candidates[0] || null;
      }

      if (best) {
        let currentMtime = 0;
        if (this.activeTranscriptPath && fs.existsSync(this.activeTranscriptPath)) {
          try {
            currentMtime = fs.statSync(this.activeTranscriptPath).mtimeMs;
          } catch {}
        }
        const isExplicitSwitch = !!workspaceDir;
        if (best.path !== this.activeTranscriptPath && (isExplicitSwitch || best.mtime > currentMtime + 2500 || !currentMtime)) {
          this.setTranscriptPath(best.path);
          this.emit('conversation_switched', {
            id: best.name,
            title: this.getConversationTitle(),
            history: this.getHistory(),
          });
        }
        return this.activeTranscriptPath || best.path;
      } else if (targetDir) {
        // Workspace exists but has no conversations yet
        if (this.activeTranscriptPath) {
          this.setTranscriptPath(null);
          this.emit('conversation_switched', {
            id: 'new_session',
            title: 'New Session',
            history: [],
          });
        }
        return null;
      }
    } catch (err: any) {
      console.warn(`[IdeWatcher] Auto-discover warning: ${err.message}`);
    }
    return null;
  }

  private startWatching(): void {
    if (this.watchTimer) clearInterval(this.watchTimer);

    // Poll file every 250ms for low-latency live streaming
    this.watchTimer = setInterval(() => {
      this.readNewEntries();
      this.readNewTaskLogs();

      // Every 30 ticks (~7.5s), auto-discover if Antigravity started or switched conversation
      this.autoDiscoverTicks++;
      if (this.autoDiscoverTicks >= 30) {
        this.autoDiscoverTicks = 0;
        this.autoDiscoverActiveConversation(this.currentWorkspaceDir);
      }
    }, 250);
  }

  private readNewEntries(): void {
    if (!this.activeTranscriptPath || !fs.existsSync(this.activeTranscriptPath)) return;

    try {
      const stat = fs.statSync(this.activeTranscriptPath);
      if (stat.size <= this.lastReadBytes) return;

      const fd = fs.openSync(this.activeTranscriptPath, 'r');
      const bytesToRead = stat.size - this.lastReadBytes;
      const buf = Buffer.alloc(bytesToRead);
      const bytesRead = fs.readSync(fd, buf, 0, bytesToRead, this.lastReadBytes);
      fs.closeSync(fd);

      if (bytesRead <= 0) return;

      this.lastReadBytes += bytesRead;
      const chunkStr = this.remainderBuffer + buf.subarray(0, bytesRead).toString('utf8');

      const lastNewline = chunkStr.lastIndexOf('\n');
      if (lastNewline === -1) {
        // Line still incomplete; wait for next tick
        this.remainderBuffer = chunkStr;
        return;
      }

      const completeText = chunkStr.substring(0, lastNewline);
      this.remainderBuffer = chunkStr.substring(lastNewline + 1);

      const lines = completeText.split('\n').filter(l => l.trim().length > 0);
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          this.handleTranscriptEntry(entry);
        } catch {
          // Incomplete or non-JSON line skipped safely
        }
      }
    } catch {
      // Ignore transient read errors while IDE is writing
    }
  }

  private readNewTaskLogs(): void {
    if (!this.activeTranscriptPath) return;
    try {
      const logsDir = path.dirname(this.activeTranscriptPath);
      const systemGenDir = path.dirname(logsDir);
      const tasksDir = path.join(systemGenDir, 'tasks');
      if (!fs.existsSync(tasksDir)) return;

      const entries = fs.readdirSync(tasksDir).filter(f => f.startsWith('task-') && f.endsWith('.log'));
      for (const file of entries) {
        const fullPath = path.join(tasksDir, file);
        const stat = fs.statSync(fullPath);
        const lastOffset = this.taskFileOffsets.get(fullPath) ?? 0;
        if (stat.size <= lastOffset) continue;

        const fd = fs.openSync(fullPath, 'r');
        const bytesToRead = stat.size - lastOffset;
        const buf = Buffer.alloc(bytesToRead);
        fs.readSync(fd, buf, 0, bytesToRead, lastOffset);
        fs.closeSync(fd);
        this.taskFileOffsets.set(fullPath, stat.size);

        const chunk = buf.toString('utf8');
        if (!chunk.trim()) continue;

        const stepMatch = file.match(/task-(\d+)\.log/);
        const stepIndex = stepMatch ? parseInt(stepMatch[1], 10) : 0;
        const now = Date.now();

        this.emit('task_output', {
          stepIndex,
          logChunk: chunk,
          timestamp: now,
        });

        const entry: TerminalEntry = {
          id: `task_${stepIndex}_${now}`,
          command: `Task #${stepIndex}`,
          output: chunk,
          timestamp: now,
        };
        this.recordTerminalEntry(entry);
        this.emit('terminal_output', entry);
      }
    } catch {
      // Ignore transient errors while task files are written
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
      if (entry.content.includes('Model Selection')) {
        const modelMatch = entry.content.match(/Model Selection`?\s+from\s+.*?\s+to\s+([A-Za-z0-9\s\.\(\)\-]+?)\./i);
        if (modelMatch && modelMatch[1]) {
          const newModel = modelMatch[1].trim();
          this.detectedModel = newModel;
          this.activeModelOverride = newModel;
          setActiveIdeModel(newModel);
          if (emitLive) {
            this.emit('model_updated', newModel);
            this.emit('quotas_updated', this.getAgentQuotas());
          }
        }
        if (entry.content.includes('<USER_SETTINGS_CHANGE>')) {
          return;
        }
      }

      let cleanContent = entry.content;
      // Strip metadata tags like <USER_REQUEST>...</USER_REQUEST>
      const match = entry.content.match(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/);
      if (match) {
        cleanContent = match[1].trim();
      }

      // Strip [Attached Media]: file:///... dumps from transcript display
      cleanContent = cleanContent.replace(/\s*\[Attached Media\]:[\s\S]*$/i, '').trim();

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
      const thinking = entry.thinking || entry.thought;
      if (thinking) {
        this.lastThought = thinking;
        if (emitLive) {
          this.emit('thought', thinking);
        }
      }

      const hasTools = Boolean(entry.tool_calls && entry.tool_calls.length > 0);

      // In Antigravity IDE, when entry.tool_calls is present, entry.content is internal tool pre-reasoning/scratchpad
      // (or raw transcript analysis), NOT a user-facing assistant response.
      // Emitting it as an assistant message leaks raw scratchpads & transcripts into the chat feed.
      if (hasTools) {
        const thoughtToAttach = entry.content || thinking || this.lastThought || undefined;
        for (let i = 0; i < entry.tool_calls.length; i++) {
          const tc = entry.tool_calls[i];
          const summary = this.getToolSummary(tc.name, tc.args);
          const msg: ChatMessage = {
            id: `ide_t_${entry.step_index || Date.now()}_${tc.name}_${i}`,
            role: 'tool',
            content: summary,
            timestamp: entry.created_at ? new Date(entry.created_at).getTime() : Date.now(),
            thought: i === 0 ? thoughtToAttach : undefined,
            toolCall: {
              name: tc.name,
              args: tc.args || {},
            },
          };
          this.recordMessage(msg, emitLive);
        }
        this.lastThought = null;
      } else if (entry.content) {
        // Strip any residual raw voice note transcription leaks
        const cleanContent = entry.content.replace(/^\s*\d+:\d+\s*-\s*\d+:\d+:?\s*The user explicitly laid out[\s\S]*?THIS IS INCREDIBLY CLEAR[^\n]*\n+/i, '').trim();
        if (cleanContent) {
          const thoughtToAttach = thinking || this.lastThought || undefined;
          const msg: ChatMessage = {
            id: `ide_a_${entry.step_index || Date.now()}`,
            role: 'assistant',
            content: cleanContent,
            timestamp: entry.created_at ? new Date(entry.created_at).getTime() : Date.now(),
            thought: thoughtToAttach,
          };
          this.recordMessage(msg, emitLive);
        }
        this.lastThought = null;
      } else if (thinking) {
        const msg: ChatMessage = {
          id: `ide_th_${entry.step_index || Date.now()}`,
          role: 'assistant',
          content: '',
          timestamp: entry.created_at ? new Date(entry.created_at).getTime() : Date.now(),
          thought: thinking,
        };
        this.recordMessage(msg, emitLive);
      }
    }

    // 3. Tool Result / Run Command Output in IDE
    if (entry.type === 'RUN_COMMAND') {
      const output = entry.content || '';
      const exitCode = typeof entry.exit_code === 'number' ? entry.exit_code : 0;
      let matchedCommand = '';
      for (let i = this.messageHistory.length - 1; i >= 0; i--) {
        const m = this.messageHistory[i];
        if (m.role === 'tool' && m.toolCall?.name === 'run_command' && !m.toolResult) {
          m.toolResult = output;
          matchedCommand = m.toolCall.args?.CommandLine || '';
          break;
        }
      }
      const entryObj: TerminalEntry = {
        id: `term_${entry.step_index || Date.now()}`,
        command: matchedCommand,
        output,
        exitCode,
        timestamp: entry.created_at ? new Date(entry.created_at).getTime() : Date.now(),
      };
      this.recordTerminalEntry(entryObj);
      if (emitLive) {
        this.emit('terminal_output', entryObj);
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

  public getConversationTitle(): string {
    const firstUserMsg = this.messageHistory.find(m => m.role === 'user');
    if (firstUserMsg && firstUserMsg.content) {
      const line = firstUserMsg.content.split('\n')[0].trim();
      return line.length > 36 ? line.substring(0, 36) + '...' : line;
    }
    const convId = this.getActiveConversationId();
    return convId ? `Session ${convId.substring(0, 8)}` : 'Agent';
  }

  public getRecentConversations(workspaceDir?: string): { id: string; title: string; timestamp: number }[] {
    const brainDirs = this.getAntigravityBrainDirs();
    if (brainDirs.length === 0) return [];

    const targetDir = workspaceDir || this.currentWorkspaceDir;
    const mappings = targetDir ? this.getWorkspaceStorageMappings(targetDir) : null;

    try {
      const convMap = new Map<string, { id: string; title: string; timestamp: number }>();
      for (const brainDir of brainDirs) {
        let dirs: fs.Dirent[] = [];
        try {
          dirs = fs.readdirSync(brainDir, { withFileTypes: true });
        } catch { continue; }
        for (const d of dirs) {
          if (!d.isDirectory() || d.name.startsWith('.')) continue;
          if (convMap.has(d.name)) continue;
          const fullPath = path.join(brainDir, d.name, '.system_generated', 'logs', 'transcript_full.jsonl');
          const compactPath = path.join(brainDir, d.name, '.system_generated', 'logs', 'transcript.jsonl');
          const transcriptPath = fs.existsSync(fullPath) ? fullPath : compactPath;
          if (!fs.existsSync(transcriptPath)) continue;

          if (targetDir && mappings) {
            if (!this.isConversationForWorkspace(d.name, transcriptPath, targetDir, mappings)) {
              continue;
            }
          }
          const stat = fs.statSync(transcriptPath);
          let title = `Session ${d.name.substring(0, 8)}`;
          try {
            const fd = fs.openSync(transcriptPath, 'r');
            let content = '';
            try {
              const buf = Buffer.alloc(4096);
              const bytesRead = fs.readSync(fd, buf, 0, 4096, 0);
              content = buf.subarray(0, bytesRead).toString('utf8');
            } finally {
              fs.closeSync(fd);
            }
            const lines = content.split('\n', 15);
            for (const l of lines) {
              if (!l.trim()) continue;
              try {
                const parsed = JSON.parse(l);
                if (parsed.type === 'USER_INPUT' && parsed.content) {
                  const clean = parsed.content.replace(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/, '$1').trim();
                  const firstLine = clean.split('\n')[0].trim();
                  if (firstLine) {
                    title = firstLine.length > 32 ? firstLine.substring(0, 32) + '...' : firstLine;
                    break;
                  }
                }
              } catch {}
            }
          } catch {}
          convMap.set(d.name, {
            id: d.name,
            title,
            timestamp: stat.mtimeMs,
          });
        }
      }
      return Array.from(convMap.values())
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 20);
    } catch {
      return [];
    }
  }

  public searchConversations(query: string, workspaceDir?: string): { id: string; title: string; timestamp: number }[] {
    const list = this.getRecentConversations(workspaceDir);
    if (!query || !query.trim()) return list;
    const q = query.trim().toLowerCase();
    return list.filter(c => c.title.toLowerCase().includes(q) || c.id.toLowerCase().includes(q));
  }

  public switchConversation(convId: string): boolean {
    for (const brainDir of this.getAntigravityBrainDirs()) {
      const fullPath = path.join(brainDir, convId, '.system_generated', 'logs', 'transcript_full.jsonl');
      const compactPath = path.join(brainDir, convId, '.system_generated', 'logs', 'transcript.jsonl');
      const transcriptPath = fs.existsSync(fullPath) ? fullPath : compactPath;
      if (fs.existsSync(transcriptPath)) {
        this.setTranscriptPath(transcriptPath);
        return true;
      }
    }
    return false;
  }

  public isTurnActive(): boolean {
    if (!this.activeTranscriptPath || !fs.existsSync(this.activeTranscriptPath)) return false;
    try {
      const stat = fs.statSync(this.activeTranscriptPath);
      return Date.now() - stat.mtimeMs < 2500;
    } catch {
      return false;
    }
  }

  public saveUploadedImages(
    images?: { base64: string; name: string }[] | { base64?: string; name?: string }
  ): string[] {
    const convId = this.getActiveConversationId() || 'global_uploads';
    const userUploadedDir = path.join(this.getConversationDir(convId), '.user_uploaded');

    const savedPaths: string[] = [];
    try {
      let imageList: { base64: string; name: string }[] = [];
      if (Array.isArray(images)) {
        imageList = images;
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
          fs.writeFileSync(targetPath, Buffer.from(img.base64, 'base64'));
          savedPaths.push(targetPath);
        }
      }
    } catch (err: any) {
      console.error('[IdeWatcher] Failed to save uploaded images:', err.message);
    }
    return savedPaths;
  }

  public saveUploadedAudio(audio?: AudioAttachment): string | null {
    if (!audio || !audio.base64) return null;
    const convId = this.getActiveConversationId() || 'global_uploads';
    const userUploadedDir = path.join(this.getConversationDir(convId), '.user_uploaded');

    try {
      if (!fs.existsSync(userUploadedDir)) {
        fs.mkdirSync(userUploadedDir, { recursive: true });
      }

      let ext = 'webm';
      if (audio.mimeType) {
        if (audio.mimeType.includes('mp4') || audio.mimeType.includes('m4a') || audio.mimeType.includes('aac')) {
          ext = 'm4a';
        } else if (audio.mimeType.includes('wav')) {
          ext = 'wav';
        } else if (audio.mimeType.includes('ogg')) {
          ext = 'ogg';
        }
      }

      const safeName = (audio.name || `voice_note.${ext}`).replace(/[^a-zA-Z0-9._-]/g, '_');
      const filename = `voice_${Date.now()}_${Math.floor(Math.random() * 1000)}_${safeName}`;
      const targetPath = path.join(userUploadedDir, filename);
      fs.writeFileSync(targetPath, Buffer.from(audio.base64, 'base64'));
      return targetPath;
    } catch (err: any) {
      console.error('[IdeWatcher] Failed to save uploaded audio:', err.message);
      return null;
    }
  }

  public injectMessageToIde(
    content: string,
    images?: { base64: string; name: string }[] | { base64?: string; name?: string },
    imageName?: string,
    targetConvId?: string
  ): { success: boolean; imageSavedPaths: string[] } {
    const convId = targetConvId || this.getActiveConversationId();
    if (!convId) return { success: false, imageSavedPaths: [] };

    const convDir = this.getConversationDir(convId);
    const messagesDir = path.join(
      convDir,
      '.system_generated',
      'messages'
    );
    const undeliveredDir = path.join(messagesDir, 'undelivered');
    const userUploadedDir = path.join(
      convDir,
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
      let fullContent = `[Message from Phone]: ${content}`;
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
        `[IdeWatcher] Mobile prompt dispatched to active session: "${content}" ${
          savedPaths.length > 0 ? `[with media: ${savedPaths.join(', ')}]` : ''
        }`
      );
      return { success: true, imageSavedPaths: savedPaths };
    } catch (err: any) {
      console.error(`[IdeWatcher] Failed to inject message into IDE:`, err.message);
      return { success: false, imageSavedPaths: [] };
    }
  }

  public getAgentQuotas(): AgentQuota[] {
    const now = Date.now();
    let detectedModel = this.activeModelOverride || getActiveIdeModel() || this.detectedModel;

    // Scan tail of transcript for latest active model selection
    if (this.activeTranscriptPath && fs.existsSync(this.activeTranscriptPath)) {
      try {
        const stats = fs.statSync(this.activeTranscriptPath);
        const readLen = Math.min(stats.size, 50000);
        const buf = Buffer.alloc(readLen);
        const fd = fs.openSync(this.activeTranscriptPath, 'r');
        fs.readSync(fd, buf, 0, readLen, Math.max(0, stats.size - readLen));
        fs.closeSync(fd);
        const sample = buf.toString('utf8');
        const matches = [...sample.matchAll(/Model Selection`?\s+from\s+.*?\s+to\s+([A-Za-z0-9\s\.\(\)\-]+?)\./gi)];
        if (matches.length > 0) {
          detectedModel = matches[matches.length - 1][1].trim();
          this.detectedModel = detectedModel;
        }
      } catch {}
    }

    if (now - this.lastLiveQuotaFetch > 6000) {
      this.lastLiveQuotaFetch = now;
      getLiveAgentQuotas()
        .then(quotas => {
          if (quotas && quotas.length > 0) {
            this.cachedLiveQuotas = quotas;
          }
        })
        .catch(() => {});
    }

    if (this.cachedLiveQuotas.length > 0) {
      return this.cachedLiveQuotas.map(q => ({
        ...q,
        isActive:
          q.name.toLowerCase().includes(detectedModel.toLowerCase()) ||
          detectedModel.toLowerCase().includes(q.name.toLowerCase()),
      }));
    }

    const userTurns = this.messageHistory.filter(m => m.role === 'user').length;

    // Rolling window reset calculations
    // 1-hour window reset: top of the next hour
    const nextHour = new Date(now);
    nextHour.setMinutes(60, 0, 0);
    const flashReset = nextHour.getTime();

    // 5-hour rolling window reset
    const fiveHourWindowMs = 5 * 3600 * 1000;
    const proReset = now + (fiveHourWindowMs - (now % fiveHourWindowMs));
    const claudeReset = now + (fiveHourWindowMs - ((now + 1800000) % fiveHourWindowMs));

    // 3-hour rolling window reset
    const threeHourWindowMs = 3 * 3600 * 1000;
    const gptReset = now + (threeHourWindowMs - (now % threeHourWindowMs));

    const isFlashActive = detectedModel.toLowerCase().includes('flash');
    const isProActive = detectedModel.toLowerCase().includes('pro');
    const isClaudeActive = detectedModel.toLowerCase().includes('claude');
    const isGptActive =
      detectedModel.toLowerCase().includes('gpt') ||
      detectedModel.toLowerCase().includes('o3') ||
      detectedModel.toLowerCase().includes('codex');

    const flashUsed = Math.min(150, Math.max(14, userTurns * 2 + 10));
    const proUsed = Math.min(50, Math.max(8, Math.floor(userTurns * 0.7) + 12));
    const claudeUsed = 28;
    const gptUsed = 18;

    return [
      {
        id: 'gemini-3.8-flash',
        name: 'Gemini 3.8 Flash',
        provider: 'Google',
        badge: 'Default Agent',
        isActive: isFlashActive || (!isProActive && !isClaudeActive && !isGptActive),
        usedPercent: Math.round((flashUsed / 150) * 100),
        usedUnits: flashUsed,
        totalUnits: 150,
        unitLabel: 'reqs',
        resetTimestamp: flashReset,
        resetWindowText: '1h rolling window',
        status: flashUsed / 150 > 0.8 ? 'exhausted' : flashUsed / 150 > 0.5 ? 'moderate' : 'optimal',
      },
      {
        id: 'claude-sonnet-4.6',
        name: 'Claude Sonnet 4.6 (Thinking)',
        provider: 'Anthropic',
        badge: 'Deep Reasoning',
        isActive: isClaudeActive,
        usedPercent: Math.round((claudeUsed / 45) * 100),
        usedUnits: claudeUsed,
        totalUnits: 45,
        unitLabel: 'reqs',
        resetTimestamp: claudeReset,
        resetWindowText: '5h rolling window',
        status: claudeUsed / 45 > 0.8 ? 'exhausted' : claudeUsed / 45 > 0.5 ? 'moderate' : 'optimal',
      },
      {
        id: 'claude-opus-4.6',
        name: 'Claude Opus 4.6 (Thinking)',
        provider: 'Anthropic',
        badge: 'High Craft',
        isActive: isProActive,
        usedPercent: Math.round((proUsed / 30) * 100),
        usedUnits: proUsed,
        totalUnits: 30,
        unitLabel: 'reqs',
        resetTimestamp: proReset,
        resetWindowText: '5h rolling window',
        status: proUsed / 30 > 0.8 ? 'exhausted' : proUsed / 30 > 0.5 ? 'moderate' : 'optimal',
      },
      {
        id: 'gpt-oss-120b',
        name: 'GPT-OSS 120B (Medium)',
        provider: 'OpenAI',
        badge: 'Universal',
        isActive: isGptActive,
        usedPercent: Math.round((gptUsed / 80) * 100),
        usedUnits: gptUsed,
        totalUnits: 80,
        unitLabel: 'reqs',
        resetTimestamp: gptReset,
        resetWindowText: '3h rolling window',
        status: gptUsed / 80 > 0.8 ? 'exhausted' : gptUsed / 80 > 0.5 ? 'moderate' : 'optimal',
      },
    ];
  }

  public getConversationDir(convId?: string): string {
    if (convId) {
      for (const b of this.getAntigravityBrainDirs()) {
        const p = path.join(b, convId);
        if (fs.existsSync(p)) return p;
      }
      return path.join(this.getAntigravityBrainDir(), convId);
    }
    if (!this.activeTranscriptPath) {
      this.autoDiscoverActiveConversation();
    }
    if (this.activeTranscriptPath) {
      return path.resolve(path.dirname(this.activeTranscriptPath), '..', '..');
    }
    return this.getAntigravityBrainDir();
  }

  public getSessionArtifacts(): Array<{ name: string; relPath: string; size: number; mtime: number; type: 'markdown' | 'image' | 'code' | 'other' }> {
    const convDir = this.getConversationDir();
    if (!convDir || !fs.existsSync(convDir)) return [];

    const artifacts: Array<{ name: string; relPath: string; size: number; mtime: number; type: 'markdown' | 'image' | 'code' | 'other' }> = [];
    const ignoredNames = new Set(['.system_generated', '.tempmediaStorage', '.user_uploaded', 'browser']);

    const scanDir = (dir: string, prefix: string = '') => {
      try {
        const dirents = fs.readdirSync(dir, { withFileTypes: true });
        for (const d of dirents) {
          if (ignoredNames.has(d.name) || d.name.endsWith('.metadata.json')) continue;
          const fullPath = path.join(dir, d.name);
          const relPath = prefix ? `${prefix}/${d.name}` : d.name;

          if (d.isDirectory()) {
            if (prefix === '' && d.name === 'scratch') {
              scanDir(fullPath, d.name);
            }
          } else {
            try {
              const stat = fs.statSync(fullPath);
              const ext = path.extname(d.name).toLowerCase();
              let type: 'markdown' | 'image' | 'code' | 'other' = 'other';
              if (ext === '.md' || ext === '.markdown') type = 'markdown';
              else if (['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif'].includes(ext)) type = 'image';
              else if (['.ts', '.tsx', '.js', '.jsx', '.json', '.html', '.css', '.py', '.sh'].includes(ext)) type = 'code';

              artifacts.push({
                name: d.name,
                relPath,
                size: stat.size,
                mtime: stat.mtimeMs,
                type,
              });
            } catch {}
          }
        }
      } catch {}
    };

    scanDir(convDir);
    return artifacts.sort((a, b) => b.mtime - a.mtime);
  }

  public getArtifactContent(relPath: string): { name: string; size: number; isText: boolean; content?: string; base64?: string; mimeType: string } | null {
    const convDir = this.getConversationDir();
    if (!convDir || !fs.existsSync(convDir)) return null;

    const safeRel = relPath.replace(/^(\/|\\)+/, '');
    const targetPath = path.resolve(convDir, safeRel);
    if (!targetPath.startsWith(convDir) || !fs.existsSync(targetPath) || fs.statSync(targetPath).isDirectory()) {
      return null;
    }

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
      return {
        name: path.basename(targetPath),
        size: stat.size,
        isText: false,
        base64: data.toString('base64'),
        mimeType,
      };
    }

    if (stat.size > 500 * 1024) {
      const buf = Buffer.alloc(50 * 1024);
      const fd = fs.openSync(targetPath, 'r');
      fs.readSync(fd, buf, 0, 50 * 1024, 0);
      fs.closeSync(fd);
      return {
        name: path.basename(targetPath),
        size: stat.size,
        isText: true,
        content: buf.toString('utf8') + '\n\n... (truncated: file exceeds 500KB)',
        mimeType,
      };
    }

    const content = fs.readFileSync(targetPath, 'utf8');
    return {
      name: path.basename(targetPath),
      size: stat.size,
      isText: true,
      content,
      mimeType,
    };
  }
}
