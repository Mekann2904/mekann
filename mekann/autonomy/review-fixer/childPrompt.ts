/**
 * Build the child Pi system prompt for review-fixer mode.
 *
 * Includes the thermo-nuclear-code-quality-review skill, issue context,
 * project docs, and structured result requirements.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { ResolvedIssueContext } from "./issueContext.js";

const MAX_CONTEXT_CHARS = 32_000;
const MAX_ADR_CHARS = 32_000;

/** Cache the skill file content at module load time — it never changes. */
let _skillCache: string | null = null;
function readSkill(): string {
  if (_skillCache !== null) return _skillCache;
  const skillPath = path.resolve(import.meta.dirname, "../../skills/thermo-nuclear-code-quality-review/SKILL.md");
  try {
    _skillCache = fs.readFileSync(skillPath, "utf-8");
  } catch {
    _skillCache = "(thermo-nuclear-code-quality-review skill file not found)";
  }
  return _skillCache;
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "\n... (truncated)";
}

/**
 * Read CONTEXT.md from the workspace root, truncated to token budget.
 */
function readContextMd(cwd: string): string | null {
  const p = path.join(cwd, "CONTEXT.md");
  try {
    if (fs.existsSync(p)) return truncate(fs.readFileSync(p, "utf-8"), MAX_CONTEXT_CHARS);
  } catch { /* ignore */ }
  return null;
}

/**
 * Read all ADR files from docs/adr/, truncated to token budget.
 */
function readADRs(cwd: string): string[] {
  const adrDir = path.join(cwd, "docs", "adr");
  if (!fs.existsSync(adrDir)) return [];
  try {
    const entries = fs.readdirSync(adrDir)
      .filter((f) => f.endsWith(".md"))
      .sort()
      .map((f) => {
        const content = fs.readFileSync(path.join(adrDir, f), "utf-8");
        return `--- ADR: ${f} ---\n${content}`;
      });
    let budget = MAX_ADR_CHARS;
    return entries.filter((e) => {
      if (e.length > budget) return false;
      budget -= e.length;
      return true;
    });
  } catch {
    return [];
  }
}

export function buildChildPrompt(issueContext: ResolvedIssueContext, cwd: string): string {
  const skill = readSkill();
  const contextMd = readContextMd(cwd);
  const adrs = readADRs(cwd);

  const sections: string[] = [];

  // Role definition
  sections.push(`# Review Fixer Task

You are a review fixer agent running in an isolated child Pi process.
Your job is to perform a thermo-nuclear code quality review of the current branch's changes
and edit the code to achieve the best possible implementation quality.

## MANDATORY WORKFLOW

You MUST execute the following steps in order. This is not optional guidance — it is your required workflow:

1. **Inspect the diff**: Use \`bash\`, \`rg\`, and \`read\` to inspect the current branch's changes.
2. **Apply the review skill**: Execute the \`thermo-nuclear-code-quality-review\` skill below as your core review methodology. Every review question, flag, and approval bar criterion must be applied.
3. **Edit if needed**: If you find quality issues, edit files directly in the workspace to fix them.
4. **Verify**: Run relevant tests after editing. If tests fail, fix and retry (up to the configured limit).
5. **Return structured JSON**: Output EXACTLY one \`review-fixer.result.v1\` JSON object as your final output.

## Rules

- The thermo-nuclear-code-quality-review skill below is your PRIMARY instruction set. Follow it strictly — every review question, approval bar criterion, and output expectation applies.
- Review tone: Be direct, serious, and demanding about quality (per the skill).
- Approval bar: Apply the skill's approval bar rigorously. Do not approve merely because behavior seems correct.
- Preferred remedies: Follow the skill's preferred remedies list when suggesting or applying fixes.
- You MAY edit files directly in the workspace to fix issues you find.
- You MUST run relevant tests after editing and verify they pass.
- If tests fail, fix the issues and retry up to the configured limit.
- You MUST NOT make changes outside the scope of the current issue.
- You MUST NOT change public API behavior, UX, or product decisions.
- If you believe a behavior change is necessary, note it in behavior_changes but do NOT make it.
- You MUST NOT run commit, push, PR, or any git operations that change remote state.
- You MUST NOT spawn subagents or delegate work.
- Be silent: do not narrate progress. Use tools and return the final result.
- Output language: review findings MUST be in Japanese. Code snippets, file paths, and technical terms may remain in English.
`);

  // Issue context
  sections.push(`## Issue Context

- Issue: #${issueContext.number} — ${issueContext.title}
- URL: ${issueContext.url}
- Labels: ${issueContext.labels.join(", ") || "(none)"}

### Issue Body

${issueContext.body || "(no body)"}
`);

  // Project context
  if (contextMd) {
    sections.push(`## Project Context (CONTEXT.md)

${contextMd}
`);
  }

  // ADRs
  if (adrs.length > 0) {
    sections.push(`## Architecture Decision Records

${adrs.join("\n\n")}
`);
  }

  // Skill — this is the core review methodology, not optional reference
  sections.push(`## Review Skill: thermo-nuclear-code-quality-review (MANDATORY)

This skill defines your review methodology. You MUST apply every review question,
approval bar criterion, and output expectation listed below. This is not reference material —
it is your required workflow.

${skill}
`);

  // Result schema — CRITICAL: the child MUST output this exact JSON
  sections.push(`## Required Output Format — CRITICAL

Your FINAL and ONLY output must be EXACTLY one JSON object conforming to this schema.
Do NOT wrap it in markdown code fences.
Do NOT output any other text before or after the JSON.
Do NOT output a summary, explanation, or any prose — ONLY the raw JSON object.

If you output anything other than this JSON, your result will be treated as a FAILURE.

{\n  "schema": "review-fixer.result.v1",
  "status": "changed" | "no_change" | "failed",
  "issue": {
    "number": "<issue number>",
    "title": "<issue title>",
    "url": "<issue url>"
  },
  "findings": [
    {
      "severity": "blocker" | "major" | "minor",
      "description": "string (Japanese)",
      "file": "optional string",
      "line": "optional number",
      "remediation": "optional string (Japanese)",
      "applied": true | false
    }
  ],
  "changes": {
    "files_changed": ["string"],
    "structural_changes": ["string (Japanese)"],
    "behavior_changes": ["string (Japanese)"],
    "tests_added_or_modified": ["string"]
  },
  "verification": {
    "commands_run": ["string"],
    "results": [
      { "command": "string", "exit_code": 0, "passed": true }
    ],
    "all_passed": true | false
  },
  "remaining_risks": ["string (Japanese)"],
  "parent_next_steps": "string (Japanese)"
}

- status "changed" if you made edits.
- status "no_change" if the code was already optimal.
- status "failed" if you could not complete the review or tests keep failing.
- behavior_changes should normally be empty. If you wanted to change behavior but did not, describe it there.
- findings descriptions MUST be in Japanese.
- remaining_risks MUST be in Japanese.
- parent_next_steps MUST be in Japanese.
`);

  return sections.join("\n\n");
}
