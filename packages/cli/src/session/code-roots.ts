import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFileSync } from 'child_process';
import { RecentProject, WorkspaceState } from '@agy-companion/protocol';
import { installHook } from '../commands/install-hook.js';

export class CodeRootsManager {
  private configPath: string;
  private roots: Set<string> = new Set();

  constructor(initialDefaultDir?: string, customConfigPath?: string) {
    this.configPath = customConfigPath || path.join(os.homedir(), '.agy-companion-roots.json');
    this.load(initialDefaultDir);
  }

  private load(fallbackDir?: string): void {
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          for (const r of parsed) {
            if (typeof r === 'string' && fs.existsSync(r)) {
              const norm = path.resolve(r);
              const lower = norm.toLowerCase();
              if (lower.includes('appdata\\local\\temp') || lower.includes('/temp/') || lower.endsWith('/temp')) continue;
              this.roots.add(norm);
            }
          }
        }
      }
    } catch {}

    // If no roots saved yet, seed with fallbackDir or parent of cwd
    if (this.roots.size === 0) {
      if (fallbackDir && fs.existsSync(fallbackDir)) {
        this.roots.add(path.resolve(fallbackDir));
      } else {
        const candidate = process.cwd();
        const parent = path.dirname(path.resolve(candidate));
        if (fs.existsSync(parent) && parent !== path.parse(parent).root) {
          this.roots.add(parent);
        } else if (fs.existsSync(candidate)) {
          this.roots.add(path.resolve(candidate));
        }
      }
      this.save();
    }
  }

  private save(): void {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(Array.from(this.roots), null, 2), 'utf8');
    } catch {}
  }

  public getRoots(): string[] {
    return Array.from(this.roots).filter(r => fs.existsSync(r));
  }

  public addRoot(dirPath: string): { ok: boolean; roots: string[]; message?: string } {
    try {
      const resolved = path.resolve(dirPath);
      if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
        return { ok: false, roots: this.getRoots(), message: 'Directory does not exist' };
      }
      this.roots.add(resolved);
      this.save();
      return { ok: true, roots: this.getRoots() };
    } catch (err: any) {
      return { ok: false, roots: this.getRoots(), message: err.message };
    }
  }

  public removeRoot(dirPath: string): { ok: boolean; roots: string[] } {
    const resolved = path.resolve(dirPath);
    this.roots.delete(resolved);
    this.save();
    return { ok: true, roots: this.getRoots() };
  }

  /**
   * Security containment check: ensures targetPath is strictly inside at least one registered root.
   * Prevents Windows cross-drive path traversal via !path.isAbsolute(rel).
   */
  public isPathAllowed(targetPath: string): boolean {
    const resolvedTarget = path.resolve(targetPath);
    for (const r of this.getRoots()) {
      const rel = path.relative(r, resolvedTarget);
      if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Scans all registered roots for project directories (subfolders with .git, package.json, etc.)
   */
  public scanAllProjects(currentWorkspaces: WorkspaceState[] = []): RecentProject[] {
    const openPaths = new Set(
      currentWorkspaces.map(w => path.resolve(w.path).toLowerCase())
    );
    const seenPaths = new Set<string>();
    const projects: RecentProject[] = [];

    for (const root of this.getRoots()) {
      try {
        const entries = fs.readdirSync(root, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === '$RECYCLE.BIN') continue;

          const fullPath = path.resolve(root, entry.name);
          const fullPathLower = fullPath.toLowerCase();
          if (seenPaths.has(fullPathLower)) continue;
          seenPaths.add(fullPathLower);

          try {
            const stat = fs.statSync(fullPath);
            const isOpen = openPaths.has(fullPathLower);
            const hasHook = fs.existsSync(path.join(fullPath, '.agents', 'hooks.json'));

            projects.push({
              name: entry.name,
              path: fullPath,
              isOpen,
              hasHook,
              lastModified: stat.mtimeMs,
            });
          } catch {}
        }
      } catch {}
    }

    projects.sort((a, b) => {
      if (a.isOpen && !b.isOpen) return -1;
      if (!a.isOpen && b.isOpen) return 1;
      return (b.lastModified || 0) - (a.lastModified || 0);
    });

    return projects;
  }

  /**
   * Creates a new project folder within an authorized root directory and installs companion hook.
   */
  public createProject(rootPath: string, projectName: string): { ok: boolean; path?: string; projectPath?: string; message: string } {
    const cleanName = projectName.trim().replace(/[\\/:*?"<>|]/g, '-');
    if (!cleanName) {
      return { ok: false, message: 'Invalid project name' };
    }

    const resolvedRoot = path.resolve(rootPath);
    if (!this.roots.has(resolvedRoot) && !this.isPathAllowed(resolvedRoot)) {
      return { ok: false, message: 'Selected root directory is not in registered roots' };
    }

    const targetDir = path.join(resolvedRoot, cleanName);
    if (fs.existsSync(targetDir)) {
      return { ok: false, message: 'Directory already exists' };
    }

    try {
      fs.mkdirSync(targetDir, { recursive: true });
      // Initialize basic git repository safely
      try {
        execFileSync('git', ['init', '-b', 'master'], { cwd: targetDir, stdio: 'ignore', windowsHide: true });
      } catch {
        try {
          execFileSync('git', ['init'], { cwd: targetDir, stdio: 'ignore', windowsHide: true });
        } catch {}
      }

      // Auto provision companion hook so it is ready immediately
      try {
        installHook(targetDir);
      } catch {}

      return { ok: true, path: targetDir, projectPath: targetDir, message: `Created project ${cleanName}` };
    } catch (err: any) {
      return { ok: false, message: err.message };
    }
  }
}
