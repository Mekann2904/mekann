# 0016. Model optimizer uses provider-specific modules, not hardcoded profiles

## Status
Accepted

Supersedes [0020](0020-model-optimizer-provider-override-deferred.md) (deferred provider override) — the provider-module architecture absorbs the deferred-override question instead of relying on lifecycle hooks alone.

## Context
The `model-optimizer` feature originally classified models by `provider` string (`"openai"` / `"openai-codex"`) using hardcoded `if` comparisons, then was refactored to classify by `Model.api` with a central `API_FAMILY_MAP` and `OptimizationProfile` objects.

The profile-based approach had limited expressiveness:
- Overflow detection was limited to regex matching. No way to express custom detection logic per provider.
- Error rewriting was always the same prefix pattern. No way to customize per provider.
- Compaction hints were static strings. No way to generate dynamic hints based on context.
- All provider-specific data was in a single flat `profiles.ts`. Adding a provider meant editing shared files.

## Decision
Replace the flat profile-based architecture with a **provider module** architecture.

Each provider optimizer module implements `ProviderOptimizerModule`:
```ts
interface ProviderOptimizerModule {
  id: string;
  supports(model: Model<Api>): boolean;
  familyKey(model: Model<Api>): string | undefined;
  detectOverflow(ctx): boolean;
  rewriteOverflow(ctx): string;
  buildPostCompactionHint(ctx): string | undefined;
  settings: SettingSchema<boolean>[];
}
```

Modules live in their own directories under `model-optimizer/`:
```
model-optimizer/
├── openai/           ← OpenAI-family module
│   ├── index.ts
│   ├── overflow.ts
│   ├── compaction.ts
│   └── settings.ts
└── (future: deepseek/, etc.)
```

The root orchestrator (`index.ts`, `overflow.ts`, `compaction.ts`) only:
1. Finds the active module via `optimizerModules.find(m => m.supports(model))`
2. Dispatches hook events to the active module's methods

## Rationale
- Modules can express arbitrary detection, rewriting, and hint logic — not just regex and static text.
- Adding a provider means creating a directory and registering in `modules.ts` — no root file edits.
- Each module owns its own settings, keeping the root schema clean.
- The root orchestrator remains thin and provider-agnostic.

## Consequences
- `OptimizationProfile`, `profiles.ts`, `openai/profile.ts` removed.
- Root `overflow.ts` and `compaction.ts` are dispatchers, not implementors.
- Module interface is the contract for all provider optimizers.
- Future providers (DeepSeek, etc.) follow the same pattern without touching root code.
