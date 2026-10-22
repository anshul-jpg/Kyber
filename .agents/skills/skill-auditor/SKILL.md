---
name: skill-auditor
description: Audit agent skills for quality, compliance, delegation patterns, and maintainability. Use after creating skills, before releases, or for periodic quality checks.
argument-hint: "[skill-name] [--force | --skip-validation | --plugin-only | --project-only | --global-only]"
---

# Skill Auditor

Audit Agent and Claude Code skills for quality, specification compliance, delegation patterns, and long-term maintainability.

## Purpose

Automated, high-fidelity audit framework for AI agent skills (`SKILL.md`). Ensures skills adhere to the Agent Skills specification, avoid token bloat, maintain crisp progressive disclosure, and follow clean delegation patterns without false positives.

## Audit Types

### Type A: Standard Functional Skill Audit
For operational and task-specific skills (e.g., `git-setup`, `markdown-linting`, `build-ui`):
- **Frontmatter Compliance:** Valid YAML with mandatory `name` and descriptive `description` fields.
- **Trigger Quality:** Distinct trigger phrases that prevent collision and false triggering.
- **Progressive Disclosure:** Lean instructions (<5,000 tokens active footprint), referencing auxiliary scripts or references rather than dumping large text blocks.
- **Safety & Error Handling:** Explicit bounds, non-destructive defaults, input validation.

### Type B: Meta-Skill Audit
For Claude Code / Antigravity meta-skills (e.g., `skill-development`, `plugin-quality`, `docs-management`):
- **Zero Duplication:** No duplicate logic across child skills or instructions.
- **Delegation Compliance:** Clear delegation boundaries to subagents or child skills; avoids monolithic sprawl.
- **Metadata Purity:** Metadata-only orchestration and lifecycle control.

The auditor auto-detects skill type based on the skill's name and intent.

---

## Command Flags & Arguments

| Argument | Description |
|---|---|
| *(none)* | **Smart mode:** Audits modified, never-audited, or stale (>90 days) skills |
| `--force` | Audit **all** discovered skills regardless of cache or timestamp |
| `--skip-validation` | Skip finding validation pass (faster, but may report false positives) |
| `--project-only` | Only audit workspace skills (`.agents/skills/`, `.claude/skills/`) |
| `--global-only` | Only audit global skills (`~/.gemini/config/skills/`, `~/.claude/plugins/`) |
| `<skill-name>` | Target audit to a specific skill by directory or name |

---

## Execution Workflow

### Step 1: Discover Skill Sources
Scan all local and global skill customization roots:
1. **Workspace Roots:**
   - `.agents/skills/` (Antigravity workspace skills)
   - `.claude/skills/` (Claude project skills)
   - `plugins/*/skills/` (Monorepo/marketplace plugin skills)
2. **Global Roots:**
   - `%USERPROFILE%\.gemini\config\skills\` (Antigravity global skills)
   - `%USERPROFILE%\.claude\plugins\` or `~/.claude/skills/` (Global Claude skills)
3. Deduplicate overlapping global/workspace skill packages.

### Step 2: Parse Arguments & Audit Queue
1. Determine active mode (smart vs force vs targeted).
2. Check `.agents/audit/skills.md` (or `.claude/audit/skills.md`) for historical audit records.
3. Queue skills meeting the audit criteria.

### Step 3: Execute Audits
For each queued skill:
1. Identify **Type A** (functional) vs **Type B** (meta-skill).
2. Evaluate across the 4 core dimensions:
   - **Identity & Discoverability (Weight: 3x):** Frontmatter validity, concise naming, description clarity.
   - **Prompt Reliability (Weight: 2x):** Output predictability, unambiguous instructions, strict boundaries.
   - **Structure & Efficiency (Weight: 2x):** Token conservation, progressive disclosure, clean modular layout.
   - **Robustness (Weight: 1x):** Edge case handling, platform resilience, non-destructive defaults.

### Step 4: Validate Findings (Eliminate False Positives)
Unless `--skip-validation` is passed:
1. Cross-reference flagged issues against actual usage patterns in the workspace.
2. Filter out false positives (e.g., intentional brevity, project-specific shorthands).
3. Record filtered findings into an audit ledger.

### Step 5: Final Summary & Logging
Emit audit results in the standard summary format and record to `.agents/audit/skills.md`:

```markdown
## Skill Audit Summary
| Source | Skill Name | Type | Result | Score | Notes |
|---|---|---|---|---|---|
| workspace | agy-companion | A | PASS | 98/100 | Clean trigger & concise structure |
| workspace | design-craft | A | PASS | 95/100 | Excellent anti-slop guidelines |
| global | frontend-design | A | PASS | 92/100 | High documentation fidelity |
```

---

## Scoring Rubric

- 🟢 **PASS (85–100):** Production-ready. Strict compliance with agent skill specs, minimal token footprint.
- 🟡 **PASS WITH WARNINGS (70–84):** Functional but has improvement opportunities (e.g., description could be more distinctive, missing reference modularization).
- 🔴 **FAIL (<70):** Requires remediation before deployment (invalid YAML, missing core instructions, prompt injection risk, or high duplicate bloat).
