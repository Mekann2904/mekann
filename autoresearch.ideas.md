# Autoresearch Ideas

## Completed This Session (2,480 → 2,417 LOC, -2.5%)
- ✅ Inlined `withThinkingSuppressed` into `applyThinking`
- ✅ Extracted `popSandboxOverride()` dedup (3 call sites → 1 function)
- ✅ Removed deprecated `SAFE_PLAN_TOOLS` alias
- ✅ Merged `killPgSigkill` + inner `killPg` → single `killProcessGroup`
- ✅ Inlined `isRestrictiveOrEqual` + compressed `MODE_RANK` constant
- ✅ Removed dead `getCapabilityProfile` function
- ✅ Simplified `resetYoloApproval` with `Object.assign`
- ✅ Compressed `VALID_THINKING_LEVELS` + `isThinkingLevel`
- ✅ Removed 3 unused `eslint-disable` comments
- ✅ Inlined single-use `ProfileOverride` interface into array type

## Remaining Opportunities (Diminishing Returns)
- **SBPL template** (~80 lines): SECURITY CRITICAL — do not modify
- **`isSafeCommand` deprecated alias**: Used extensively in tests — rename would need test changes
- **`changeMode` IIFE wrapper**: Structural pattern for async handler — cannot simplify
- **`textResponse` helper**: Net LOC increase — not worth it (4 call sites)
- **Blank lines**: ~236 across all source files — readability aids, not maintenance cost
- **Section dividers**: ~30 `// ───` lines — readability aids
- **SECURITY comments**: Must keep

## Future Ideas
- Extract sandbox state into a state object (reduces coupling, not LOC)
- Consolidate `profileToSandboxMode` mapping (inline in sandbox/index.ts)
- Mutation testing (Stryker) to verify test coverage quality
- E2E testing with pi core
- Cross-platform sandbox tests
