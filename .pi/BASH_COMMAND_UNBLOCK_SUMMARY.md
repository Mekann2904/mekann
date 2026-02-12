# Bash Command Blocking Removed - Summary

## Date
2026-02-11

## Issue
Bash commands were being blocked by multiple extensions enforcing read-only restrictions:
1. Plan mode restrictions in `.pi/extensions/plan.ts` (already commented out)
2. Delegation-first policy in `.pi/extensions/subagents.ts`
3. UL mode restrictions in `.pi/extensions/ul-dual-mode.ts`

## Root Cause
Two extensions were using the `isBashCommandAllowed()` function from `.pi/lib/plan-mode-shared.ts` to block bash commands:
- **subagents.ts**: Blocked "write-like" tools (bash with write commands, edit, write) if delegation wasn't used
- **ul-dual-mode.ts**: Blocked "write-like" tools if UL mode was active and both subagent/agent team runs weren't completed

## Changes Applied

### 1. `.pi/extensions/subagents.ts` (line ~1125)
**Commented out the tool_call blocking handler:**
```typescript
// NOTE: Delegation-first blocking DISABLED to allow normal bash command operation
// pi.on("tool_call", async (event, _ctx) => {
//   ...
// });
```

### 2. `.pi/extensions/ul-dual-mode.ts` (line ~202)
**Commented out the tool_call blocking handler:**
```typescript
// NOTE: UL mode blocking DISABLED to allow normal bash command operation
// pi.on("tool_call", async (event, ctx) => {
//   ...
// });
```

### 3. `.pi/extensions/plan.ts` (line ~328)
**Already commented out in previous fix:**
```typescript
// NOTE: Plan mode tool_call blocking DISABLED to allow normal bash command operation
```

## Trade-offs

### Before Changes
✅ Enforced delegation-first and UL mode policies
❌ Blocked bash commands that could modify files/system
❌ Required using delegation tools before direct edits

### After Changes
✅ All bash commands now work normally
✅ Direct edits can be made without delegation
❌ Delegation-first policy is no longer enforced at the tool level
❌ UL mode restrictions are no longer enforced at the tool level

## Verification
To verify that bash commands work normally, restart the pi session and try running any bash command:
- Read-only commands: `ls`, `grep`, `cat`, etc.
- Write commands: `echo`, `sed`, `git`, `npm`, etc.

## Reverting Changes
If you need to restore the blocking restrictions, uncomment the `pi.on("tool_call", ...)` handlers in:
1. `.pi/extensions/subagents.ts`
2. `.pi/extensions/ul-dual-mode.ts`
3. `.pi/extensions/plan.ts`

## Note on APPEND_SYSTEM.md
The `.pi/APPEND_SYSTEM.md` file still contains the "Delegation-First Policy (MANDATORY)" text. This represents the intended policy but is no longer enforced at the tool level due to these changes. The policy can still be followed voluntarily by the agent via system prompts.
