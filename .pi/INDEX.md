# mekann/pi Index

> Agent navigation index for mekann extension collection.
> Based on OpenAI's harness engineering: "Give Codex a map, not a 1,000-page manual."

## Quick Reference

| Task Type | Primary Source | Secondary Source |
|-----------|---------------|------------------|
| Extension development | `.pi/lib/` + `docs/03-development/` | `README.md` |
| Agent orchestration | `.pi/extensions/subagents.ts` | `docs/02-user-guide/08-subagents.md` |
| Skill usage | `.pi/skills/*/SKILL.md` | `docs/skill-guide.md` |
| Troubleshooting | `docs/04-reference/03-troubleshooting.md` | `CHANGELOG.md` |
| Getting started | `docs/01-getting-started/01-quick-start.md` | `README.md` |

## Repository Structure Map

```
mekann/
├── .pi/
│   ├── INDEX.md              <-- YOU ARE HERE (navigation hub)
│   ├── NAVIGATION.md         <-- Task-type to source mapping
│   ├── APPEND_SYSTEM.md      <-- Project-level rules
│   ├── extensions/           <-- Extension implementations (16 files)
│   ├── lib/                  <-- Shared libraries (20+ files)
│   ├── skills/               <-- Skill definitions (5 skills)
│   └── docs/                 <-- Documentation
├── docs/
│   ├── 01-getting-started/   <-- Installation, quick start
│   ├── 02-user-guide/        <-- Extension guides
│   ├── 03-development/       <-- Developer guide
│   ├── 04-reference/         <-- Config, troubleshooting
│   └── 05-meta/              <-- Changelog, roadmap
└── README.md                 <-- Project overview
```

## Core Extensions Index

| Extension | File | Purpose |
|-----------|------|---------|
| question | `extensions/question.ts` | Interactive user selection UI |
| rsa_solve | `extensions/rsa.ts` | Reasoning scaling, task decomposition |
| loop_run | `extensions/loop.ts` | Autonomous task loop execution |
| subagent_* | `extensions/subagents.ts` | Sub-agent creation/execution |
| agent_team_* | `extensions/agent-teams.ts` | Team orchestration |
| plan_* | `extensions/plan.ts` | Plan management |

## Skills Index

| Skill | Location | When to Use |
|-------|----------|-------------|
| git-workflow | `skills/git-workflow/` | Any git operation |
| clean-architecture | `skills/clean-architecture/` | Architecture design/review |
| code-review | `skills/code-review/` | Code quality review |
| logical-analysis | `skills/logical-analysis/` | Text/document analysis |
| dynamic-tools | `skills/dynamic-tools/` | Runtime tool generation |

## Library Index

| Library | File | Purpose |
|---------|------|---------|
| concurrency | `lib/concurrency.ts` | Worker pool with rate limiting |
| retry-with-backoff | `lib/retry-with-backoff.ts` | Exponential backoff retry |
| storage-lock | `lib/storage-lock.ts` | File locking, atomic writes |
| agent-types | `lib/agent-types.ts` | Agent-related type definitions |
| skill-registry | `lib/skill-registry.ts` | Skill detection/resolution |

## Rules Summary

1. **Delegation-First**: Use subagents for non-trivial tasks
2. **Git Operations**: Load git-workflow skill first
3. **Output Format**: No emoji, Markdown only
4. **Verification**: Self-check CLAIM-RESULT consistency

## See Also

- `.pi/NAVIGATION.md` - Detailed task-to-source mapping
- `README.md` - Full project documentation
- `docs/` - Comprehensive guides
