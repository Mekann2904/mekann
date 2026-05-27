# model-optimizer

API-based lifecycle optimizer organized as provider-specific modules.

## Architecture

```
model-optimizer/               ← root orchestrator
├── index.ts                   entry point — wires hooks, delegates to active module
├── types.ts                   ProviderOptimizerModule interface, state types
├── modules.ts                 module registry (add new providers here)
├── activeProfile.ts           model_select / session_start → active module selection
├── overflow.ts                message_end hook → dispatches to active module
├── compaction.ts              compaction observer → dispatches to active module
├── metrics.ts                 provider-independent metrics collection
├── command.ts                 /model-optimizer command
├── settingsSchema.ts          base settings + module settings concatenated
│
└── openai/                    ← OpenAI-family optimizer module
    ├── index.ts               ProviderOptimizerModule implementation
    ├── overflow.ts            overflow detection (regex patterns)
    ├── compaction.ts          post-compaction hint builder
    └── settings.ts            openaiFamily.enabled, openaiCodex.enabled
```

**Root** は「どの module を使うか」を判断するだけ。Provider 固有のロジックは各 module ディレクトリに閉じている。

## 新しい Provider の追加方法

1. `model-optimizer/<provider>/index.ts` を作成し、`ProviderOptimizerModule` を実装する
2. `model-optimizer/modules.ts` に import して配列に追加する
3. それだけ

## 対応 Module

### openai

| API protocol | Family | Overflow | Compaction hint |
|---|---|---|---|
| `openai-completions` | `openaiFamily` | ✓ | 汎用 hint |
| `openai-responses` | `openaiFamily` | ✓ | 汎用 hint |
| `azure-openai-responses` | `openaiFamily` | ✓ | 汎用 hint |
| `openai-codex-responses` | `openaiCodex` | ✓ | コード特化 hint |

## Features

| # | 機能 | Hook | やること |
|---|---|---|---|
| 1 | **Overflow Recovery** | `message_end` | Module の `detectOverflow` / `rewriteOverflow` に dispatch |
| 2 | **Session-local Metrics** | `message_start` / `message_end` | レイテンシ・トークン使用量を in-memory 記録 |
| 3 | **Compaction Observer** | `session_before_compact` / `session_compact` | compaction ライフサイクルを観測 |
| 4 | **Post-compaction Hints** | `session_compact` → `before_agent_start` | Module の `buildPostCompactionHint` に dispatch |

## Settings

| Setting | Default | Description |
|---|---|---|
| `enabled` | `true` | Master on/off |
| `openaiFamily.enabled` | `true` | OpenAI API family (openai-responses, openai-completions, azure-openai-responses) |
| `openaiCodex.enabled` | `true` | OpenAI Codex API (openai-codex-responses) |
| `overflowRecovery.enabled` | `true` | Overflow error normalization |
| `metrics.enabled` | `true` | Session-local metrics |
| `compactionObserver.enabled` | `true` | Compaction lifecycle observation |
| `postCompactionHint.enabled` | `true` | Post-compaction hints |
| `debugLogging` | `false` | Debug notifications |

## Commands

```
/model-optimizer status    Active module, API, provider, toggles
/model-optimizer stats     Session-local metrics
/model-optimizer help      Usage
```
