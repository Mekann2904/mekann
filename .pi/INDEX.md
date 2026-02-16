# mekann/pi Index

> Agent navigation index for mekann extension collection.
> Based on OpenAI's harness engineering: "Give Codex a map, not a 1,000-page manual."

## Quick Reference

| Task Type | Primary Source | Secondary Source |
|-----------|---------------|------------------|
| Extension development | `.pi/lib/` + `docs/03-development/` | `README.md` |
| Agent orchestration | `.pi/extensions/subagents.ts` | `docs/02-user-guide/08-subagents.md` |
| Skill usage | `.pi/skills/*/SKILL.md` | `docs/02-user-guide/11-utilities.md` |
| Code search | `.pi/extensions/search/` | `docs/02-user-guide/01-extensions.md` |
| Dynamic tools | `.pi/extensions/dynamic-tools.ts` | `docs/02-user-guide/01-extensions.md` |
| Troubleshooting | `docs/04-reference/03-troubleshooting.md` | `CHANGELOG.md` |
| Getting started | `docs/01-getting-started/01-quick-start.md` | `README.md` |

## Repository Structure Map

```
mekann/
├── .pi/
│   ├── INDEX.md              <-- YOU ARE HERE (navigation hub)
│   ├── NAVIGATION.md         <-- Task-type to source mapping
│   ├── APPEND_SYSTEM.md      <-- Project-level rules
│   ├── extensions/           <-- Extension implementations (34 files)
│   │   ├── search/           <-- Code search tools (10 files)
│   │   │   ├── tools/        <-- file_candidates, code_search, sym_index, sym_find
│   │   │   ├── utils/        <-- CLI and output utilities
│   │   │   └── fallbacks/    <-- Native fallback implementations
│   │   └── *.ts              <-- Core extensions (19 files)
│   ├── lib/                  <-- Shared libraries (55 files)
│   │   ├── embeddings/       <-- Embedding modules (5 files)
│   │   └── *.ts              <-- Core libraries
│   ├── skills/               <-- Skill definitions (8 skills)
│   │   ├── agent-estimation/ <-- Agent work estimation
│   │   ├── alma-memory/      <-- ALMA memory design
│   │   ├── harness-engineering/
│   │   ├── dynamic-tools/    <-- Runtime tool generation
│   │   ├── git-workflow/
│   │   ├── clean-architecture/
│   │   ├── code-review/
│   │   └── logical-analysis/
│   ├── agent-teams/          <-- Team definitions and runs
│   ├── subagents/            <-- Subagent definitions and runs
│   ├── memory/               <-- Semantic memory storage
│   ├── agent-loop/           <-- Agent loop runs
│   └── plans/                <-- Plan history
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
| file_candidates | `extensions/search/` | Fast file enumeration (fd) |
| code_search | `extensions/search/` | Code pattern search (rg) |
| sym_index | `extensions/search/` | Symbol index generation (ctags) |
| sym_find | `extensions/search/` | Symbol definition search |
| create_tool | `extensions/dynamic-tools.ts` | Dynamic tool generation |
| run_dynamic_tool | `extensions/dynamic-tools.ts` | Dynamic tool execution |
| startup-context | `extensions/startup-context.ts` | Initial context injection |

## Skills Index

| Skill | Location | When to Use |
|-------|----------|-------------|
| git-workflow | `skills/git-workflow/` | Any git operation |
| clean-architecture | `skills/clean-architecture/` | Architecture design/review |
| code-review | `skills/code-review/` | Code quality review |
| logical-analysis | `skills/logical-analysis/` | Text/document analysis |
| dynamic-tools | `skills/dynamic-tools/` | Runtime tool generation |
| agent-estimation | `skills/agent-estimation/` | AI agent workload estimation |
| alma-memory | `skills/alma-memory/` | ALMA-based memory design |
| harness-engineering | `skills/harness-engineering/` | Quality assurance patterns |

## Library Index

| Library | File | Purpose |
|---------|------|---------|
| concurrency | `lib/concurrency.ts` | Worker pool with rate limiting |
| retry-with-backoff | `lib/retry-with-backoff.ts` | Exponential backoff retry |
| storage-lock | `lib/storage-lock.ts` | File locking, atomic writes |
| agent-types | `lib/agent-types.ts` | Agent-related type definitions |
| skill-registry | `lib/skill-registry.ts` | Skill detection/resolution |
| comprehensive-logger | `lib/comprehensive-logger.ts` | Comprehensive logging |
| verification-workflow | `lib/verification-workflow.ts` | Inspector/Challenger verification |
| context-engineering | `lib/context-engineering.ts` | Context engineering utilities |
| execution-rules | `lib/execution-rules.ts` | Execution rule definitions |
| semantic-memory | `lib/semantic-memory.ts` | Semantic memory storage |
| semantic-repetition | `lib/semantic-repetition.ts` | Semantic repetition detection |
| intent-aware-limits | `lib/intent-aware-limits.ts` | Intent-based budget limits |
| run-index | `lib/run-index.ts` | Run index management |
| pattern-extraction | `lib/pattern-extraction.ts` | Pattern extraction |
| output-schema | `lib/output-schema.ts` | Output schema definitions |
| text-parsing | `lib/text-parsing.ts` | Text parsing utilities |
| embeddings | `lib/embeddings/` | Embedding modules |

## Rules Summary

1. **Delegation-First**: Use subagents for non-trivial tasks
2. **Git Operations**: Load git-workflow skill first
3. **Output Format**: No emoji, Markdown only
4. **Verification**: Self-check CLAIM-RESULT consistency

## See Also

- `.pi/NAVIGATION.md` - Detailed task-to-source mapping
- `README.md` - Full project documentation
- `docs/` - Comprehensive guides
