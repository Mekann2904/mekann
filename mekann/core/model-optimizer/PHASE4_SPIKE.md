# Phase 4: Provider Override Feasibility Spike

**Status:** Spike (2026-05-27)  
**Decision:** Deferred

## Current Context

model-optimizer Phase 1–3.5 is complete and release-ready as a **hook-based** optimizer. No provider overrides are used. All features work through pi extension lifecycle hooks:

| Feature | Mechanism | Status |
|---|---|---|
| Overflow recovery | `message_end` hook → regex match → `errorMessage` rewrite | ✅ |
| Session-local metrics | `message_start` / `message_end` hooks → track latency, tokens | ✅ |
| Compaction observer | `session_before_compact` / `session_compact` hooks → record | ✅ |
| Post-compaction hints | `before_agent_start` hook → append to `systemPrompt` | ✅ |

## What Provider Override Would Enable

| Capability | Hook-based (current) | Provider override (Phase 4) | Worth it? |
|---|---|---|---|
| Structured error.code access | ❌ Only `errorMessage` text | ✅ Direct access to SSE `error.code` | Possibly — but `message_end` rewrite already works for overflow |
| `response.incomplete` events | ❌ Not surfaced to extensions | ✅ Can handle in custom stream | Low — unclear if pi exposes these to hooks |
| Cached / reasoning token metrics | ✅ `usage.cacheRead` from `message.usage` | ✅ Direct from stream response | Low — cacheRead is already available |
| Model-specific request params | ❌ Can't modify request body | ✅ Full control in `streamSimple` | Low — no current need |
| Codex-like compaction/retry | ❌ Can't modify pi's compaction flow | ✅ Provider-level retry logic | Medium — but pi already handles this |
| Custom stream handling | ❌ Can't intercept streaming | ✅ `streamSimple` callback | High effort / low immediate value |

## Pi Provider Override API

### `pi.registerProvider(name, config)`

Two modes:

1. **Override-only** (no `models`): Changes `baseUrl` and/or `headers` for an existing provider. All existing models are preserved.  
   ```ts
   pi.registerProvider("openai", { baseUrl: "https://proxy.example.com" });
   ```

2. **Full replacement** (`models` provided): **Replaces all models** for that provider. Must re-declare every model.  
   ```ts
   pi.registerProvider("openai", {
     api: "openai-completions",
     streamSimple: myCustomStream,
     models: [/* all models must be redeclared */]
   });
   ```

### Key constraint

To add a custom `streamSimple` or modify provider behavior beyond `baseUrl`/`headers`, we **must** provide `models` — which means we must redeclare every existing `openai` / `openai-codex` model. This creates an ongoing maintenance burden: every time pi adds or updates an OpenAI model, we must also update our registration or risk missing models.

### `pi.unregisterProvider(name)`

Restores the original built-in provider. Can be called at any time.

## Risks of Provider Override

| Risk | Severity | Details |
|---|---|---|
| **Model list divergence** | HIGH | Must track every model pi ships for `openai`/`openai-codex`. A missed model means users can't access it. |
| **Streaming compatibility** | HIGH | `streamSimple` must correctly handle text, thinking, tool calls, images, usage, error events. A bug breaks the entire provider. |
| **Upstream pi provider changes** | HIGH | Pi's built-in `openai-completions.ts` / `openai-responses.ts` evolve. Our override must keep pace or break. |
| **API key / config handling** | MEDIUM | Must preserve user's existing API key, proxy settings, headers from pi config. |
| **Feature drift** | MEDIUM | New pi features added to the built-in provider won't reach our override unless explicitly ported. |
| **Tool call handling** | MEDIUM | Custom streams must handle tool call accumulation, partial JSON parsing, and content index tracking. |
| **Context handoff between providers** | LOW | `cross-provider-handoff` tests from pi-mono cover this. |
| **Debug complexity** | MEDIUM | When something breaks, is it pi, the provider, or our override? |

## Codex OSS Alignment

Codex OSS uses structured error codes:
- `error.code == "context_length_exceeded"` in SSE response parser (`responses.rs:1131`)
- Custom compaction that preserves user messages alongside summary (`compact.rs:192-228`)
- Token-level granularity: `cached_tokens`, `reasoning_tokens` (`responses.rs:111-126`)

Our current hook-based approach covers:
- Overflow detection via regex fallback (since structured code is unavailable at hook level)
- Compaction observation (read-only, no custom summary)
- Token tracking via `message.usage` (includes `cacheRead`)

What we can't do without override:
- Match Codex's exact compaction behavior (preserve user messages, summary as user message with `SUMMARY_PREFIX`)
- Handle `response.incomplete` SSE events

## Could We Do a Minimal Override?

One approach: **partial override — add streamSimple but preserve models programmatically**.

```ts
// Hypothetical approach — NOT IMPLEMENTED
pi.registerProvider("openai-codex", {
  streamSimple: codexAwareStream,  // wraps the built-in stream
  // models: ??? — needs ALL models or this becomes full replacement
});
```

**Problem:** The pi API does not support "wrap the existing stream" or "add streamSimple without replacing models." When `streamSimple` is provided but no `models`, the override only affects `baseUrl`/`headers`. When `models` is provided, all models must be listed explicitly. There is no middle ground.

## Recommendation: Defer

Provider override is **not justified at this time** because:

1. **Hook-based optimizer already covers the critical paths:** overflow recovery, metrics, compaction observation, post-compaction hints.
2. **The remaining gaps are small:** structured error codes, `response.incomplete`, Codex-like message preservation.
3. **The cost is high:** model list maintenance, stream compatibility, upstream provider tracking.
4. **No live incident reported** that requires provider override.

### When to revisit

Revisit Phase 4 if any of these occur:

- **Overflow recovery fails in production** despite correct regex patterns (new error message format not caught by regex)
- **`response.incomplete` events become relevant** (pi exposes them to extensions)
- **Metrics accuracy issue** requires stream-level token tracking
- **pi provides a "wrap stream" API** that allows adding middleware without replacing models
- **A real multi-model maintenance setup** requires provider-level request routing

### If forced to implement

Use the **experimental flag** approach:

```
model-optimizer.providerOverride.experimental = false  (default)
```

Under this flag:
- Register a custom `streamSimple` for `openai-codex`
- Keep the model list synced with pi's built-in list
- Run all stream tests from `packages/ai/test/`
- Only enable for users who explicitly opt in

## References

- Pi custom provider docs: `docs/custom-provider.md`
- Pi extension types: `node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts`
- Pi built-in providers: `packages/ai/src/providers/openai-completions.ts`, `openai-responses.ts`
- Codex OSS SSE: `vendor/oss/codex/codex-rs/codex-api/src/sse/responses.rs`
- Codex OSS compaction: `vendor/oss/codex/codex-rs/core/src/compact.rs`
