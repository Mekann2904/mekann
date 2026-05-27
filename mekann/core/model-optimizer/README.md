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

## Settings refresh timing

Settings are re-read on `session_start` (new session, session restore, `/reload`).
Changing `mekann settings.json` while a session is running does **not** take effect
until the next session start or `/reload`. The `restartRequired: false` schema flag
means Pi does not need to be restarted — but a session boundary is required.

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

## Known Limitations

| Limitation | Reason | Mitigation |
|---|---|---|
| Overflow detection uses regex matching on `errorMessage`, not structured `error.code` | Pi extension lifecycle only exposes the message-level error text | Unit tests cover known OpenAPI/Codex overflow texts. If a new message variant appears, add a regex to `profiles.ts` |
| Codex CLI's unique error text (`Codex ran out of room…`) is not covered | Pi uses the Codex API (not CLI), so CLI-specific errors are unlikely to appear | Add a CLI pattern to `profiles.ts` if `codex-cli` becomes a pi provider |
| Provider override is not implemented | Would require wrapping pi's existing provider definitions and handling streaming/tool-calling/compatibility | See Phase 4 design notes |
| Custom compaction summaries are not implemented | Pi's default compaction works well for general use; replacing it risks summary quality | See Phase 4 design notes |

## Manual Verification Checklist

Run these smoke checks after deployment or during development:

### Commands

- [ ] `/model-optimizer` → shows help with "Subcommands:"
- [ ] `/model-optimizer help` → same as above
- [ ] `/model-optimizer unknown` → shows help (not error)
- [ ] `/model-optimizer status` → shows active provider, profile, toggles
- [ ] `/model-optimizer stats` → shows metrics (zero prior to activity)

### Provider Detection

- [ ] Switch to `openai` model → `/model-optimizer status` shows `Active: yes`, `Profile: OpenAI`
- [ ] Switch to `openai-codex` model → `/model-optimizer status` shows `Active: yes`, `Profile: OpenAI Codex`
- [ ] Switch to non-target model (e.g. `anthropic`) → `/model-optimizer status` shows `Active: no`, `Profile: (none)`

### Debug Logging

- [ ] Set `debugLogging: true` → model select triggers `model-optimizer: provider=…` notify
- [ ] Trigger `/compact` with debug on → `model-optimizer: compaction observed` notify appears
- [ ] After compaction, send next prompt → `model-optimizer: post-compaction hint injected` notify appears
- [ ] Set `debugLogging: false` → none of the above appear

### Post-compaction Hint

- [ ] Send several prompts to build up context, then `/compact`
- [ ] Next prompt → check that `before_agent_start` received the provider-aware hint (verified via debug log)
- [ ] `/model-optimizer stats` → `Post-comp hints: 1`
- [ ] Second prompt after compaction → no new hint injected (one-shot)

### Metrics

- [ ] Send prompts on `openai` or `openai-codex` → `/model-optimizer stats` shows `Requests observed: N`
- [ ] `Total tokens` and `Avg latency` are non-zero
- [ ] `─── by provider ───` breakdown appears

### Overflow Recovery

- [ ] Hard to trigger in live environment. Covered by `overflow.test.ts` fixture tests.
- [ ] 29 test cases covering: OpenAPI overflow text, Codex exact fixture, already-canonical, rate-limit, timeout, network, auth errors

### Settings Toggle

- [ ] Set `model-optimizer.enabled: false` → `/model-optimizer status` shows `Enabled: no`, `Active: no`
- [ ] Set `overflowRecovery.enabled: false` → status shows `Overflow recv: off`
- [ ] Set `metrics.enabled: false` → no metrics recorded after prompts
- [ ] Set `postCompactionHint.enabled: false` → no hint injected after `/compact`
