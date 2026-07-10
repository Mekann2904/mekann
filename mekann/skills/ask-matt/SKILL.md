---
name: ask-matt
description: Ask which Mekann skill or workflow fits the current situation. Routes only to skills and runtime flows available in this package.
disable-model-invocation: true
---

# Ask Matt

Route the user's request to the smallest suitable Mekann workflow. Do not invent upstream commands that Mekann does not expose.

## Main delivery flow

1. Use `grill-with-docs` when an idea or design needs clarification and should update `CONTEXT.md` or ADRs.
2. Use `prototype` when a runnable experiment is needed to answer one design question.
3. For multi-issue work, use `to-prd` and then `to-issues`.
4. Use `implement` for an agreed piece of work; it should use `tdd` where practical.
5. Use `code-review` to compare a completed diff against repository standards and its originating specification.

## Other entry points

- Hard bug or performance regression: `diagnose`
- Incoming issue or external request: `triage`
- Architecture survey: `improve-codebase-architecture`
- Domain terminology or ADR work: `domain-modeling`
- Deep-module/interface design: `codebase-design`
- Primary-source investigation: `research`
- In-progress merge/rebase conflict: `resolving-merge-conflicts`
- Agent-friendly CLI design: `cli-for-agents`

## Mekann invocation

Load a visible skill by reading its listed `SKILL.md`. A hidden skill remains explicitly loadable as `/skill:<name>`. Use Mekann runtime flows such as `/issue`, `/pr-check`, or `/review-quality` when repository policy routes the task through them.

Before issue-management flows, use `setup-matt-pocock-skills` if the repository does not yet define its issue tracker, triage vocabulary, or domain-doc layout.
