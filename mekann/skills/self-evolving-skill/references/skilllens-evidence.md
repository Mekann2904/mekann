# Skill quality evidence notes

This note preserves only the evidence useful for Pi's `self-evolving-skill` workflow.

## Why not rely on self-review?

Skill quality is not a simple loss function. A model that just edited a skill is biased toward believing the edit helped. Use at least one of:

- independent read-only subagent review
- before/after dry-run on fixed test prompts
- mechanical checks if the skill has executable behavior
- human checkpoint for ambiguous or high-risk changes

## Rubric dimensions that matter most

Empirical skill-quality work such as SkillLens suggests that generic LLM judging is weak unless the rubric explicitly checks meta-skill features. For Pi skill review, emphasize:

1. **Failure handling**: Does the skill say what to do when the happy path fails?
2. **Actionability**: Are instructions concrete enough to execute with Pi tools?
3. **Anti-pattern blacklist**: Does it say what not to do?
4. **Runtime fit**: Does it avoid nonexistent tools or runtime-specific assumptions?
5. **Validation**: Are there test prompts or checks that expose regressions?

## Practical high-leverage edits

- Add explicit STOP / human checkpoint before irreversible or ambiguous choices.
- Convert vague advice into if/then fallback rules.
- Replace runtime-specific tool names with Pi tool workflows.
- Add one failure-case prompt to `test-prompts.json`.
- Delete demo, branding, screenshots, result-card generation, and upstream install instructions from Pi-maintained copies.

## Caveat

Rubric scores are decision support, not truth. A tiny score gain is not enough if the skill becomes longer, less clear, or less faithful to its purpose. Treat high-severity regressions as reject even when the numeric score improves.
