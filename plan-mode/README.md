# Plan Mode Extension

Codex-inspired plan mode that separates code analysis/planning from implementation, with separate model selection for each phase.

## Features

- **Plan Mode**: Read-only exploration — analyze code, understand architecture, create plans
- **Execute Mode**: Full tool access — implement the plan step by step
- **Separate Models**: Different models for plan and execute phases (e.g., reasoning model for planning, code model for execution)
- **Model Selector**: Pi-style model selection UI for each mode
- **Progress Tracking**: Widget shows step completion during execution
- **Session Persistence**: State and model selections survive restarts

## Installation

Place in `~/.pi/agent/extensions/plan-mode/` or `.pi/extensions/plan-mode/`.

Or add to `settings.json`:
```json
{
  "extensions": ["/path/to/plan-mode"]
}
```

## Commands

| Command | Description |
|---------|-------------|
| `/plan` | Toggle plan mode on/off |
| `/plan-model` | Select model for plan mode (pi-style selector) |
| `/exec-model` | Select model for execution mode (pi-style selector) |
| `/todos` | Show current plan progress |

## Shortcuts

| Shortcut | Description |
|----------|-------------|
| `Ctrl+Alt+P` | Toggle plan mode |

## CLI Flag

```bash
pi --plan              # Start in plan mode
pi --plan -e ./plan-mode  # With explicit extension
```

## Configuration

Create `~/.pi/agent/plan-mode.json` (global) or `.pi/plan-mode.json` (project-local):

```json
{
  "planModel": {
    "provider": "openai",
    "modelId": "o3"
  },
  "execModel": {
    "provider": "anthropic",
    "modelId": "claude-sonnet-4-5"
  },
  "planTools": ["read", "bash", "grep", "find", "ls"],
  "execTools": ["read", "bash", "edit", "write"]
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `planModel` | `{provider, modelId}` | — | Model to use in plan mode |
| `execModel` | `{provider, modelId}` | — | Model to use in execute mode |
| `planTools` | `string[]` | `["read","bash","grep","find","ls"]` | Tools available in plan mode |
| `execTools` | `string[]` | `["read","bash","edit","write"]` | Tools available in execute mode |

If models are not configured in the file, use `/plan-model` and `/exec-model` to select them interactively.

## Workflow

1. Enable plan mode: `/plan` or `Ctrl+Alt+P`
2. Optionally set plan model: `/plan-model` → select from available models
3. Ask the agent to analyze code and create a plan
4. The agent outputs a structured numbered plan:

```
Plan:
1. Analyze the authentication module
2. Identify all password validation rules
3. Map out the database schema changes needed
4. Plan the API endpoint modifications
```

5. After the plan is complete, choose "Execute the plan"
6. The model switches to the execution model automatically
7. Agent executes steps, marking them with `[DONE:n]` tags
8. Progress widget shows completion status

## Model Selection

The `/plan-model` and `/exec-model` commands open a model selector that matches pi's built-in `/model` experience:

- All available models listed, grouped by provider
- Current selection highlighted with ●
- Type to filter, arrow keys to navigate
- Enter to select, Escape to cancel

When switching between plan and execute modes, the model changes automatically to the configured model for that mode.

## Bash Restrictions in Plan Mode

Only read-only commands are allowed during planning:

**Allowed:** `cat`, `head`, `tail`, `grep`, `find`, `ls`, `pwd`, `tree`, `git status`, `git log`, `git diff`, `rg`, `fd`, `npm list`, etc.

**Blocked:** `rm`, `mv`, `cp`, `npm install`, `git commit`, `sudo`, editors, etc.
