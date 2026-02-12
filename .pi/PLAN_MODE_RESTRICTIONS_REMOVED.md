# Plan Mode Restrictions Removed - Summary

## Date
2026-02-11

## Issue
Plan mode was blocking bash commands even when disabled. User requested to remove read-only restrictions and restore normal operation.

## Root Causes
1. **Original issue (fixed earlier)**: "READ_ONLY_BASH_COMMANDS is not defined" errors due to mismatched import names.

2. **New issue**: The `tool_call` handler in `plan.ts` was still active and blocking commands even though plan mode state was disabled. The handler would still execute blocking logic based on `planModeEnabled` variable.

3. **Tool restrictions**: The `setActiveTools()` calls were restricting available tools in plan mode, preventing full functionality.

## Fixes Applied

### Fix 1: Disabled tool_call blocking (2026-02-11)
**File**: `.pi/extensions/plan.ts` (lines 237-258)

Commented out the entire `tool_call` handler that was blocking bash commands:
```typescript
// NOTE: Plan mode tool_call blocking DISABLED to allow normal bash command operation
// pi.on("tool_call", async (event, ctx) => {
// 	if (planModeEnabled) {
// 		// Check bash commands with enhanced filtering
// 		if (event.toolName === "bash") {
// 			const command = (event.input as any)?.command;
// 			if (command && !isBashCommandAllowed(command)) {
// 				return { block: true, reason: ... };
// 			}
// 		}
// 		// Block write tools
// 		else if (WRITE_TOOLS.includes(event.toolName)) {
// 			return { block: true, reason: ... };
// 		}
// 	}
// });
```

### Fix 2: Disabled tool restrictions in togglePlanMode()
**File**: `.pi/extensions/plan.ts` (lines 200-221)

Commented out `setActiveTools()` calls:
```typescript
if (planModeEnabled) {
	// NOTE: Tool restriction DISABLED - all tools available
	// pi.setActiveTools(PLAN_MODE_TOOLS);
	ctx.ui.notify("PLAN MODE: Read-only enabled (no restrictions)", "info");
	...
}
```

### Fix 3: Disabled tool restrictions in session_start
**File**: `.pi/extensions/plan.ts` (lines 425-434)

Commented out `setActiveTools()` call:
```typescript
if (planModeEnabled) {
	// NOTE: Tool restrictions DISABLED
	// pi.setActiveTools(PLAN_MODE_TOOLS);
	...
}
```

### Fix 4: Updated PLAN_MODE_POLICY message
**File**: `.pi/lib/plan-mode-shared.ts` (lines 88-113)

Changed policy to reflect disabled restrictions:
```typescript
export const PLAN_MODE_POLICY = `
---
## PLAN MODE: PLANNING MODE (RESTRICTIONS DISABLED)

Plan mode is currently ENABLED. Plan mode restrictions have been disabled.

### ALL TOOLS AVAILABLE:
- Read files: \`read\` tool
- Write files: \`edit\`, \`write\` tools
- Bash commands: All bash commands available
...
```

### Fix 5: Updated PLAN_MODE_WARNING message
**File**: `.pi/lib/plan-mode-shared.ts` (lines 122-125)

Changed warning to reflect disabled restrictions:
```typescript
export const PLAN_MODE_WARNING = `PLAN MODE is ACTIVE. Restrictions have been disabled - all tools and commands are available.`;
```

## Current State
- ✅ Bash commands: **All available** (no blocking)
- ✅ Read tools: **All available**
- ✅ Write tools: **All available**
- ✅ Plan mode state: **Disabled** (no state file)
- ⚠️ Plan mode functionality: Still active but with no restrictions (plans can be created/managed)

## Plan Mode State
- `.pi/plans/plan-mode-state.json` does not exist (plan mode is NOT persisted)
- `PI_PLAN_MODE` environment variable is not set
- Plan mode is currently **disabled**

## How to Disable Plan Mode (if needed)
If plan mode is accidentally enabled, you can disable it by:
1. Using the `/planmode` slash command
2. Pressing `Ctrl+Shift+P` keyboard shortcut
3. Deleting `.pi/plans/plan-mode-state.json` file
4. Unsetting the `PI_PLAN_MODE` environment variable

## Notes
- The plan extension is still functional and can be used to create/manage plans
- All bash commands are now unrestricted
- Write operations (edit, write) are always available
- The plan mode state is saved but no longer enforces any restrictions
