import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import readline from 'readline';

export interface TurnInitEvent {
  conversationId: string;
  cwd: string;
  tools: string[];
}

export interface TurnStepEvent {
  conversationId: string;
  stepIndex: number;
  state: 'ACTIVE' | 'DONE';
  stepType: string;
  textDelta?: string;
}

export interface TurnResultEvent {
  conversationId: string;
  status: 'SUCCESS' | 'ERROR';
  response: string;
  durationSeconds?: number;
  error?: string;
}

export class AgyEngine extends EventEmitter {
  private activeProcesses: Map<string, ChildProcess> = new Map();

  constructor() {
    super();
  }

  public runTurn(workspacePath: string, prompt: string, conversationId?: string): EventEmitter {
    const turnEmitter = new EventEmitter();

    const args: string[] = [];
    if (conversationId) {
      args.push('--conversation', conversationId);
    }
    // Escape double quotes and wrap in quotes for Windows cmd.exe
    const escapedPrompt = `"${prompt.replace(/"/g, '\\"')}"`;
    args.push('-p', escapedPrompt, '--output-format', 'stream-json');

    console.log(`[AgyEngine] Spawning in ${workspacePath}: agy ${args.join(' ')}`);

    const proc = spawn('agy', args, {
      cwd: workspacePath,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    });

    const procKey = `${workspacePath}:${Date.now()}`;
    this.activeProcesses.set(procKey, proc);

    const rl = readline.createInterface({
      input: proc.stdout,
      terminal: false,
    });

    rl.on('line', (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      try {
        const payload = JSON.parse(trimmed);
        if (payload.event === 'init') {
          const initData: TurnInitEvent = {
            conversationId: payload.conversation_id,
            cwd: payload.init?.cwd || workspacePath,
            tools: payload.init?.tools || [],
          };
          turnEmitter.emit('init', initData);
          this.emit('init', initData);
        } else if (payload.event === 'step_update') {
          const step = payload.step_update;
          const stepData: TurnStepEvent = {
            conversationId: step.conversation_id,
            stepIndex: step.step_index,
            state: step.state,
            stepType: step.step_type,
            textDelta: step.text_delta,
          };
          turnEmitter.emit('step', stepData);
          this.emit('step', stepData);
        } else if (payload.event === 'result') {
          const res = payload.result;
          const resData: TurnResultEvent = {
            conversationId: res.conversation_id,
            status: res.status,
            response: res.response,
            durationSeconds: res.duration_seconds,
            error: res.error,
          };
          turnEmitter.emit('result', resData);
          this.emit('result', resData);
        }
      } catch (e) {
        // Non-JSON line from CLI (e.g. log output)
        console.log(`[AgyEngine stdout] ${trimmed}`);
      }
    });

    proc.stderr.on('data', data => {
      const errStr = data.toString().trim();
      if (errStr) {
        console.warn(`[AgyEngine stderr] ${errStr}`);
      }
    });

    proc.on('close', code => {
      this.activeProcesses.delete(procKey);
      turnEmitter.emit('close', code);
    });

    proc.on('error', err => {
      this.activeProcesses.delete(procKey);
      turnEmitter.emit('error', err);
      this.emit('error', err);
    });

    return turnEmitter;
  }

  public abortWorkspace(workspacePath: string): void {
    for (const [key, proc] of this.activeProcesses.entries()) {
      if (key.startsWith(workspacePath)) {
        try {
          proc.kill();
        } catch {}
        this.activeProcesses.delete(key);
      }
    }
  }
}
