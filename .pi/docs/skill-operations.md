# Skill Operations Guide

**Version:** 1.0.0
**Last Updated:** 2026-02-14

This document provides step-by-step procedures for operating and maintaining the skill management system.

---

## Table of Contents

1. [Adding a New Skill](#adding-a-new-skill)
2. [Assigning Skills to Agents](#assigning-skills-to-agents)
3. [Managing Directory Structure](#managing-directory-structure)
4. [Validating Skills](#validating-skills)
5. [Troubleshooting Procedures](#troubleshooting-procedures)
6. [Migration and Updates](#migration-and-updates)

---

## Adding a New Skill

### Prerequisites
- Access to `.pi/lib/skills/` directory
- Understanding of skill purpose and scope
- Required Python libraries identified

### Procedure

#### Step 1: Plan the Skill

Before creating, answer:
1. What is the single purpose of this skill?
2. What file formats or data types does it handle?
3. What are the required Python libraries?
4. How does it relate to existing skills?

#### Step 2: Create Directory Structure

```bash
# Navigate to skills directory
cd .pi/lib/skills

# Create skill directory with subdirectories
mkdir -p my-skill/{scripts,references,assets}
```

Expected structure:
```
.pi/lib/skills/my-skill/
├── SKILL.md           # Required: Main skill definition
├── scripts/           # Optional: Helper scripts
├── references/        # Optional: Detailed documentation
└── assets/            # Optional: Templates and resources
```

#### Step 3: Create SKILL.md

**Option A: Use Template Script**

```bash
cd templates
./create-skill.sh my-skill "Brief description of skill purpose" --with-all
```

**Option B: Manual Creation**

```bash
cp templates/SKILL-TEMPLATE.md ../my-skill/SKILL.md
```

Edit `SKILL.md`:

```yaml
---
name: my-skill                           # Must match directory name
description: One-line description here.  # Required, max 1024 chars
license: MIT
metadata:
  skill-version: "1.0.0"
  created: "2026-02-14"
  skill-author: "Your Name"
  categories: category1,category2
---

# My Skill

## Overview

Detailed description of the skill...

## When to Use

- Use case 1
- Use case 2

## Workflow

### Step 1: ...

### Step 2: ...

## Examples

...

## Troubleshooting

...
```

#### Step 4: Add Supporting Files (Optional)

**Reference Document** (`references/my-skill-reference.md`):
```markdown
# My Skill Reference

## Technical Details
...
```

**Helper Script** (`scripts/my-skill.py`):
```python
#!/usr/bin/env python3
"""Helper script for my-skill."""
import argparse

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("input")
    args = parser.parse.parse_args()
    # Implementation...

if __name__ == "__main__":
    main()
```

**Asset Template** (`assets/my-skill-template.md`):
```markdown
# Output Template

## {TITLE}
...
```

#### Step 5: Validate the Skill

```bash
# Check file structure
ls -la .pi/lib/skills/my-skill/

# Validate frontmatter
head -15 .pi/lib/skills/my-skill/SKILL.md

# Verify name matches directory
grep "^name:" .pi/lib/skills/my-skill/SKILL.md
```

#### Step 6: Test Skill Loading

```bash
# Start Pi and run subagent_list to verify discovery
pi
> subagent_list
```

The skill should appear in available skills if assigned to a subagent.

---

## Assigning Skills to Agents

### Subagent Skill Assignment

**File:** `.pi/extensions/subagents/storage.ts`

#### Method 1: Default Agent Definition

Add `skills` field to agent definition:

```typescript
const defaultAgents: SubagentDefinition[] = [
  {
    id: "researcher",
    name: "Researcher",
    description: "Literature review and research agent",
    systemPrompt: `...`,
    skills: ["research-literature", "research-critical"],  // <-- Add here
    enabled: "enabled",
    createdAt: nowIso,
    updatedAt: nowIso,
  },
];
```

#### Method 2: Via subagent_create Tool

```typescript
pi> subagent_create
  name="Data Analyst"
  description="Statistical analysis specialist"
  systemPrompt="You are a statistical analysis expert..."
  // Note: skills cannot be set via tool, must edit storage.ts
```

#### Method 3: Runtime Assignment (Parent Skills)

When calling `subagent_run` or `subagent_run_parallel`, the lead agent can pass parent skills:

```typescript
// In subagents.ts, skill inheritance:
const effectiveSkills = resolveEffectiveSkills(
  agent,
  parentSkills  // Passed from lead agent
);
```

### Team Member Skill Assignment

**File:** `.pi/agent-teams/definitions/*.md`

#### Team-Level Common Skills

Define in team frontmatter:

```yaml
---
id: analysis-team
name: Analysis Team
description: Multi-disciplinary analysis team
enabled: enabled
members:
  - id: statistician
    role: Statistical Analyst
    description: Performs statistical analysis
    skills:                    # Member-specific skills
      - research-statistics
      - research-visualization
  - id: reviewer
    role: Critical Reviewer
    description: Reviews and validates results
    skills:
      - research-critical
---
```

#### Inheritance Pattern

```
Team Definition
    │
    ├── (future: commonSkills in frontmatter)
    │
    ▼
Member A: ["skill-1", "skill-2"]
    │
    ▼
Effective: ["skill-1", "skill-2"]
```

---

## Managing Directory Structure

### Directory Purpose Reference

| Path | Purpose | Auto-loaded | Content |
|------|---------|-------------|---------|
| `.pi/skills/` | Reserved | Yes | Keep empty |
| `.pi/lib/skills/` | Project skills | No | Active skill definitions |
| `.pi/lib/skills/templates/` | Templates | No | Skill creation templates |
| `~/.pi/agent/skills/` | Global skills | No | Shared across projects |

### Maintaining .pi/skills/ (Reserved)

**CRITICAL:** Keep `.pi/skills/` empty or delete it.

```bash
# Check if directory exists and has content
ls -la .pi/skills/

# If it has files, remove them (they will be auto-loaded)
rm -rf .pi/skills/*

# Or delete the directory entirely
rm -rf .pi/skills/
```

**Rationale:** Pi automatically loads all skills from `.pi/skills/` as global prompt extensions, causing:
- Prompt bloat
- Loss of fine-grained control
- Unpredictable behavior

### Organizing .pi/lib/skills/

**Naming Conventions:**
- Lowercase letters only
- Hyphens for word separation
- 1-64 characters
- Descriptive of purpose

**Good names:**
- `research-statistics`
- `data-validation`
- `figure-generation`

**Bad names:**
- `Research_Statistics` (uppercase, underscore)
- `stats` (too short, ambiguous)
- `research-statistical-analysis-extended-v2` (too long)

**Directory Structure Pattern:**

```
.pi/lib/skills/
├── templates/              # Creation templates
│   ├── create-skill.sh
│   ├── SKILL-TEMPLATE.md
│   ├── REFERENCE-TEMPLATE.md
│   ├── ASSET-TEMPLATE.md
│   └── SCRIPT-TEMPLATE.py
│
├── research-*/             # Research skills (14 total)
│   ├── SKILL.md
│   ├── scripts/
│   ├── references/
│   └── assets/
│
└── [custom-skills]/        # Your custom skills
    └── ...
```

---

## Validating Skills

### Manual Validation Checklist

- [ ] Directory name matches skill `name` in frontmatter
- [ ] Frontmatter has required fields: `name`, `description`
- [ ] Description is under 1024 characters
- [ ] Name is 1-64 characters, lowercase, hyphens only
- [ ] SKILL.md has content beyond frontmatter
- [ ] Relative paths in markdown use correct syntax

### Validation Commands

```bash
# Check all skill directories have SKILL.md
for dir in .pi/lib/skills/*/; do
  if [ ! -f "${dir}SKILL.md" ]; then
    echo "Missing SKILL.md: $dir"
  fi
done

# Verify frontmatter names match directories
for dir in .pi/lib/skills/*/; do
  dirname=$(basename "$dir")
  skillname=$(grep "^name:" "${dir}SKILL.md" | head -1 | cut -d: -f2 | tr -d ' ')
  if [ "$dirname" != "$skillname" ]; then
    echo "Mismatch: dir=$dirname name=$skillname"
  fi
done

# Check description length
for file in .pi/lib/skills/*/SKILL.md; do
  desc=$(grep "^description:" "$file" | cut -d: -f2-)
  len=${#desc}
  if [ $len -gt 1024 ]; then
    echo "Description too long ($len): $file"
  fi
done
```

### Common Validation Errors

| Error | Cause | Fix |
|-------|-------|-----|
| "Skill missing name" | No `name` in frontmatter | Add `name: skill-name` |
| "Skill missing description" | No `description` in frontmatter | Add `description: ...` |
| "Skill not found" | Name doesn't match directory | Rename directory or frontmatter |
| "Duplicate skill" | Same skill in project and global | Remove from global |

---

## Troubleshooting Procedures

### Skill Not Loading

**Symptoms:**
- Skill not in available_skills list
- Warning: "Skill not found"

**Diagnostic Steps:**

1. Check file exists:
   ```bash
   ls -la .pi/lib/skills/my-skill/SKILL.md
   ```

2. Verify frontmatter:
   ```bash
   head -20 .pi/lib/skills/my-skill/SKILL.md
   ```

3. Check name matches:
   ```bash
   grep "^name:" .pi/lib/skills/my-skill/SKILL.md
   ```

4. Verify directory is in search path:
   - Project: `.pi/lib/skills/`
   - Global: `~/.pi/agent/skills/`

**Resolution:**
- Add missing frontmatter fields
- Fix name/directory mismatch
- Move skill to correct directory

### Skill Content Not Loading

**Symptoms:**
- Skill appears in list but content is empty
- Warning: "Skill content is empty"

**Diagnostic Steps:**

1. Check file has content after frontmatter:
   ```bash
   tail -n +10 .pi/lib/skills/my-skill/SKILL.md | head -20
   ```

2. Verify frontmatter is properly terminated:
   ```bash
   head -10 .pi/lib/skills/my-skill/SKILL.md
   # Should see "---" at start and end of frontmatter
   ```

**Resolution:**
- Add content after frontmatter
- Fix malformed frontmatter (missing closing `---`)

### Skills Causing Prompt Bloat

**Symptoms:**
- Agent responses cut short
- Token limit errors
- Slow response times

**Diagnostic Steps:**

1. Check skill file sizes:
   ```bash
   find .pi/lib/skills -name "SKILL.md" -exec wc -c {} \; | sort -n
   ```

2. Check total skill content size:
   ```bash
   find .pi/lib/skills -name "SKILL.md" -exec cat {} \; | wc -c
   ```

3. Review assigned skills count per agent

**Resolution:**
- Reduce skill file sizes (< 20KB each)
- Assign fewer skills per agent
- Split large skills into focused smaller ones

### Library Import Errors

**Symptoms:**
- ImportError when using skill scripts
- "No module named X" errors

**Diagnostic Steps:**

1. Check required libraries:
   ```bash
   grep -A 20 "```bash" .pi/lib/skills/my-skill/SKILL.md | grep "pip install"
   ```

2. Verify installation:
   ```bash
   python -c "import library_name"
   ```

**Resolution:**
- Install missing libraries:
  ```bash
  uv pip install required-library
  ```

---

## Migration and Updates

### Updating an Existing Skill

**Procedure:**

1. Create backup:
   ```bash
   cp -r .pi/lib/skills/my-skill .pi/lib/skills/my-skill.bak
   ```

2. Edit SKILL.md:
   ```bash
   vim .pi/lib/skills/my-skill/SKILL.md
   ```

3. Update version in metadata:
   ```yaml
   metadata:
     skill-version: "1.1.0"  # Increment
     updated: "2026-02-14"
   ```

4. Validate and test

5. Remove backup if successful:
   ```bash
   rm -rf .pi/lib/skills/my-skill.bak
   ```

### Migrating Skills Between Projects

**Export:**
```bash
# Copy skill directory
cp -r .pi/lib/skills/my-skill /path/to/target/.pi/lib/skills/
```

**Import:**
```bash
# Verify no conflicts
ls /target/project/.pi/lib/skills/

# Copy to target
cp -r /source/.pi/lib/skills/my-skill /target/.pi/lib/skills/
```

### Deprecating a Skill

**Procedure:**

1. Add deprecation notice:
   ```markdown
   ---
   name: deprecated-skill
   description: "[DEPRECATED] Use new-skill instead. ..."
   ---

   # Deprecated Skill

   > **DEPRECATED:** This skill is deprecated. Use [new-skill](../new-skill/) instead.
   ```

2. Update agent assignments to use replacement

3. After transition period, remove:
   ```bash
   rm -rf .pi/lib/skills/deprecated-skill
   ```

---

## Quick Reference Commands

```bash
# List all skills
ls -la .pi/lib/skills/

# Find skill by name
find .pi/lib/skills -name "SKILL.md" -exec grep -l "name: target-skill" {} \;

# Count skills
ls -d .pi/lib/skills/*/ | grep -v templates | wc -l

# Validate all frontmatter names
for f in .pi/lib/skills/*/SKILL.md; do
  dir=$(basename $(dirname "$f"))
  name=$(grep "^name:" "$f" | head -1 | awk '{print $2}')
  echo "$dir -> $name"
done

# Check skill sizes
find .pi/lib/skills -name "SKILL.md" -exec sh -c 'echo "$(wc -c < "$1") $1"' _ {} \; | sort -n
```

---

*For architecture details, see `.pi/docs/skill-management-architecture.md`*
*For skill usage, see `.pi/docs/skill-guide.md`*
