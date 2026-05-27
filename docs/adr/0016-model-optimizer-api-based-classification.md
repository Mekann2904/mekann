# 0016. Model optimizer classifies by API protocol, not provider string

## Status
Accepted

## Context
The `model-optimizer` feature originally classified models by `provider` string (`"openai"` / `"openai-codex"`) using hardcoded `if` comparisons. This had several problems:

1. **Wrong axis.** Overflow patterns and compaction hints depend on the API protocol (how errors are phrased, what kind of tasks the model handles), not the provider name. The same provider can serve multiple APIs (e.g. `openai` serves both `openai-completions` and `openai-responses`).

2. **Hardcoded.** Adding a new provider required editing four files: `types.ts` (`OptimizedProviderId`), `profiles.ts` (profile + lookup), `settingsSchema.ts` (per-provider setting), and `index.ts` (setting read + enabled check).

3. **Duplicate profiles.** `OPENAI_PROFILE` and `OPENAI_CODEX_PROFILE` had identical `overflowPatterns`. The only real difference was the post-compaction hint text.

4. **Ignored Pi's model metadata.** Pi provides `Model.api` (a `KnownApi` union) and `ModelRegistry.getProviderDisplayName()`, but model-optimizer duplicated this information in its own types.

5. **Missing `azure-openai-responses`.** This API uses the same overflow patterns as `openai-responses` but was not supported because the provider string did not match `"openai"`.

## Decision
Replace provider-string classification with API-protocol classification using `Model.api` from Pi's `@earendil-works/pi-ai` types.

Specific changes:
- **Single source of truth:** `API_FAMILY_MAP` in `profiles.ts` maps API strings to `{ familyKey, profile }`. Adding a new API requires one entry in this map.
- **`OptimizationProfile` replaces `ModelOptimizationProfile`:** Drops `provider` and `displayName` fields, adds `postCompactionHint`. Profiles are data objects looked up by API, not by provider.
- **`apiFamilyEnabled` replaces `providerEnabled`:** Settings are keyed by API family (`openaiFamily`, `openaiCodex`) instead of provider string.
- **`pendingPostCompactionHint` uses `api` instead of `provider`:** Compaction hint matching checks the API protocol, which correctly invalidates the hint when the user switches between APIs (e.g. `openai-codex-responses` → `openai-responses`).
- **`prompts.ts` deleted:** Hint text lives directly on profile objects.
- **`displayName` removed:** `ctx.modelRegistry.getProviderDisplayName()` is used instead of maintaining a duplicate.

## Rationale
- `Model.api` is the correct classification axis because error message formats and task profiles are properties of the API protocol, not the provider.
- Pi already provides `KnownApi` as a union type covering all supported APIs; leveraging it avoids drift.
- `API_FAMILY_MAP` makes the relationship between API → setting key → profile explicit and centralized.
- `azure-openai-responses` is now supported without any code changes beyond the initial map entry.

## Consequences
- Models with unknown `api` values receive no optimization (same as before for unknown providers).
- Per-provider settings (`openai.enabled`, `openaiCodex.enabled`) have been replaced by per-API-family settings (`openaiFamily.enabled`, `openaiCodex.enabled`). Users with custom `mekann.json` settings for the old keys will need to update them.
- The `OptimizedProviderId` type and `prompts.ts` file have been removed.
- Future API additions (e.g. `mistral-conversations`) require only a `API_FAMILY_MAP` entry and optionally a new settings key.
