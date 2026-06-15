# 0020. Defer model-optimizer provider override and prefer lifecycle hooks

> Originally numbered `0015`. Renumbered to `0020` on 2026-06-15 to resolve an ADR number collision with `0015-main-mode-skill-flow-continuation`.

## Status
Superseded by [0016](0016-model-optimizer-api-based-classification.md) — model-optimizer now uses provider-specific modules (see 0016), which absorbs the deferred provider-override question into the module architecture.

## Context
The `model-optimizer` feature brings Codex-inspired OpenAI-family behavior into the Mekann pi extension for `openai` and `openai-codex` providers.

The implemented optimizer currently uses pi extension lifecycle hooks instead of overriding providers:

- `message_end` normalizes context-overflow errors to `context_length_exceeded:` so pi's built-in compaction/retry path can recover.
- `message_start` / `message_end` collect session-local latency and token metrics.
- `session_before_compact` / `session_compact` observe compaction without replacing pi's summary.
- `before_agent_start` injects a one-shot post-compaction continuation hint.

A Phase 4 spike investigated provider override as a way to get closer to Codex-native behavior, especially structured `error.code == "context_length_exceeded"`, `response.incomplete` SSE handling, more granular cached/reasoning token metrics, and Codex-like compaction/retry behavior.

Pi supports `pi.registerProvider()`, but adding a custom `streamSimple` is not a thin wrapper over the built-in provider. To replace provider behavior, the extension must provide model definitions, which replaces all existing models for that provider.

## Decision
Defer provider override for `model-optimizer` and continue using lifecycle hooks as the default architecture.

Do not register or replace the built-in `openai` or `openai-codex` providers unless a concrete production issue proves the hook-based implementation insufficient, or pi gains a provider-stream wrapper/middleware API that avoids full provider replacement.

## Rationale
- `registerProvider()` with only `baseUrl` or `headers` preserves existing models, but does not allow wrapping or modifying the built-in stream behavior.
- Using `streamSimple` means taking responsibility for the provider stream and model list, including all `openai` / `openai-codex` model definitions.
- A provider override would have to preserve streaming compatibility, tool-call accumulation, usage accounting, API-key/config behavior, and future upstream pi provider changes.
- The hook-based implementation already covers the high-value behavior: overflow recovery, metrics, compaction observation, post-compaction hints, command UX, debug logging, and non-target provider isolation.
- The remaining gaps are real but not currently worth a provider fork: direct structured error-code access, `response.incomplete` handling, exact Codex compaction behavior, and stream-level token details.

## Consequences
- The optimizer remains a lightweight pi extension that composes with built-in providers instead of owning them.
- Context overflow detection continues to use regex matching on `errorMessage`; structured `error.code` is not directly visible through the current lifecycle hooks.
- Exact Codex compaction behavior, such as preserving selected user messages alongside the summary, is not implemented.
- `openai` / `openai-codex` model availability stays owned by pi's built-in provider registry, avoiding model-list drift.
- Future work should revisit provider override only if:
  - live overflow recovery fails due to inaccessible structured error information,
  - `response.incomplete` becomes relevant to correctness,
  - stream-level token metrics become required,
  - pi adds a provider wrapper/middleware API, or
  - a user explicitly opts into an experimental provider override with the maintenance burden understood.
