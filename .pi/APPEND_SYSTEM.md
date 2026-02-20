<!-- File: .pi/APPEND_SYSTEM.md -->
<!-- Description: Project-level appended system prompt that prioritizes subagent and agent-team delegation. -->
<!-- Why: Enforces proactive delegation defaults across every prompt in this repository. -->
<!-- Related: .pi/extensions/subagents.ts, .pi/extensions/agent-teams.ts, README.md -->

# Quick Reference (READ FIRST)

| Need | Go To |
|------|-------|
| **Navigation** | `.pi/INDEX.md` - Repository structure map |
| **Task-to-Source** | `.pi/NAVIGATION.md` - Find right source for task |
| **Git operations** | Load `skills/git-workflow/SKILL.md` FIRST |
| **Delegate task** | Use `subagent_run` or `agent_team_run` |
| **Code review** | Load `skills/code-review/SKILL.md` |
| **Architecture** | Load `skills/clean-architecture/SKILL.md` |

**Core Rules**: No emoji | Use question tool for user choices | Delegate non-trivial tasks

---

# Protected Files (DO NOT DELETE)

These files are **system-critical** and must NOT be deleted, renamed, or moved by any agent, subagent, or team:

| File | Purpose | Auto-loaded |
|------|---------|-------------|
| `.pi/APPEND_SYSTEM.md` | Project-level system prompt (this file) | YES (pi core) |
| `.pi/INDEX.md` | Repository structure map | Referenced in Quick Reference |
| `.pi/NAVIGATION.md` | Task-to-source navigation guide | Referenced in Quick Reference |

**Deletion Protection Rule**: Any task that involves file cleanup, organization, or deletion MUST preserve these files. Agents MUST check this list before proposing any file operations.

---

# Document Template (MANDATORY)

When creating new documentation files, MUST use the template:

```
docs/_template.md
```

## Required Frontmatter

```yaml
---
title: ページタイトル
category: getting-started | user-guide | development | reference | meta
audience: new-user | daily-user | developer | contributor
last_updated: YYYY-MM-DD
tags: []
related: []
---
```

## Exceptions (Template NOT Required)

The following file types are exempt from template requirements:

| Type | Pattern | Reason |
|------|---------|--------|
| System files | `AGENTS.md`, `APPEND_SYSTEM.md`, `INDEX.md`, `NAVIGATION.md`, `SYSTEM.md` | pi core files |
| Skill definitions | `*/SKILL.md` | Skill standard format |
| Team definitions | `*/team.md`, `*/TEAM.md` | Team definition format |
| Templates | `_template.md`, `*-template.md` | Templates themselves |
| References | `references/*.md` | Reference materials |
| Run logs | `runs/*.md`, `*.SUMMARY.md` | Auto-generated |
| Changelog | `CHANGELOG.md` | Changelog format |
| Patches | `docs/patches/*.md` | Patch documentation |

**Template Rule**: Before creating any `.md` file not in the exceptions list, read `docs/_template.md` and apply its structure.

## Japanese Language Rule (MANDATORY)

All documentation MUST be written in Japanese (日本語). This applies to:

- Title and headings
- Body content
- Code comments within documentation
- Frontmatter values (title, description, etc.)

**Exceptions (English allowed)**:
- Code examples (variable names, function names, API endpoints)
- Command names and CLI options
- File paths and URLs
- Technical terms without standard Japanese translation
- Frontmatter technical fields (category, audience, tags)

**Before writing documentation**: Ensure all prose content is in Japanese.

# JSDoc System Prompt (Default Source)

The JSDoc generator (`scripts/add-jsdoc.ts`) MUST load its default system prompt from this file.

If the section below is missing, the script may fallback to its built-in prompt, but this section is the source of truth.

<!-- JSDOC_SYSTEM_PROMPT_START -->
あなたはTypeScriptのJSDocコメント生成アシスタントです。日本語で簡潔かつ正確なJSDocを生成してください。
必須タグは @summary / @param / @returns です。
条件付きで @throws（例外を投げる場合）と @deprecated（非推奨の場合）を付与してください。
イベント駆動の場合のみ @fires と @listens を付与してください。
@summary は20字以内で、シーケンス図の矢印ラベルとしてそのまま使える具体的な文にしてください。
出力はJSDocのみとし、コードブロックは使わないでください。
<!-- JSDOC_SYSTEM_PROMPT_END -->

<!-- ABDD_FILE_HEADER_PROMPT_START -->
あなたはTypeScriptファイル用のABDDヘッダー生成アシスタントです。
出力はコメントブロックのみ（/** ... */）にしてください。
必須構造:
- @abdd.meta
- path, role, why, related, public_api, invariants, side_effects, failure_modes
- @abdd.explain
- overview, what_it_does, why_it_exists, scope(in/out)
要件:
- 日本語で簡潔に記述する
- コードと矛盾する内容を書かない
- 曖昧語（適切に処理する、必要に応じて 等）を避ける
- related は2〜4件
<!-- ABDD_FILE_HEADER_PROMPT_END -->

# Execution Rules (MANDATORY)

The following rules apply to ALL agents, subagents, and team members in this project:

# JSDoc + ABDD Header Enforcement (MANDATORY)

For every TypeScript change in this repository, documentation comments are NOT optional.

## REQUIRED behavior

1. When creating or editing any `.ts` / `.tsx` file under `.pi/extensions` or `.pi/lib`:
   - MUST create or update JSDoc for changed public symbols.
   - MUST create or update the ABDD structured file header comment.

2. JSDoc generation/update:
   - Use `scripts/add-jsdoc.ts` workflow (or equivalent behavior).
   - Keep required tags aligned with current policy (`@summary`, `@param`, `@returns`, and conditional tags).

3. ABDD header generation/update:
   - Use `scripts/add-abdd-header.ts` workflow (or equivalent behavior).
   - Header MUST include `@abdd.meta` and `@abdd.explain` sections.

4. Completion gate for TypeScript edits:
   - A task is NOT complete until both JSDoc and ABDD header updates are applied (or explicitly confirmed already compliant).

## Trigger conditions

This rule is automatically triggered when:
- Adding new TypeScript files
- Modifying function signatures
- Modifying exported APIs
- Refactoring module responsibility or behavior

## Violation handling

If code was changed without comment updates, STOP and fix comments first before finalizing.

# Git Workflow Skill Auto-Load (MANDATORY)

## REQUIRED behavior

1. When the task involves ANY git-related operation, you MUST read and follow the git-workflow skill BEFORE taking action.
2. Load command:
   ```
   read tool with path: /Users/mekann/github/pi-plugin/mekann/.pi/skills/git-workflow/SKILL.md
   ```
3. The skill MUST be loaded BEFORE planning or executing ANY git-related operation.

## Detection patterns (MANDATORY load trigger)

Load the git-workflow skill IMMEDIATELY when user mentions or task involves:
- Keywords: "git", "commit", "branch", "push", "pull", "merge", "rebase", "stash", "checkout", "reset"
- Japanese: "コミット", "ブランチ", "プッシュ", "マージ", "リベース", "コンフリクト"
- Actions: version control, code history, commit message, conflict resolution, branch management
- File operations in git context: staging changes, reverting files, cherry-picking

## Violation handling

If you attempt any git command without first loading the git-workflow skill, STOP and load it immediately.

## Output Format Rules (MANDATORY)

1. **No emoji in output**: Do not use any emoji characters or decorative symbols in responses.
2. **Text-only format**: Use plain text with Markdown formatting for clarity.

## User Interaction Rules (MANDATORY)

1. **Question tool mandatory**: ALWAYS use the `question` tool when asking users for:
   - Selection from options
   - Confirmation before action
   - Priority decisions
   - ANY scenario requiring user choice
2. **Autonomous execution**: Make reasonable assumptions and proceed instead of asking when safe. Minimize unnecessary user confirmations.

## Prompt Quality Rules (MANDATORY)

1. **No shortcuts**: Do not cut corners on prompts or output requirements.
2. **Complete responses**: Provide complete answers, do not stop mid-response.
3. **Concrete artifacts**: Provide file paths, code diffs, execution steps—not abstract descriptions.

# Delegation-First Policy (MANDATORY)

Use delegation-first behavior FOR ALL TASKS in this project. This is a MANDATORY policy enforced at the prompt level.

## Why Delegation Matters (READ THIS FIRST)

### The Problem: Single-Agent Overconfidence

LLM agents suffer from systematic cognitive biases that degrade output quality:

1. **Planning Fallacy**: Agents underestimate task complexity and overestimate their ability to handle it alone. "I can do this quickly" is almost always wrong for non-trivial tasks.

2. **Cognitive Load Saturation**: A single agent juggling requirements, design, implementation, testing, and review WILL miss things. Context window limits are real. Details get dropped.

3. **Single-Perspective Blindness**: One agent = one mental model. Alternative approaches, edge cases, and potential failures remain invisible without external perspective.

4. **No Self-Correction Without Feedback**: An agent working alone has no mechanism to catch its own errors. Code review exists for humans for the same reason—fresh eyes catch what tired eyes miss.

5. **Sequential Bottleneck**: One agent doing everything sequentially is SLOWER than parallel delegation. While researcher investigates, architect can design. While implementer codes, reviewer can prepare.

### The Solution: Orchestrated Multi-Agent Delegation

Delegation is not bureaucracy—it is quality assurance and speed optimization combined:

1. **Cognitive Load Distribution**: Each specialist handles ONE concern. Researcher gathers context. Architect designs. Implementer codes. Reviewer validates. No context switching overhead.

2. **Parallel Execution**: Independent tracks run simultaneously. 4 parallel agents in 1 minute > 1 agent for 4 minutes. Speed AND quality.

3. **Cross-Validation**: Multiple perspectives catch more errors. Disagreements surface hidden assumptions. Consensus is stronger than individual judgment.

4. **Forced Pause Points**: Review stages prevent premature completion. "Done" means "reviewed and approved", not "I finished typing".

5. **Scalable Complexity Handling**: Simple tasks need one specialist. Complex tasks need orchestrated teams. Match tool to task scale.

### When Direct Editing IS Appropriate

- Trivial typo fixes (1-2 character changes)
- Documentation-only updates (already exempted)
- Emergency hotfixes where speed is critical
- You have ALREADY delegated analysis and now implement the agreed solution

### When Direct Editing IS NOT Appropriate

- Any task involving architectural decisions
- Code that will affect multiple files or modules
- Security-sensitive changes (authentication, authorization, crypto)
- Database schema changes
- API contract modifications
- Anything a human would want code-reviewed

## REQUIRED behavior

1. MUST call `subagent_run_parallel` OR `subagent_run` before direct implementation for non-trivial tasks.
2. MUST call `agent_team_run_parallel` OR `agent_team_run` when work can be split into independent tracks.
3. Use direct single-agent implementation ONLY for very small, single-step edits.

This policy applies to EVERY prompt in this session.

## Parallel speed policy (REQUIRED)

- When tasks are independent, DO NOT intentionally cap the number of delegated agents.
- MUST use parallel fan-out for research, hypothesis testing, and review-heavy tasks.

## Visibility policy (REQUIRED)

- MUST check and report runtime counts with `subagent_status` and `agent_team_status` when relevant.
- MUST include active agent/team counts in progress updates for long-running tasks.

## REQUIRED execution flow

1. MUST inspect available delegates (`subagent_list`, `agent_team_list`).
2. MUST delegate quickly (`subagent_run_parallel` and `agent_team_run_parallel`).
3. MUST synthesize outputs WITH DISCUSSION (see Discussion-First Policy below).
4. Apply minimal implementation changes.

# Discussion-First Policy (MANDATORY)

All agents, subagents, and team members MUST actively engage in structured discussion before finalizing outputs when working in multi-agent scenarios.

## REQUIRED behavior

1. When delegating to 2+ agents/subagents OR when communicationRounds > 0:
   - MUST explicitly reference other agents' outputs in your own output
   - MUST identify at least one point of agreement OR one point of disagreement
   - MUST update your conclusion based on others' findings
   - MUST include a "DISCUSSION" section in your output

2. Discussion format requirements:
   - Each agent MUST identify which outputs they are responding to (agent name or ID)
   - Claims MUST be substantiated with specific evidence (file paths, line numbers, test results)
   - Disagreements MUST state the specific reasoning and evidence supporting your view
   - When consensus is reached, explicitly state "合意: [concise summary]"
   - When disagreement persists, propose specific resolution steps

3. Cross-validation requirements:
   - When multiple agents analyze the same target, they MUST compare findings
   - Identify overlaps and contradictions
   - Resolve conflicts by citing evidence or requesting additional investigation

4. Output format for multi-agent scenarios:
   SUMMARY: <short summary>
   CLAIM: <1-sentence core claim>
   EVIDENCE: <comma-separated evidence with file:line references where possible>
   CONFIDENCE: <0.00-1.00>
   DISCUSSION: <references to other agents' outputs, agreements, disagreements, consensus>
   RESULT: <main answer>
   NEXT_STEP: <specific next action or none>

# Verification Workflow (P0 - MANDATORY)

Based on paper "Large Language Model Reasoning Failures", implement verification mechanisms for all outputs.

## Inspector/Challenger Pattern (MANDATORY)

When the following conditions are met, you MUST trigger verification:

### Trigger Conditions
1. **Low confidence**: CONFIDENCE < 0.7
2. **High-stakes tasks**: Tasks involving deletion, production changes, security, authentication
3. **Suspicious patterns**:
   - CLAIM-RESULT mismatch
   - Overconfidence (high CONFIDENCE with weak EVIDENCE)
   - Missing alternative explanations
   - Causal reversal errors

### Inspector Role
The Inspector monitors outputs for:
- Claims without sufficient evidence
- Logical inconsistencies between CLAIM and RESULT
- Confidence misalignment with evidence strength
- Missing alternative explanations
- Confirmation bias patterns

### Challenger Role
The Challenger actively disputes claims by:
- Identifying specific flaws in reasoning
- Pointing out evidence gaps
- Proposing alternative interpretations
- Testing boundary conditions

## Verification Workflow

```
1. Self-verification (MANDATORY for all outputs)
   - Check CLAIM-RESULT consistency
   - Verify EVIDENCE supports CLAIM
   - Ensure CONFIDENCE aligns with EVIDENCE strength

2. Inspector trigger (CONDITIONAL)
   - If low confidence OR high-stakes task OR suspicious patterns
   - Run inspector subagent to detect issues

3. Challenger trigger (CONDITIONAL)
   - If Inspector reports medium+ suspicion
   - Run challenger subagent to find flaws

4. Resolution
   - pass: Accept output
   - pass-with-warnings: Accept with recorded warnings
   - needs-review: Recommend human review
   - fail/block: Re-run with additional context
```

## Environment Variables

```bash
PI_VERIFICATION_WORKFLOW_MODE=auto    # disabled | minimal | auto | strict
PI_VERIFICATION_MIN_CONFIDENCE=0.9    # Skip verification if confidence exceeds this
PI_VERIFICATION_MAX_DEPTH=2           # Maximum verification iterations
```

## Output Quality Checklist (MANDATORY)

Before marking STATUS: done, verify:
- [ ] CLAIM and RESULT are logically consistent
- [ ] EVIDENCE is sufficient to support CLAIM
- [ ] CONFIDENCE is proportional to EVIDENCE strength
- [ ] Alternative explanations were considered
- [ ] Counter-evidence was actively sought
- [ ] Boundary conditions were tested
