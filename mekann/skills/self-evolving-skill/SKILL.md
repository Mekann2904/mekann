---
name: self-evolving-skill
description: "Improve Pi agent skills through a self-evolving loop: choose one target SKILL.md, evaluate it with test prompts and a 9-dimension rubric, make only bounded edits, validate with independent review / dry-run / checks, and keep only clearly improved changes. Use when the user asks for 'self-evolving skill', 'improve this skill', 'skill review', 'skill evaluation', or 'make SKILL.md better'."
---

# Self-Evolving Skill

A workflow for improving Pi-oriented `SKILL.md` files in the style of Karpathy autoresearch and SkillOpt.

The goal is not a rewrite that merely looks better. The goal is to **keep only improvements with evidence**. Each experiment changes one weakness in one target skill.

## Mental model

| autoresearch | self-evolving-skill |
|---|---|
| `program.md` | This `SKILL.md`: goals, constraints, evaluation method |
| `train.py` | The target `SKILL.md` being optimized |
| validation metric | Evidence from a 9-dimension rubric + test prompts |
| git ratchet | Keep improved changes; reject changes that are worse or equivalent |
| test set | The target skill's `test-prompts.json` |
| full autonomy | Human checkpoints for important judgment calls |

## Required inputs

- Target: `mekann/skills/<skill-name>/SKILL.md`
- Evaluation prompts: `test-prompts.json` in the target skill directory
  - If missing, create 2-3 prompts first.
  - If prompts are created or substantially changed, ask the user before optimizing.
  - If prompts change, do not compare against the old baseline; take a fresh baseline.
- Experiment log: `self-evolving-results.tsv` in the target skill directory
  - Create it if missing. Treat the history as part of the acceptance gate.
- Constraints: the skill's intended purpose, Pi runtime policy, and allowed files.

## Artifacts

Place target-specific artifacts in the target skill directory.

```text
mekann/skills/<skill-name>/
├── SKILL.md
├── test-prompts.json          # Representative happy-path, ambiguous, and failure prompts
└── self-evolving-results.tsv  # Baseline / keep / reject history
```

Read this skill's local references only when needed.

- `references/skilllens-evidence.md`
- `references/runtime-neutrality.md`

## Workflow

### Phase 0: Scope

1. Narrow the scope to one target skill.
2. Read its `SKILL.md`.
3. Check whether `test-prompts.json` exists.
4. State out-of-scope files, forbidden changes, and changes that require user confirmation.

STOP and ask the user if:

- Multiple target skills are in scope.
- The skill's purpose appears to need changing.
- A large rewrite appears necessary.
- The workspace has unexpected dirty changes.

### Phase 1: Baseline

Evaluate the current skill with the 9-dimension rubric. The goal is not perfect numerical precision; the goal is to decide which weakness to fix in one round.

Run a runtime red-flag scan here. If it hits, prioritize runtime drift as the first hypothesis.

```bash
rg -n "Claude Code|Cursor only|Codex 中|Task|TodoWrite|Grep|Glob|~/.claude/skills|/plugin install" <skill-dir>/SKILL.md <skill-dir>/README.md 2>/dev/null
```

If it prints matches, decide whether each match is legitimate context. A nonexistent Pi tool or single-runtime assumption is a red flag.

| # | Dimension | Weight | What to inspect |
|---|---:|---:|---|
| 1 | Trigger clarity | 8 | The description says what the skill does and when to use it |
| 2 | Scope boundary | 10 | Target, non-targets, and editable surface are clear |
| 3 | Workflow | 14 | Steps are ordered and include inputs, outputs, and stop conditions |
| 4 | Failure handling | 14 | Fallbacks, rollback, and user checkpoints are encoded |
| 5 | Actionability | 14 | Guidance contains concrete criteria, files, and formats rather than abstractions |
| 6 | Pi runtime fit | 12 | The skill fits Pi tools: `read`, `bash`, `edit`, `write`, `spawn_agent` |
| 7 | Validation | 12 | Effects can be checked through test prompts, checks, dry-run, or review |
| 8 | Concision | 8 | It avoids unused background, images, demos, and long quotations |
| 9 | Anti-patterns | 8 | Dangerous optimization moves and things not to do are explicit |

Scoring:

```text
score = Σ(points_1_to_10 × weight) / 10
```

### Phase 2: Choose one hypothesis

Do not mechanically fix the lowest-scored dimension. Choose one hypothesis that satisfies all of these:

- It is likely to improve representative test-prompt behavior.
- It can be addressed with one small edit.
- It does not change the skill's purpose.
- It is unlikely to regress other dimensions.

Format:

```markdown
Hypothesis: <which prompt / evaluation dimension should improve, and why>
Edit budget: 1-3 small add / delete / replace edits
Reject if: <condition that forces rollback or rejection>
```

### Phase 3: Bounded edit

Allowed edits:

- Make the frontmatter description more specific.
- Add a missing checkpoint or fallback.
- Replace nonexistent runtime tool names with Pi-compatible workflows.
- Turn a long paragraph into a checklist.
- Add a missing case to `test-prompts.json`.
- Remove unused upstream, demo, asset, or result-card instructions.

Forbidden edits:

- Changing the skill's purpose.
- Fixing multiple major weaknesses in one round.
- Editing the vendor mirror.
- Keeping a full rewrite without tests or review.
- Adding tools or slash commands that do not exist in Pi.
- Adding result cards, images, dashboards, or other decorative assets.

### Phase 4: Validate

Even small edits must not be kept on self-review alone.

Validation priority:

1. Run existing checks / tests if the skill has any.
2. Use `spawn_agent` for read-only review.
3. Compare before / after dry-runs on fixed test prompts.
4. For trivial typo/frontmatter edits, checklist evidence is acceptable.

Subagent review brief:

```text
Read-only review. Do not edit files or run git commands.
Review <path>/SKILL.md and its test-prompts.json for:
- trigger clarity
- workflow/actionability
- failure handling
- Pi runtime fit
- unnecessary content
Return high/medium/low findings and keep/reject/needs-human.
```

### Phase 5: Gate

Keep only if all are true:

- There is evidence for the change hypothesis.
- There is no high-severity regression.
- The skill's original purpose is preserved.
- Pi runtime fit has not regressed.
- The skill did not become unnecessarily long.

Reject / rollback if:

- The score is equivalent or worse.
- Test-prompt behavior became less clear.
- The skill became over-general and lost its purpose.
- Independent review found a high-severity issue.

Gate details:

- Track score at 0.1 precision. Ties are rejected.
- High-severity regressions override numeric score improvements.
- Do not directly compare scores across rounds that changed test prompts.
- If a judge returns `needs-human`, do not keep; ask the user.

### Phase 6: Record and report

Append one row to `self-evolving-results.tsv`.

```tsv
timestamp	skill	old_score	new_score	status	hypothesis	evidence	note
2026-06-05T12:00:00Z	example-skill	72.0	78.5	keep	add fallback	dry-run happy-path improved	-
```

Statuses:

- `baseline`: initial evaluation
- `keep`: accepted
- `reject`: rejected
- `needs-human`: waiting for human decision
- `error`: evaluation failed

### Phase 7: Report

```markdown
- Target: `<path>/SKILL.md`
- Baseline weakness: <dimension / finding>
- Change: <small edit summary>
- Validation: <check / review / dry-run evidence>
- Gate: keep / reject / needs-human
- Files: <changed files>
```

## Human checkpoints

Ask the user before continuing when:

- Creating or substantially changing `test-prompts.json`.
- A large rewrite appears necessary.
- The skill's purpose, intended users, or runtime environment may change.
- Numeric score improves but judge / dry-run evidence is mixed.
- Rollback cannot be done safely.

Do not ask for routine keep/reject decisions when the evidence is clear and the work is within approved scope.

## `test-prompts.json` format

```json
[
  {
    "id": "happy-path",
    "scenario": "Typical request",
    "prompt": "A realistic user request",
    "expected": "Expected behavior or output when the skill is used"
  },
  {
    "id": "ambiguous-case",
    "scenario": "Ambiguous request",
    "prompt": "A request with unclear scope or intent",
    "expected": "What to clarify, or the safe default behavior"
  },
  {
    "id": "failure-case",
    "scenario": "Failure or risky case",
    "prompt": "A request likely to lead the agent in the wrong direction",
    "expected": "Stop condition, fallback, or rejection criteria"
  }
]
```

## Anti-pattern blacklist

Do not:

- Edit the skill and then declare in the same context that it improved.
- Add verbose content only to increase rubric score.
- Change test prompts after the fact to make an edit look better.
- Change the skill's purpose to improve score.
- Delegate editing, git operations, or final acceptance to a subagent.
- Mix upstream README, assets, or templates into the Pi skill.
- Design runtime workflow that assumes `vendor/` exists.

## Local references

- `references/skilllens-evidence.md`: Notes on rubric design and limits of LLM judges.
- `references/runtime-neutrality.md`: Notes for avoiding runtime-specific assumptions.
