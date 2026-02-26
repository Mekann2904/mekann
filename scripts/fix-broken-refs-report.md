# Reference Fixer Report

## Summary

Fixed broken internal references in Markdown documentation files.

## Changes Made

### File: `docs/02-user-guide/14-invariant-pipeline.md`

Two references were fixed:

1. **Line 291**: `../.pi/skills/invariant-generation/SKILL.md` → `../../.pi/skills/invariant-generation/SKILL.md`
   - Reason: File is in `docs/02-user-guide/` subdirectory, needs `../../` to reach project root

2. **Line 292**: `../.pi/agent-teams/definitions/invariant-generation-team/team.md` → `../../.pi/extensions/agent-teams/definitions/invariant-generation-team/team.md`
   - Reason 1: File is in `docs/02-user-guide/` subdirectory, needs `../../` to reach project root
   - Reason 2: The correct path is `.pi/extensions/agent-teams/` not `.pi/agent-teams/`

## Pattern Identified

The fixer script identifies and fixes the following pattern:

- **docs/*.md** (root level): Use `../.pi/` (correct, goes up one level to root)
- **docs/XX-*/** (subdirectories): Use `../../.pi/` (goes up two levels to root)

## Script Created

`scripts/fix-broken-refs.ts` - Automated reference fixer script that:
- Scans all Markdown files in the `docs/` directory
- Identifies references using `../.pi/` pattern in subdirectories
- Calculates the correct relative path based on file location
- Verifies that fixed paths exist before applying changes
- Supports dry-run mode for testing

## Verification

All fixed references have been verified to point to existing files:
- `../../.pi/skills/invariant-generation/SKILL.md` ✓
- `../../.pi/extensions/agent-teams/definitions/invariant-generation-team/team.md` ✓

## Related Files

- `scripts/fix-broken-refs.ts` - Reference fixer script
- `docs/02-user-guide/14-invariant-pipeline.md` - Fixed file

## Usage

To run the fixer script:

```bash
# Dry run (no changes)
npx tsx scripts/fix-broken-refs.ts --dry-run

# Apply fixes
npx tsx scripts/fix-broken-refs.ts
```
