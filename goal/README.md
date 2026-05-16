# Goal Extension

Persistent thread-local goals with idle continuation, token/time budget tracking, and plan-mode integration for the pi coding agent.

## Features

- **Thread-local goals** — One active goal per session, persisted in the session branch.
- **Idle continuation** — When the agent finishes a turn and the goal is still active, automatically sends a continuation prompt to keep working.
- **Token/time budgets** — Optional token budget with automatic `budget_limited` status clamping.
- **Plan-mode integration** — Suppresses continuation while plan mode is active.
- **System prompt injection** — Active goal context is injected into the system prompt at `before_agent_start`.

## Commands

| Command | Description |
|---|---|
| `/goal <objective>` | Set a new goal (replaces existing after confirmation) |
| `/goal` | Show current goal status |
| `/goal edit` | Edit the objective via an editor |
| `/goal pause` | Pause the active goal |
| `/goal resume` | Resume a paused goal |
| `/goal clear` | Delete the goal |
| `/goal budget <n\|none>` | Set or clear token budget |

### Budget in objective

You can specify a token budget inline when setting a goal:

```
/goal --budget 10000 Refactor the authentication module
/goal Refactor the authentication module --budget 10000
```

## Model Tools

| Tool | Description |
|---|---|
| `get_goal` | Get the current goal status and remaining budget |
| `create_goal` | Create a new goal (fails if one already exists) |
| `update_goal` | Mark goal as `complete` (only status allowed) |

## Continuation Logic

When the agent ends a turn and the goal is still active:

1. Checks: feature enabled, session persisted, not in plan mode, agent idle, no pending messages.
2. **Continuation guard**: `continuation_count < max_continuations` (default max: 5).
3. **Cooldown**: At least 2 seconds since the last continuation.
4. Sends a hidden follow-up prompt to continue working.
5. Increments `continuation_count` and updates `last_continued_at_ms`.
6. When `max_continuations` is reached, the goal is automatically **paused** and the user is notified.

## Architecture

```
state.ts      — Goal data model, GoalStore (pure state, no pi API)
prompts.ts    — Prompt templates (escaping, continuation, budget, context)
render.ts     — UI rendering (widget, summary, no-goal message)
runtime.ts    — Lifecycle management (accounting, continuation, budget steering)
index.ts      — Extension entry point (commands, tools, event handlers)
```

## Status Values

| Status | Meaning |
|---|---|
| `active` | Goal is in progress |
| `paused` | Goal is paused (user or max continuations reached) |
| `budget_limited` | Token budget exhausted |
| `complete` | Objective achieved |
