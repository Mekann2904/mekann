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
| `/todos` | Show current plan progress |
| `/execute-plan` | Start executing the saved plan |
| `/plan-clear` | Discard current plan and return to normal mode |
| `/plan-status` | Show detailed plan state (mode, model, tools, steps) |

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
  "planTools": ["read", "bash", "grep", "find", "ls"],
  "execTools": ["read", "bash", "edit", "write"]
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `planModel` | `{provider, modelId}` | — | Model to use in plan mode |
| `planTools` | `string[]` | `["read","grep","find","ls"]` | Tools available in plan mode. `bash` is **not** included by default; opt-in via config. When enabled, all commands are validated through `isSafeCommand()` and shell metacharacters (`&&`, `\|\|`, `;`, `\|`, `` ` ``, `$()`) are blocked. |
| `execTools` | `string[]` | *(restores pre-plan tools)* | Explicit override for execute mode tools. If unset, original active tools are restored on mode exit. |

If plan model is not configured, use `/plan-model` to select interactively.
The execution model uses pi's current default model.

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

5. After the plan is complete, run `/execute-plan` to start execution
6. The model switches to the execution model automatically
7. Agent executes steps, marking them with `[DONE:step-id]` tags
8. Progress widget shows completion status

## Model Selection

The `/plan-model` command opens a model selector that matches pi's built-in `/model` experience:

- All available models listed, grouped by provider
- Current selection highlighted with ●
- Type to filter, arrow keys to navigate
- Enter to select, Escape to cancel

When switching between plan and execute modes, the model changes automatically to the configured model for that mode.

## Bash Restrictions in Plan Mode

`bash` is **not included** in the default `planTools`. To enable bash in plan mode,
add it to your configuration's `planTools` array (opt-in).

When enabled, all bash commands are validated through `isSafeCommand()` at the
`tool_call` boundary. Additionally, shell metacharacters (`&&`, `||`, `;`, `|`,
`` ` `` `$()`, `<()`) are blocked to prevent command chaining, pipes, and substitution.

**Allowed (opt-in, single command only):** `cat`, `head`, `tail`, `grep`, `find`, `ls`, `pwd`, `tree`, `git status`, `git log`, `git diff`, `rg`, `fd`, `npm list`, etc.

**Always blocked:** `rm`, `mv`, `cp`, `npm install`, `git commit`, `sudo`, editors, and any command with shell metacharacters.

## Structured Plan Steps

Plans can include a `<plan_steps_json>` block alongside `<proposed_plan>` for
machine-readable step definitions:

```
<proposed_plan>
Human-readable plan description
</proposed_plan>

<plan_steps_json>
[
  {"id":"add-validator","title":"Add password validator","acceptance":"Tests pass"},
  {"id":"update-tests","title":"Update existing tests","instruction":"Update auth.test.ts"}
]
</plan_steps_json>
```

When `<plan_steps_json>` is present, the system uses it for execution tracking.
Steps are completed with `[DONE:step-id]` markers (e.g., `[DONE:add-validator]`).
Numeric `[DONE:1]` format is also supported for backward compatibility.

## Testing

Run the test suite to verify plan mode works correctly:

```bash
cd plan-mode
npm test
```

The test suite covers:

| Category | Tests | Description |
|----------|-------|-------------|
| `isSafeCommand` | ~80 | Safe/dangerous bash command classification |
| `extractTodoItems` | ~15 | Plan extraction from `<proposed_plan>` and `Plan:` formats |
| `extractDoneSteps` | ~4 | `[DONE:n]` marker parsing |
| `markCompletedSteps` | ~3 | Step completion tracking |
| `cleanStepText` | ~7 | Text cleanup (markdown removal, normalization) |
| `validatePlan` | ~20 | Plan quality validation (step count, ID format, action words) |
| Integration Scenarios | ~3 | Full workflow: plan → execute → complete |
| `tool_call` blocking | ~6 | Tool block simulation in plan mode |
| `buildBlockReason` | ~5 | Block reason message generation |
| `loadPrompt` | ~5 | Prompt file loading and variable substitution |

Total: ~259 tests

## Architecture

```
plan-mode/
├── index.ts           # 拡張機能エントリポイント（コマンド・イベントハンドラ）
├── state.ts           # 状態管理・遷移（ModeState、モデル管理、モード切替）
├── footer.ts          # カスタムフッター描画（pwd、トークン統計、モデル表示）
├── utils.ts           # ユーティリティ（isSafeCommand、extractTodoItems、buildBlockReason、loadPrompt）
├── model-selector.ts  # モデルセレクタUI
├── prompts/
│   ├── plan-mode.md   # プランモードシステムプロンプト
│   └── execute-mode.md # 実行モードシステムプロンプト
└── plan-mode.test.ts  # テストスイート
```
