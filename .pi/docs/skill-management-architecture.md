# Skill Management Architecture

## Overview

This document describes the technical architecture of the skill management system used in this Pi-based project. Skills are reusable, specialized instruction modules that can be dynamically loaded and assigned to subagents and agent team members.

**Document Version:** 1.1.0
**Last Updated:** 2026-02-14

## Design Principles

1. **Explicit over implicit**: Skills are opt-in, not auto-loaded
2. **Declarative structure**: YAML frontmatter + Markdown body
3. **Composable inheritance**: Parent skills cascade to children
4. **Project isolation**: Project skills override global skills
5. **Lazy loading**: Skills are loaded on-demand when referenced
6. **Separation of concerns**: `.pi/skills/` (reserved) vs `.pi/lib/skills/` (active)

## Directory Structure

```
.pi/
├── skills/                 # Reserved, kept empty to avoid Pi auto-loading
│   └── (unused)           # See rationale below
│
├── lib/
│   ├── skill-registry.ts  # Core skill resolution engine
│   └── skills/            # Project-level skill definitions
│       ├── research-data-analysis/
│       │   ├── SKILL.md       # Skill definition with frontmatter
│       │   ├── references/    # Supporting documentation
│       │   ├── scripts/       # Executable scripts
│       │   └── assets/        # Static resources
│       ├── research-literature/
│       ├── research-statistics/
│       └── ... (14 total research skills)
│
└── extensions/
    ├── subagents.ts       # Subagent skill integration
    └── agent-teams.ts     # Team member skill integration
```

### Why .pi/skills/ is Empty

Pi's core system automatically loads skills from `.pi/skills/` as global prompt extensions. This is undesirable for our use case because:

1. Skills should be **assigned explicitly** to agents, not globally injected
2. Global injection causes prompt bloat and context pollution
3. The skill-registry provides **fine-grained control** over skill assignment

The `.pi/lib/skills/` directory bypasses auto-loading while keeping skills under version control.

## Core Components

### 1. skill-registry.ts

Location: `.pi/lib/skill-registry.ts`

The central module responsible for:

- **Skill discovery**: Scan `.pi/lib/skills/` and global skill directories
- **Skill resolution**: Match skill references to loaded definitions
- **Skill merging**: Handle inheritance between parent and child skills
- **Prompt formatting**: Generate XML sections for prompt injection

#### Key Functions

```typescript
// Resolve skills by name/path
function resolveSkills(
  references: SkillReference[],
  options: ResolveSkillsOptions,
): ResolveSkillsResult

// Merge parent and child skills with inheritance rules
function mergeSkills(
  config: SkillMergeConfig,
  options: ResolveSkillsOptions,
): ResolveSkillsResult

// Format resolved skills for prompt injection
function formatSkillsForPrompt(skills: ResolvedSkill[]): string

// Load skills for subagent/team member
function loadSkillsForAgent(
  skillReferences: SkillReference[],
  parentSkillReferences: SkillReference[],
  cwd: string,
): { promptSection: string; skills: ResolvedSkill[]; errors: string[] }
```

### 2. Skill Definition Format

Each skill is defined in a `SKILL.md` file with YAML frontmatter:

```yaml
---
name: skill-name              # Required: Unique identifier
description: Short desc       # Required: Used in skill listing
allowed-tools: [Read, Bash]   # Optional: Tool restrictions
license: MIT license          # Optional: License info
metadata:
  skill-author: "Author"
  reference: "https://..."
---

# Skill Title

> **Optional:** Integration notes

## Overview

Detailed skill description and instructions...

## Workflow

Step-by-step guidance...

## References

- reference.md: Description
```

### 3. Skill Resolution Flow

```
Agent Request
     │
     ▼
┌─────────────────────────────┐
│ 1. Merge skill references   │
│    parentSkills + childSkills│
└─────────────────────────────┘
     │
     ▼
┌─────────────────────────────┐
│ 2. Build skill index        │
│    project + global paths   │
└─────────────────────────────┘
     │
     ▼
┌─────────────────────────────┐
│ 3. Resolve each skill ref   │
│    by name → SKILL.md       │
└─────────────────────────────┘
     │
     ▼
┌─────────────────────────────┐
│ 4. Load skill content       │
│    parse frontmatter        │
└─────────────────────────────┘
     │
     ▼
┌─────────────────────────────┐
│ 5. Format for prompt        │
│    <available_skills> XML   │
└─────────────────────────────┘
     │
     ▼
  Prompt Section
```

## Skill Inheritance Model

### Subagent Skill Inheritance

```
Lead Agent
    │
    ├── parentSkills: ["research-data-analysis"]
    │
    ▼
Subagent Definition
    │
    ├── skills: ["research-statistics"]  // Override or merge
    │
    ▼
Effective Skills: ["research-data-analysis", "research-statistics"]
```

**Merge Logic** (subagents.ts, lines 964-993, inline implementation):
```typescript
function mergeSkillArrays(base: string[] | undefined, override: string[] | undefined): string[] | undefined { ... }

function resolveEffectiveSkills(
  agent: SubagentDefinition,
  parentSkills?: string[],
): string[] | undefined {
  return mergeSkillArrays(parentSkills, agent.skills);
}
```

### Team Member Skill Inheritance

```
Team Definition
    │
    ├── commonSkills: ["research-literature"]
    │
    ▼
Team Member
    │
    ├── skills: ["research-critical"]  // Member-specific
    │
    ▼
Effective Skills: ["research-literature", "research-critical"]
```

### Inheritance Rules

1. **Undefined vs Empty Array**
   - `undefined`: Inherit from parent
   - `[]`: No skills (empty override)

2. **Merge Strategy**
   - `merge` (default): Combine parent + child
   - `replace`: Use only child skills

3. **Deduplication**
   - Skills referenced multiple times are loaded once
   - First occurrence wins for conflicts

## Integration Points

### Current Implementation Status

**IMPORTANT**: As of 2026-02-14, `skill-registry.ts` is NOT integrated with `subagents.ts` or `agent-teams.ts`. Both extensions have their own inline implementations for skill handling.

The `skill-registry.ts` module is available for future integration but is currently unused. The documentation below describes the actual implementation in each extension.

### subagents.ts Integration

Location: `.pi/extensions/subagents.ts` (lines 964-1024)

```typescript
// Inline implementation (not imported from skill-registry.ts)
function mergeSkillArrays(base: string[] | undefined, override: string[] | undefined): string[] | undefined { ... }
function resolveEffectiveSkills(agent: SubagentDefinition, parentSkills?: string[]): string[] | undefined { ... }
function formatSkillsSection(skills: string[] | undefined): string | null { ... }

// In buildSubagentPrompt (lines 1017-1024)
function buildSubagentPrompt(input: {
  agent: SubagentDefinition;
  task: string;
  extraContext?: string;
  enforcePlanMode?: boolean;
  parentSkills?: string[];
}): string {
  // Resolve effective skills
  const effectiveSkills = resolveEffectiveSkills(input.agent, input.parentSkills);
  const skillsSection = formatSkillsSection(effectiveSkills);
  if (skillsSection) {
    lines.push("");
    lines.push("Assigned skills:");
    lines.push(skillsSection);  // Uses list format: "- skill-name"
  }
  // ...
}
```

### agent-teams.ts Integration

Location: `.pi/extensions/agent-teams.ts` (lines 2173-2238)

Team members can receive skills through:
1. Team-level common skills (shared by all members)
2. Member-specific skills (individual specialization)

```typescript
// Inline implementation (not imported from skill-registry.ts)
function mergeSkillArrays(base: string[] | undefined, override: string[] | undefined): string[] | undefined { ... }
function resolveEffectiveTeamMemberSkills(team: TeamDefinition, member: TeamMember): string[] | undefined { ... }
function formatTeamMemberSkillsSection(skills: string[] | undefined): string | null { ... }
```

## Search Path Priority

Skills are resolved in this order (first match wins):

1. **Project-local**: `.pi/lib/skills/{name}/SKILL.md`
2. **Global**: `~/.pi/agent/skills/{name}/SKILL.md`
3. **Environment override**: `PI_CODING_AGENT_DIR` if set

```typescript
function getSkillSearchPaths(cwd: string, agentDir?: string): string[] {
  return [
    join(cwd, ".pi", "lib", "skills"),      // Project-local
    join(agentDir, "skills"),               // Global
  ];
}
```

## Prompt Injection Format

### Current Implementation (subagents.ts / agent-teams.ts)

Skills are injected into agent prompts as a simple list format:

```
Assigned skills:
- research-data-analysis
- research-statistics
```

For team members (Japanese locale):

```
割り当てスキル:
- research-data-analysis
- research-statistics
```

**Note**: The `skill-registry.ts` module provides an alternative XML format via `formatSkillsForPrompt()`, but this is not currently used by subagents or agent teams.

### skill-registry.ts Format (Alternative, Not Used)

The skill-registry module provides XML formatting:

```xml
<available_skills>
  <skill>
    <name>research-data-analysis</name>
    <description>Comprehensive EDA with 200+ formats...</description>
    <location>/path/to/.pi/lib/skills/research-data-analysis/SKILL.md</location>
  </skill>
</available_skills>
```

This format could be adopted in future for richer skill information in prompts.

## Error Handling

| Error Type | Cause | Resolution |
|------------|-------|------------|
| `Skill not found` | Reference to non-existent skill | Check skill name, verify file exists |
| `Skill missing name` | Frontmatter without `name` field | Add required frontmatter |
| `Skill content is empty` | SKILL.md has no body | Add skill instructions |
| `Duplicate skill reference` | Same skill listed twice | Deduplication handled automatically |

## Performance Considerations

1. **Lazy Loading**: Skills are loaded on-demand, not at startup
2. **Caching**: Skill index is built once per resolution batch
3. **Content Size**: Skill files should be kept focused (< 20KB recommended)
4. **Resolution Speed**: O(n) for n skill references, typically < 10ms

## Security Considerations

1. **Path Traversal**: Skill paths are validated, no `../` allowed
2. **File Access**: Only `.md` files in designated directories
3. **Tool Restrictions**: Skills can specify `allowed-tools` to limit capabilities

---

## Operational Guidelines

### Directory Usage Policy

| Directory | Purpose | Auto-loaded by Pi | Used By |
|-----------|---------|-------------------|---------|
| `.pi/skills/` | Reserved (keep empty) | Yes | None (avoid) |
| `.pi/lib/skills/` | Project-level skills | No | skill-registry.ts |
| `~/.pi/agent/skills/` | Global skills | No | skill-registry.ts |

**Why .pi/skills/ is Empty:**
Pi's core system automatically loads skills from `.pi/skills/` as global prompt extensions. This causes:
- Prompt bloat and context pollution
- Loss of fine-grained skill assignment control
- Unintended behavior when skills conflict

The `.pi/lib/skills/` directory bypasses auto-loading while keeping skills under version control.

### Adding New Skills

#### Step 1: Create Skill Directory

```bash
mkdir -p .pi/lib/skills/my-skill/{scripts,references,assets}
```

#### Step 2: Create SKILL.md

Use the template system:

```bash
cd .pi/lib/skills/templates
./create-skill.sh my-skill "Short description of the skill" --with-all
```

Or manually:

```bash
cp .pi/lib/skills/templates/SKILL-TEMPLATE.md ../my-skill/SKILL.md
# Edit frontmatter and content
```

#### Step 3: Validate Frontmatter

Required fields:
- `name`: Must match directory name (lowercase, hyphens, 1-64 chars)
- `description`: Brief description (max 1024 chars)

```yaml
---
name: my-skill
description: Short description here.
license: MIT
metadata:
  skill-version: "1.0.0"
  created: "2026-02-14"
  skill-author: "Your Name"
---
```

#### Step 4: Test Skill Loading

```bash
# Use subagent_list to verify skill is discoverable
pi> subagent_list

# Test with a subagent
pi> subagent_run task="test task" subagentId="implementer"
# The skill will be listed in available_skills if assigned
```

### Assigning Skills to Agents

#### Subagent Skill Assignment

Skills are assigned in `.pi/extensions/subagents/storage.ts`:

```typescript
const agent: SubagentDefinition = {
  id: "researcher",
  name: "Researcher",
  description: "Research and analysis agent",
  systemPrompt: "...",
  skills: ["research-literature", "research-statistics"],  // Assign here
  enabled: "enabled",
};
```

#### Team Member Skill Assignment

Skills are assigned in team definition markdown files:

```yaml
---
id: analysis-team
name: Analysis Team
members:
  - id: statistician
    role: Statistical Analyst
    skills:  # Member-specific skills
      - research-statistics
      - research-visualization
---
```

#### Inheritance Patterns

```
Pattern 1: Single Skill
  parentSkills: undefined
  agent.skills: ["skill-a"]
  Result: ["skill-a"]

Pattern 2: Inherited + Own
  parentSkills: ["skill-a"]
  agent.skills: ["skill-b"]
  Result: ["skill-a", "skill-b"]

Pattern 3: Override (use empty array)
  parentSkills: ["skill-a"]
  agent.skills: []
  Result: []

Pattern 4: Replace All
  parentSkills: ["skill-a"]
  agent.skills: ["skill-b", "skill-c"]
  Result: ["skill-b", "skill-c"]  // Deduplicated
```

### Skill Categories and Selection Guide

| Task Type | Recommended Skills |
|-----------|-------------------|
| Data exploration | `exploratory-data-analysis`, `research-data-analysis` |
| Literature review | `research-literature`, `research-critical` |
| Statistical analysis | `research-statistics`, `research-time-series` |
| Machine learning | `research-ml-classical`, `research-ml-deep`, `research-ml-reinforcement` |
| Visualization | `research-visualization` |
| Writing | `research-writing`, `research-presentation` |
| Simulation | `research-simulation` |
| Hypothesis testing | `research-hypothesis`, `research-critical` |

### Troubleshooting

| Symptom | Cause | Solution |
|---------|-------|----------|
| Skill not loaded | Invalid frontmatter | Check `name` and `description` fields |
| Skill not found | Typo in skill name | Verify skill name matches directory name |
| Duplicate content | Skill in both project and global | Remove from global or rename |
| Prompt too long | Too many skills assigned | Reduce to essential skills only |
| Skill content outdated | Old cached version | Clear skill cache (restart Pi) |

### Best Practices

1. **Keep skills focused**: Each skill should do one thing well
2. **Use inheritance wisely**: Assign common skills at team level
3. **Document thoroughly**: Include examples and troubleshooting
4. **Test assignments**: Verify skills load correctly before deployment
5. **Version control**: Track skill changes in git
6. **Size limit**: Keep SKILL.md under 20KB for performance

---

## Appendix: Current Skill Inventory

| Skill Name | Category | Description |
|------------|----------|-------------|
| research-data-analysis | Core | EDA with 200+ scientific formats |
| research-literature | Literature | Multi-database search, citation management |
| research-statistics | Statistics | Statistical analysis and testing |
| research-hypothesis | Research | Hypothesis generation and validation |
| research-critical | Critical | Critical analysis and bias detection |
| research-ml-classical | ML | Classical ML algorithms |
| research-ml-deep | ML | Deep learning techniques |
| research-ml-reinforcement | ML | Reinforcement learning |
| research-time-series | Analysis | Time series analysis |
| research-simulation | Simulation | Monte Carlo, agent-based models |
| research-visualization | Visualization | Publication-quality figures |
| research-presentation | Communication | Slide and poster creation |
| research-writing | Writing | Academic writing assistance |
| exploratory-data-analysis | Analysis | General EDA workflow |

See `.pi/docs/skill-guide.md` for detailed usage instructions.
