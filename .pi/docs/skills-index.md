# Skills Documentation Index

This directory contains documentation for the skill management system.

## Documents

| Document | Purpose | Audience |
|----------|---------|----------|
| [skill-management-architecture.md](./skill-management-architecture.md) | Technical architecture and implementation details | Developers, System architects |
| [skill-guide.md](./skill-guide.md) | Skill usage guide and descriptions | Users, Agent designers |
| [skill-operations.md](./skill-operations.md) | Operational procedures and maintenance | Operators, Maintainers |

## Quick Start

### For Users

1. Read [skill-guide.md](./skill-guide.md) to understand available skills
2. Check which skills are assigned to your agents
3. Reference skill documentation when working with specialized tasks

### For Developers

1. Read [skill-management-architecture.md](./skill-management-architecture.md)
2. Understand the skill resolution flow
3. Note: `skill-registry.ts` is available but not currently integrated with extensions
4. Review inline skill handling in `subagents.ts` (lines 964-1024) and `agent-teams.ts` (lines 2173-2238)

### For Operators

1. Read [skill-operations.md](./skill-operations.md)
2. Follow procedures for adding/modifying/removing skills
3. Use checklists for validation

## Directory Structure

```
.pi/
├── docs/
│   ├── skills-index.md (this file)
│   ├── skill-management-architecture.md
│   ├── skill-guide.md
│   └── skill-operations.md
│
├── lib/
│   ├── skill-registry.ts          # Core skill resolution engine
│   └── skills/                    # Skill definitions
│       ├── research-data-analysis/
│       ├── research-literature/
│       ├── research-statistics/
│       └── ... (14 skills total)
│
├── extensions/
│   ├── subagents.ts               # Subagent skill integration
│   └── agent-teams.ts             # Team skill integration
│
└── skills/                        # Reserved (empty)
```

## Key Concepts

### Skill

A reusable instruction module that can be assigned to agents. Defined in `SKILL.md` with YAML frontmatter.

### Skill Registry

The system that discovers, resolves, and formats skills for prompt injection. Implemented in `skill-registry.ts`.

**Note**: As of 2026-02-14, `skill-registry.ts` is available but NOT currently integrated with `subagents.ts` or `agent-teams.ts`. Both extensions have their own inline implementations for skill handling. See [skill-management-architecture.md](./skill-management-architecture.md) for details.

### Inheritance

Skills can be inherited from parent (lead agent/team level) to child (subagent/member level).

### Override

Project-local skills (`.pi/lib/skills/`) override global skills (`~/.pi/agent/skills/`).

## Current Skill Inventory

### Research Skills

| Skill | Description |
|-------|-------------|
| research-data-analysis | EDA with 200+ scientific formats |
| research-literature | Multi-database literature search |
| research-statistics | Statistical testing and design |
| research-hypothesis | Hypothesis generation |
| research-critical | Bias detection and quality assessment |
| research-time-series | Temporal analysis and forecasting |
| research-simulation | Monte Carlo and agent-based models |
| research-visualization | Publication-quality figures |
| research-presentation | Slides and posters |
| research-writing | Academic writing assistance |

### Machine Learning Skills

| Skill | Description |
|-------|-------------|
| research-ml-classical | Traditional ML algorithms |
| research-ml-deep | Deep learning techniques |
| research-ml-reinforcement | Reinforcement learning |

### Utility Skills

| Skill | Description |
|-------|-------------|
| exploratory-data-analysis | General EDA workflow |

## Common Tasks

### Find all skills
```bash
find .pi/lib/skills -name "SKILL.md" -type f
```

### Validate a skill
```bash
head -30 .pi/lib/skills/{name}/SKILL.md
```

### Check skill references in agents
```bash
grep -r "skills:" .pi/extensions/
grep -r "skills:" .pi/agent-teams/
```

## Related Files

- `.pi/lib/skill-registry.ts` - Core implementation
- `.pi/extensions/subagents.ts` - Subagent integration
- `.pi/extensions/agent-teams.ts` - Team integration
- `.pi/lib/skills/templates/` - Skill creation templates
