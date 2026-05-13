# Plan Mode Extension

Codex-inspired plan mode that separates code analysis/planning from implementation, with separate model selection for each phase.

## Features

- **Plan Mode**: Read-only exploration — analyze code, understand architecture, create plans
- **Plan Ready**: Approval gate — plan is validated and waiting for explicit execution command
- **Execute Mode**: Full tool access — implement the plan step by step
- **State Machine**: `normal → planning → plan_ready → executing → completed/aborted` with validated transitions
- **Separate Models**: Different models for plan and execute phases
- **Progress Tracking**: Widget shows step completion and status (`pending`, `in_progress`, `done`, `failed`, `skipped`)
- **Verification**: Steps can include verification commands (e.g., `npm test`, `tsc --noEmit`)
- **Session Persistence**: State, model selections, and plan revision survive restarts

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
| `/execute-plan` | Start executing the saved plan (plan_ready only) |
| `/revise-plan` | Go back to planning to modify the plan |
| `/discard-plan` | Discard current plan and return to normal mode |
| `/plan-clear` | Alias for `/discard-plan` (backward compat) |
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

## State Machine

```
                    ┌──────────────────────┐
                    │                      │
                    ▼                      │
 ┌─────────┐  /plan  ┌──────────┐  plan   ┌────────────┐
 │ normal  │ ──────► │ planning │ ──────► │ plan_ready │
 └─────────┘         └──────────┘         └────────────┘
      ▲                   │ ▲                     │
      │                   │ │                     │
      │            /plan, │ │ /revise-plan        │ /execute-plan
      │          /discard │ │                     ▼
      │                   │ │              ┌────────────┐
      │                   │ │              │ executing  │
      │                   │ │              └────────────┘
      │                   │ │                │        │
      │                   │ │                ▼        ▼
      │                   │ │         ┌───────────┐ ┌────────┐
      │                   │ │         │ completed │ │ aborted│
      │                   │ │         └───────────┘ └────────┘
      └───────────────────┘ │               │           │
                            │               └─────┬─────┘
                            └─────────────────────┘
```

### Mode Descriptions

| Mode | Tools | Model | Description |
|------|-------|-------|-------------|
| `normal` | All (user's default) | User's default | Regular mode, no restrictions |
| `planning` | Read-only (read, grep, find, ls) | Plan model | Explore code, create plan |
| `plan_ready` | Read-only (same as planning) | Plan model | Plan validated, awaiting approval |
| `executing` | All (read, bash, edit, write, ...) | Main model | Implement saved plan |
| `completed` | All | Main model | All steps done |
| `aborted` | All | Main model | Execution was aborted |

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
| `planTools` | `string[]` | `["read","grep","find","ls"]` | Tools available in planning/plan_ready mode |
| `execTools` | `string[]` | *(restores pre-plan tools)* | Explicit override for execute mode tools |

## Workflow

1. Enable plan mode: `/plan` or `Ctrl+Alt+P`
2. Optionally set plan model: `/plan-model` → select from available models
3. Ask the agent to analyze code and create a plan
4. Agent outputs `<proposed_plan>` + `<plan_steps_json>` → state moves to `plan_ready`
5. Choose:
   - `/execute-plan` — approve and start execution
   - `/revise-plan` — go back to modify the plan
   - `/discard-plan` — discard and return to normal
6. During execution, agent marks steps with `[DONE:step-id]` tags
7. Progress widget shows completion status

## Structured Plan Steps

Plans include a `<plan_steps_json>` block alongside `<proposed_plan>` for machine-readable step definitions:

```
<proposed_plan>
Human-readable plan description
</proposed_plan>

<plan_steps_json>
[
  {
    "id": "add-validator",
    "title": "Add password validator",
    "acceptance": "Tests pass",
    "verification": "npm test -- auth.test.ts"
  },
  {
    "id": "update-tests",
    "title": "Update existing tests",
    "instruction": "Update auth.test.ts",
    "verification": "tsc --noEmit"
  }
]
</plan_steps_json>
```

Step ID format: **kebab-case** only (lowercase, digits, hyphens). Example: `add-validator`, `fix-api-v2`.

**`acceptance` is required.** Every step must include a completion criterion. This ensures the plan is "decision complete" — the implementer should never need to make judgment calls about whether a step is done.

Steps are completed with `[DONE:step-id]` markers (e.g., `[DONE:add-validator]`).

## Bash Restrictions in Plan Mode

`bash` is **not included** in default `planTools`. To enable, add it to your configuration (opt-in).

When enabled, commands are validated through `isSafeCommand()` and shell metacharacters (`&&`, `||`, `;`, `|`, `` ` ``, `$()`) are blocked.

**Always blocked:** `rm`, `mv`, `cp`, `npm install`, `git commit`, `sudo`, editors, and any command with shell metacharacters.

## Testing

```bash
cd plan-mode
npm test
```

| Category | Tests | Description |
|----------|-------|-------------|
| `isSafeCommand` | ~80 | Safe/dangerous bash command classification |
| `extractTodoItems` | ~15 | Plan extraction from `<proposed_plan>` and `Plan:` formats |
| `extractDoneSteps` | ~4 | `[DONE:n]` marker parsing |
| `markCompletedSteps` | ~3 | Step completion tracking |
| `cleanStepText` | ~7 | Text cleanup (markdown removal, normalization) |
| `validatePlan` | ~20 | Plan quality validation |
| State transitions | ~30 | Mode state machine validation |
| `tool_call` blocking | ~6 | Tool block simulation |
| `buildBlockReason` | ~5 | Block reason message generation |
| `loadPrompt` | ~5 | Prompt file loading |
| Integration Scenarios | ~3 | Full workflow tests |
| Japanese action words | ~3 | ACTION_WORDS_JA_RE accuracy |
| Verification field | ~3 | verification extraction and prompt injection |
| Prompt consistency | ~2 | kebab-case in prompts |

Total: ~320+ tests

## Architecture

```
plan-mode/
├── index.ts           # 拡張機能エントリポイント（コマンド・イベントハンドラ）
├── state.ts           # 状態管理・遷移（ModeState、モデル管理、モード切替）
├── footer.ts          # カスタムフッター描画（pwd、トークン統計、モデル表示）
├── utils.ts           # ユーティリティ + 純粋関数（状態遷移、isSafeCommand、extractTodoItems等）
├── model-selector.ts  # モデルセレクタUI
├── prompts/
│   ├── plan-mode.md   # プランモードシステムプロンプト
│   ├── plan-mode-reminder.md # プランモード継続中プロンプト
│   └── execute-mode.md # 実行モードシステムプロンプト
└── plan-mode.test.ts  # テストスイート
```

## Security

- Planning and plan_ready modes enforce read-only tool access at the `tool_call` boundary
- Tool restrictions are enforced by the host, not by prompt instructions
- Blocked tool calls are counted and reported to the model with escalating urgency
- Blocked tool calls are logged to session history (`plan-mode-blocked-tool` entries) with sanitized data (path/command only)
- Shell metacharacters are blocked to prevent command chaining
- `bash` is disabled by default in plan mode; opt-in via configuration
- Plan snapshot is frozen at execution start — the executing plan cannot be modified mid-run

## Known Limitations

- Bash safety detection uses regex patterns; not a complete shell parser
- Verification commands are informational; not automatically executed
- Step status tracking (`in_progress`, `failed`) requires model cooperation
- Pi host integration (`setActiveTools`, `before_agent_start`, etc.) requires runtime verification
