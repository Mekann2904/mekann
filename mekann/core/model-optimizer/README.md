# model-optimizer

Provider-aware lifecycle optimizer for OpenAI-family models (`openai`, `openai-codex`) in the **mekann** pi extension.

## Purpose

Detects when an OpenAI or OpenAI-Codex model is selected and enables lightweight, non-invasive optimizations through pi's extension lifecycle hooks. No provider overrides, no custom streaming, no compaction replacement — everything works alongside pi's default behaviour.

## Supported Providers

| Provider | Profile | Optimization |
|---|---|---|
| `openai` | Standard OpenAI | overflow recovery, metrics, compaction observer, post-compaction hints |
| `openai-codex` | Codex (code-preserving) | overflow recovery, metrics, compaction observer, post-compaction hints |
| Any other | — | No interference. The optimizer stays idle. |

## Features

### 1. Overflow Recovery

**What:** Detects provider-specific context-overflow error messages on `message_end` and rewrites them to the canonical `context_length_exceeded:` prefix so pi's auto-compaction and retry machinery can kick in.

**How:** `overflow.ts` hooks into `message_end` (assistant, `stopReason === "error"`), matches known overflow patterns from `profiles.ts`, and rewrites `event.message.errorMessage` idempotently.

**Setting:** `overflowRecovery.enabled` (default: `true`)

### 2. Session-local Metrics

**What:** Records latency, token usage, and recovery counts for assistant messages on supported providers. All data is in-memory and scoped to the current session.

**How:** `metrics.ts` hooks into `message_start` and `message_end`, tracks `Date.now()` latency and extracts tokens from `event.message.usage` (input, output, cacheRead).

**Setting:** `metrics.enabled` (default: `true`)

### 3. Compaction Observer

**What:** Observes compaction lifecycle events without replacing pi's default compaction. Records when a compaction starts and completes for later analysis.

**How:** `compaction.ts` hooks into `session_before_compact` (records `tokensBefore`, `firstKeptEntryId`) and `session_compact` (records completion). Never returns a custom compaction summary.

**Setting:** `compactionObserver.enabled` (default: `true`)

### 4. Post-compaction Hints

**What:** After a compaction, injects a provider-aware continuation hint into `systemPrompt` on the very next `before_agent_start`. The hint is consumed exactly once and cleared immediately.

**How:** `session_compact` sets a `pendingPostCompactionHint`. On the next `before_agent_start`, `compaction.ts` appends a short contextual hint to the existing `systemPrompt`.

| Provider | Hint focus |
|---|---|
| `openai` | Objective, key decisions, constraints, pending tasks |
| `openai-codex` | File paths, commands, patches, tests, objectives, constraints |

**Setting:** `postCompactionHint.enabled` (default: `true`)

## Commands

```
/model-optimizer           Show help
/model-optimizer status    Show active provider, profile, and feature toggles
/model-optimizer stats     Show session-local metrics (tokens, latency, compactions)
/model-optimizer help      Show help
```

## Settings

All settings are in `mekann settings.json` under the `model-optimizer` feature:

| Setting | Default | Description |
|---|---|---|
| `enabled` | `true` | Master on/off for the entire optimizer |
| `openai.enabled` | `true` | Enable optimization for `openai` provider |
| `openaiCodex.enabled` | `true` | Enable optimization for `openai-codex` provider |
| `overflowRecovery.enabled` | `true` | Enable context overflow error normalization |
| `metrics.enabled` | `true` | Enable session-local metrics collection |
| `compactionObserver.enabled` | `true` | Enable compaction lifecycle observation |
| `postCompactionHint.enabled` | `true` | Enable post-compaction continuation hints |
| `debugLogging` | `false` | Show debug notifications for key events |

## Non-goals (explicitly out of scope)

- **Provider override** — We do not replace or wrap pi's existing `openai` / `openai-codex` providers.
- **Custom compaction summaries** — We never return a custom summary from `session_before_compact`. The observer is read-only.
- **Custom streaming** — We do not intercept or modify streaming events.
- **Cost/pricing attribution** — Metrics track token counts and latency only, no dollar-cost calculation.
- **Non-OpenAI-family providers** — `anthropic`, `google`, etc. are not touched.

## File map

```
mekann/core/model-optimizer/
├── index.ts               Entry point — wires all subsystems
├── types.ts               Type definitions (profiles, metrics, state)
├── profiles.ts            Static provider profiles (openai, openai-codex)
├── activeProfile.ts       Runtime state: model_select / session_start tracking
├── overflow.ts            Overflow error normalization
├── metrics.ts             Session-local metrics collection
├── compaction.ts          Compaction lifecycle observer + post-compaction hints
├── prompts.ts             Provider-aware continuation hints
├── command.ts             /model-optimizer slash command
├── settingsSchema.ts      Settings definitions (registered in mekann/settings/registry.ts)
├── overflow.test.ts       Tests for overflow recovery
├── metrics.test.ts        Tests for metrics + commands
├── compaction.test.ts     Tests for compaction observer + hints
├── package.json
└── vitest.config.ts
```
