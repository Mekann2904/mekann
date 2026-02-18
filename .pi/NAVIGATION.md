# mekann/pi Navigation Guide

> Task-type to information-source mapping for agent navigation.
> Use this guide to find the right source for your current task.

## Task-Type Navigation Matrix

### Development Tasks

| Task | Primary Source | Key Files |
|------|---------------|-----------|
| Create new extension | `docs/03-development/01-getting-started.md` | `.pi/extensions/*.ts` |
| Modify existing extension | Extension file directly | `.pi/extensions/<name>.ts` |
| Use shared library | `.pi/lib/*.ts` | `concurrency.ts`, `storage-lock.ts` |
| Add new skill | `.pi/docs/skill-guide.md` | `.pi/skills/*/SKILL.md` |
| Debug extension | `docs/04-reference/03-troubleshooting.md` | Extension source |

### Orchestration Tasks

| Task | Primary Source | Key Tools |
|------|---------------|-----------|
| Delegate to subagent | `subagent_run`, `subagent_run_parallel` | `.pi/extensions/subagents.ts` |
| Run agent team | `agent_team_run`, `agent_team_run_parallel` | `.pi/extensions/agent-teams.ts` |
| Create plan | `plan_create` | `.pi/extensions/plan.ts` |
| Autonomous loop | `loop_run` | `.pi/extensions/loop.ts` |

### Research Tasks

| Task | Primary Source | Key Files |
|------|---------------|-----------|
| Analyze codebase | `subagent_run` with researcher agent | `.pi/subagents/definitions/` |
| Review code quality | `skills/code-review/SKILL.md` | Load skill first |
| Architecture review | `skills/clean-architecture/SKILL.md` | Load skill first |
| Document analysis | `skills/logical-analysis/SKILL.md` | Load skill first |

### Git Tasks

| Task | Required Action | Source |
|------|-----------------|--------|
| Any git operation | Load git-workflow skill FIRST | `skills/git-workflow/SKILL.md` |
| Commit changes | After loading skill | Follow skill instructions |
| Branch management | After loading skill | Follow skill instructions |

### Documentation Tasks

| Task | Primary Source | Key Files |
|------|---------------|-----------|
| Generate as-built docs | `scripts/generate-abdd.ts` | `npx tsx scripts/generate-abdd.ts` |
| Add JSDoc | `scripts/add-jsdoc.ts` | `npx tsx scripts/add-jsdoc.ts --dry-run` |
| Review intention vs implementation | `skills/abdd/SKILL.md` | Load skill first |
| Update philosophy | `philosophy.md` | Manual update |
| Update spec | `ABDD/spec.md` | Manual update |

## Information Hierarchy

### Level 1: Quick Reference (Always read first)
- `.pi/INDEX.md` - Navigation hub
- `.pi/NAVIGATION.md` - This file
- `.pi/APPEND_SYSTEM.md` (Quick Reference section) - Essential rules

### Level 2: Task-Specific Documentation
- `docs/01-getting-started/` - Installation, setup
- `docs/02-user-guide/` - Extension usage guides
- `docs/03-development/` - Developer documentation
- `docs/04-reference/` - Configuration, troubleshooting

### Level 3: Source Code (Reference only)
- `.pi/extensions/` - Extension implementations
- `.pi/lib/` - Shared libraries
- `.pi/skills/` - Skill definitions

## Decision Flow

```
START
  |
  v
Is this a git operation? --> YES --> Load skills/git-workflow/SKILL.md
  |
  NO
  |
  v
Is this non-trivial/coding? --> YES --> Use subagent_run or agent_team_run
  |
  NO
  |
  v
Is this a quick edit? --> YES --> Proceed directly
  |
  NO
  |
  v
Consult INDEX.md for source navigation
```

## Mandatory Pre-Actions

1. **Before git operations**: Read `skills/git-workflow/SKILL.md`
2. **Before code review**: Read `skills/code-review/SKILL.md`
3. **Before architecture work**: Read `skills/clean-architecture/SKILL.md`
4. **Before document analysis**: Read `skills/logical-analysis/SKILL.md`
5. **Before documentation review**: Read `skills/abdd/SKILL.md`

## Common Patterns

### Pattern 1: Feature Development
1. Read `docs/03-development/01-getting-started.md`
2. Check `.pi/lib/` for reusable utilities
3. Reference similar extension in `.pi/extensions/`
4. Implement with subagent delegation

### Pattern 2: Bug Investigation
1. Read `docs/04-reference/03-troubleshooting.md`
2. Use `subagent_run` with researcher agent
3. Check relevant extension source
4. Verify fix with tester agent

### Pattern 3: Documentation Update
1. Check `docs/05-meta/02-documentation-policy.md`
2. Follow template in `docs/_template.md`
3. Update INDEX.md if structure changes

### Pattern 4: ABDD Review
1. Read `philosophy.md` and `ABDD/spec.md` for intention
2. Run `npx tsx scripts/generate-abdd.ts` for as-built docs
3. Compare intention with implementation
4. Identify gaps and propose fixes
5. Record review in `ABDD/reviews/YYYY-MM-DD.md`

## Related Files

- `.pi/INDEX.md` - Repository structure overview
- `.pi/APPEND_SYSTEM.md` - Project rules
- `README.md` - Project overview
