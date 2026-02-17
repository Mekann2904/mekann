# Shared Extension Utilities

This directory contains shared utility modules used across multiple extensions in `.pi/extensions/`.

## Modules

### runtime-helpers.ts

Runtime-related utilities for consistent behavior across subagents and agent-teams.

#### Functions

| Function | Description | Used By |
|----------|-------------|---------|
| `refreshRuntimeStatus` | UI status display for runtime state | subagents.ts, agent-teams.ts |
| `buildRuntimeLimitError` | Error message for runtime limit conditions | subagents.ts, agent-teams.ts |
| `buildRuntimeQueueWaitError` | Error message for queue wait conditions | subagents.ts, agent-teams.ts |
| `startReservationHeartbeat` | Keep reservation alive during long operations | subagents.ts, agent-teams.ts |

#### Usage Pattern

Extensions typically wrap `refreshRuntimeStatus` with module-specific defaults:

```typescript
// In subagents.ts
import { refreshRuntimeStatus as sharedRefreshRuntimeStatus } from "./shared/runtime-helpers.js";

function refreshRuntimeStatus(ctx: any): void {
  const snapshot = getRuntimeSnapshot();
  sharedRefreshRuntimeStatus(
    ctx,
    "subagent-runtime",
    "Sub",
    snapshot.subagentActiveAgents,
    "Team",
    snapshot.teamActiveAgents,
  );
}
```

```typescript
// In agent-teams.ts
import { refreshRuntimeStatus as sharedRefreshRuntimeStatus } from "./shared/runtime-helpers.js";

function refreshRuntimeStatus(ctx: any): void {
  const snapshot = getRuntimeSnapshot();
  sharedRefreshRuntimeStatus(
    ctx,
    "agent-team-runtime",
    "Team",
    snapshot.teamActiveAgents,
    "Sub",
    snapshot.subagentActiveAgents,
  );
}
```

### pi-print-executor.ts

Executor for pi-print command integration. Handles parallel execution and output processing.

### verification-hooks.ts

Verification workflow hooks for the Inspector/Challenger pattern. Used by subagent and agent-team execution pipelines.

## Design Principles

1. **Single Source of Truth**: Shared logic lives here, not duplicated across extensions.
2. **Explicit Imports**: Extensions import with aliases (e.g., `as sharedRefreshRuntimeStatus`) to avoid name conflicts with local wrappers.
3. **Wrapper Pattern**: Extensions may wrap shared functions with module-specific defaults while delegating core logic to shared implementations.

## Adding New Shared Utilities

When adding a new utility:

1. Ensure it's genuinely used by 2+ extensions
2. Add JSDoc documentation
3. Update this README with the function and its usage
4. Consider type safety for the `ctx` parameter if it's too loosely typed
