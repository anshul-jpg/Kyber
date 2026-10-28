/**
 * Git Service - read + write git operations for the mobile companion.
 *
 * Wraps the `git` CLI (must be on PATH). All commands run with an explicit cwd and
 * a 15s timeout. No network/push operations are exposed (per project policy).
 */

import { execFile } from 'child_process';
import { promisify } from 'util';

const exec = promisify(execFile);

const OPTS = (cwd: string) => ({ cwd, timeout: 15000, windowsHide: true, maxBuffer: 10 * 1024 * 1024 });

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await exec('git', args, OPTS(cwd));
  return stdout;
}

export interface GitFileStatus {
  path: string;
  orig?: string;
  x: string;
  y: string;
  type: 'modified' | 'renamed' | 'conflict' | 'untracked';
}

export interface GitRepoStatus {
  isRepo: boolean;
  root: string | null;
  branch: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  remoteUrl: string | null;
  files: GitFileStatus[];
}

/** True if `dir` is inside a git work tree. */
export async function isRepo(dir: string): Promise<boolean> {
  try {
    const out = await git(dir, ['rev-parse', '--is-inside-work-tree']);
    return out.trim() === 'true';
  } catch {
    return false;
  }
}

/**
 * Working-tree status via porcelain v2 (stable, machine-readable).
 * Returns branch info + a flat file list with staged (x) / worktree (y) codes.
 */
export async function getGitStatus(dir: string): Promise<GitRepoStatus> {
  if (!(await isRepo(dir))) {
    return { isRepo: false, root: null, branch: null, upstream: null, ahead: 0, behind: 0, remoteUrl: null, files: [] };
  }

  let root = dir;
  try {
    root = (await git(dir, ['rev-parse', '--show-toplevel'])).trim() || dir;
  } catch {}

  let remoteUrl: string | null = null;
  try {
    remoteUrl = (await git(dir, ['remote', 'get-url', 'origin'])).trim();
  } catch {}

  const out = await git(dir, ['status', '--porcelain=v2', '--branch', '-z']);
  const entries = out.split('\0');

  let branch: string | null = null;
  let ahead = 0;
  let behind = 0;
  let upstream: string | null = null;
  const files: GitFileStatus[] = [];

  for (let i = 0; i < entries.length; i++) {
    const line = entries[i];
    if (!line) continue;
    if (line.startsWith('# branch.head ')) {
      branch = line.slice('# branch.head '.length).trim();
    } else if (line.startsWith('# branch.upstream ')) {
      upstream = line.slice('# branch.upstream '.length).trim();
    } else if (line.startsWith('# branch.ab ')) {
      const m = line.match(/\+(\d+)\s+-(\d+)/);
      if (m) {
        ahead = parseInt(m[1], 10);
        behind = parseInt(m[2], 10);
      }
    } else if (line.startsWith('1 ')) {
      // 1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>
      const parts = line.split(' ');
      const xy = parts[1];
      const path = parts.slice(8).join(' ');
      files.push({ path, x: xy[0], y: xy[1], type: 'modified' });
    } else if (line.startsWith('2 ')) {
      // renamed/copied: path then origPath is the NEXT NUL-separated token
      const parts = line.split(' ');
      const xy = parts[1];
      const path = parts.slice(9).join(' ');
      const orig = entries[++i] || '';
      files.push({ path, orig, x: xy[0], y: xy[1], type: 'renamed' });
    } else if (line.startsWith('u ')) {
      const parts = line.split(' ');
      const path = parts.slice(10).join(' ');
      files.push({ path, x: 'U', y: 'U', type: 'conflict' });
    } else if (line.startsWith('? ')) {
      files.push({ path: line.slice(2), x: '?', y: '?', type: 'untracked' });
    }
  }

  return { isRepo: true, root, branch, upstream, ahead, behind, remoteUrl, files };
}

/** Unified diff for one file. `staged` selects the index diff. */
export async function getGitDiff(dir: string, file: string, staged?: boolean): Promise<{ file: string; staged: boolean; diff: string; error?: string }> {
  const args = ['diff', '--no-color'];
  if (staged) args.push('--cached');
  args.push('--', file);
  try {
    const out = await git(dir, args);
    return { file, staged: !!staged, diff: out };
  } catch (e: any) {
    return { file, staged: !!staged, diff: '', error: e.message };
  }
}

export async function getGitBranches(dir: string): Promise<{ current: string | null; branches: string[] }> {
  const out = await git(dir, ['branch', '--list', '--format=%(refname:short)%(if)%(HEAD)%(then)\t*%(end)']);
  const all: string[] = [];
  let current: string | null = null;
  for (const raw of out.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const isCurrent = line.endsWith('\t*');
    const name = isCurrent ? line.slice(0, -2) : line;
    all.push(name);
    if (isCurrent) current = name;
  }
  return { current, branches: all };
}

export async function stageGitFile(dir: string, file: string): Promise<{ success: boolean }> {
  await git(dir, ['add', '--', file]);
  return { success: true };
}

export async function unstageGitFile(dir: string, file: string): Promise<{ success: boolean }> {
  await git(dir, ['reset', '-q', 'HEAD', '--', file]);
  return { success: true };
}

/** Discard working-tree changes for a tracked file, or delete an untracked one. */
export async function discardGitFile(dir: string, file: string, untracked?: boolean): Promise<{ success: boolean }> {
  if (untracked) {
    await git(dir, ['clean', '-f', '--', file]);
  } else {
    await git(dir, ['checkout', '--', file]);
  }
  return { success: true };
}

export async function commitGitChanges(dir: string, message: string): Promise<{ success: boolean; output: string }> {
  if (!message || !message.trim()) throw new Error('Commit message required');
  const out = await git(dir, ['commit', '-m', message]);
  return { success: true, output: out.trim() };
}

export async function checkoutGitBranch(dir: string, branch: string, create?: boolean): Promise<{ success: boolean; output: string }> {
  const args = create ? ['checkout', '-b', branch] : ['checkout', branch];
  const out = await git(dir, args);
  return { success: true, output: out.trim() };
}
