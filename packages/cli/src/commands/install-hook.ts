import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function getCanonicalInterceptorCode(): string {
  const candidatePaths = [
    path.resolve(__dirname, '../../assets/interceptor.js'),
    path.resolve(__dirname, '../../../packages/cli/assets/interceptor.js'),
    path.resolve(process.cwd(), 'packages/cli/assets/interceptor.js'),
    path.resolve(process.cwd(), 'assets/interceptor.js'),
    path.resolve(__dirname, '../../media/interceptor.js'),
  ];
  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      return fs.readFileSync(p, 'utf8');
    }
  }
  throw new Error('Canonical interceptor.js asset could not be located on disk.');
}


const HOOKS_JSON_CONTENT = JSON.stringify(
  {
    "companion-interceptor": {
      PreToolUse: [
        {
          matcher: "run_command|write_to_file|replace_file_content|multi_replace_file_content|ask_question",
          hooks: [
            {
              type: "command",
              command: "node ./interceptor.js",
              timeout: 130
            }
          ]
        }
      ]
    }
  },
  null,
  2
);

export function installGlobalHook(): void {
  const globalConfigDir = path.join(os.homedir(), '.gemini', 'config');
  if (!fs.existsSync(globalConfigDir)) {
    fs.mkdirSync(globalConfigDir, { recursive: true });
  }

  const globalInterceptorPath = path.join(globalConfigDir, 'interceptor.js');
  const globalHooksJsonPath = path.join(globalConfigDir, 'hooks.json');
  const globalModePath = path.resolve(os.homedir(), '.agy-companion-mode');

  // Write interceptor script
  fs.writeFileSync(globalInterceptorPath, getCanonicalInterceptorCode(), 'utf8');

  // Command must use forward slashes and quotes to protect against spaces in paths on Windows
  const cleanScriptPath = globalInterceptorPath.replace(/\\/g, '/');
  const globalHooksContent = JSON.stringify(
    {
      "companion-interceptor": {
        PreToolUse: [
          {
            matcher: "run_command|write_to_file|replace_file_content|multi_replace_file_content|ask_question",
            hooks: [
              {
                type: "command",
                command: `node "${cleanScriptPath}"`,
                timeout: 130
              }
            ]
          }
        ]
      }
    },
    null,
    2
  );

  fs.writeFileSync(globalHooksJsonPath, globalHooksContent, 'utf8');

  // Lock user preferences in state.vscdb and User settings.json
  lockUserPreferencesToAlwaysProceed();

  // Ensure global ~/.agy-companion-mode exists (default to desk if not set)
  if (!fs.existsSync(globalModePath)) {
    fs.writeFileSync(globalModePath, 'desk', 'utf8');
  }

  console.log('\n===========================================================');
  console.log('   🌐 Antigravity Companion Global Hook Installed!');
  console.log('===========================================================');
  console.log(`📁 Global Config dir:   ${globalConfigDir}`);
  console.log(`⚙️  Global Hooks JSON:   ${globalHooksJsonPath}`);
  console.log(`⚡ Global Interceptor:  ${globalInterceptorPath}`);
  console.log(`🌐 Global Mode file:    ${globalModePath}`);
  console.log('-----------------------------------------------------------');
  console.log('✨ Any Antigravity task in ANY workspace or fresh folder will now');
  console.log('   automatically route approvals to your companion phone in Remote mode,');
  console.log('   even across new projects and account switches!\n');
}

export function installHook(targetDirArg?: string, isGlobal?: boolean): void {
  if (isGlobal || targetDirArg === '--global' || targetDirArg === '-g' || targetDirArg === 'global') {
    return installGlobalHook();
  }

  const targetDir = path.resolve(process.cwd(), targetDirArg || '.');
  const agentsDir = path.join(targetDir, '.agents');
  const interceptorPath = path.join(agentsDir, 'interceptor.js');
  const hooksJsonPath = path.join(agentsDir, 'hooks.json');
  const globalModePath = path.resolve(os.homedir(), '.agy-companion-mode');

  if (!fs.existsSync(agentsDir)) {
    fs.mkdirSync(agentsDir, { recursive: true });
  }

  // Write interceptor script
  fs.writeFileSync(interceptorPath, getCanonicalInterceptorCode(), 'utf8');

  // Write hooks.json
  fs.writeFileSync(hooksJsonPath, HOOKS_JSON_CONTENT, 'utf8');

  // Ensure workspace .vscode/settings.json locks tool execution to always-proceed
  const vscodeDir = path.join(targetDir, '.vscode');
  const settingsJsonPath = path.join(vscodeDir, 'settings.json');
  try {
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
  } catch {}

  // Lock user preferences in state.vscdb and User settings.json
  lockUserPreferencesToAlwaysProceed();

  // Ensure global ~/.agy-companion-mode exists (default to desk if not set)
  if (!fs.existsSync(globalModePath)) {
    fs.writeFileSync(globalModePath, 'desk', 'utf8');
  }

  console.log('\n===========================================================');
  console.log('   🚀 Antigravity Companion Hook Installed Successfully!');
  console.log('===========================================================');
  console.log(`📁 Target directory:   ${targetDir}`);
  console.log(`⚙️  Hook config:       .agents/hooks.json`);
  console.log(`⚡ Interceptor:       .agents/interceptor.js`);
  console.log(`🌐 Global Mode file:   ${globalModePath}`);
  console.log('-----------------------------------------------------------');
  console.log('✨ Any Antigravity task in this directory will now automatically');
  console.log('   route command approvals to your companion phone in Remote mode,');
  console.log('   or to your desktop screen in Desk mode.\n');
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
