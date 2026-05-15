# Autoresearch Ideas

## Completed This Session (2,480 → 2,363 LOC, -4.7%)
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
- ✅ Inlined single-use `buildSandboxPath` into `buildSandboxEnv`
- ✅ Inlined `profileToSandboxMode` (statically known after guard) + removed dead function
- ✅ Merged 6 multi-line string concatenations into single strings
- ✅ Inlined single-use `createIsolatedTempDir` function
- ✅ Converted `yoloApprovalMessage` from array+join to inline string
- ❌ `textResponse` helper: net LOC increase (+5) — reverted
- ❌ Import merge (permissions.js): net LOC increase (+1) — reverted

## Remaining Opportunities (Exhausted)
- **SBPL template** (~80 lines): SECURITY CRITICAL — do not modify
- **`isSafeCommand` deprecated alias**: Used extensively in tests
- **`changeMode` IIFE wrapper**: Structural pattern — cannot simplify  
- **Blank lines**: ~230 — readability aids
- **Section dividers**: ~30 `// ───` lines — readability aids
- **SECURITY comments**: Must keep
- **Import consolidation**: Adding `type` keywords makes it LOC-positive

## Future Ideas
- Extract sandbox state into a state object (reduces coupling, not LOC)
- Mutation testing (Stryker) to verify test coverage quality
- E2E testing with pi core
- Cross-platform sandbox tests
