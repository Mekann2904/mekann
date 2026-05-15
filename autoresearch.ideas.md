# Autoresearch Ideas

## Completed This Session (2,480 → 2,273 LOC, -8.3%)
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
- ✅ Inlined `profileToSandboxMode` + removed dead function
- ✅ Merged multi-line string concatenations into single strings
- ✅ Inlined `createIsolatedTempDir`, `approveYolo`, `currentModelRef`
- ✅ Converted `yoloApprovalMessage` from array+join to inline string
- ✅ Compressed multi-line return/throw/if blocks into single lines
- ✅ Converted ~27 single-statement brace blocks to braceless one-liners
- ❌ `textResponse` helper: net LOC increase — reverted
- ❌ Import merge (permissions.js): net LOC increase — reverted

## Remaining Opportunities (Exhausted)
- **SBPL template** (~80 lines): SECURITY CRITICAL — do not modify
- **Multi-line string bodies** (plan-mode/utils.ts): Too long for one line
- **Complex return objects** (sandbox/index.ts): Details objects with 6+ fields
- **Blank lines**: ~220 — readability aids
- **Section dividers**: ~30 `// ───` — readability aids
- **SECURITY comments**: Must keep
- **Comments**: ~60 — readability aids
- **Import consolidation**: Adding `type` keywords makes it LOC-positive

## Future Ideas
- Extract sandbox state into a state object (reduces coupling, not LOC)
- Mutation testing (Stryker) to verify test coverage quality
- E2E testing with pi core
- Cross-platform sandbox tests
