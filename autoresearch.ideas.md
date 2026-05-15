# Autoresearch Ideas

## Completed This Session (2,480 → 2,101 LOC, -15.3%)
- ✅ Dead code removal: SAFE_PLAN_TOOLS, getCapabilityProfile, profileToSandboxMode, eslint-disable
- ✅ Deduplication: popSandboxOverride, killProcessGroup
- ✅ Single-use inlining: buildSandboxPath, createIsolatedTempDir, approveYolo, currentModelRef, etc.
- ✅ String compression: multi-line concatenations, yoloApprovalMessage array→string
- ✅ Multi-line object compression: CAPABILITY_PROFILES, commandIntent returns, registerFlag/registerCommand
- ✅ Brace block compression: ~50 single-stmt if/for blocks → braceless or single-line
- ✅ Multi-line throw/return compression: all throw and simple return objects
- ✅ 2-stmt block compression: ~15 if/for blocks → single-line { stmt1; stmt2; }
- ✅ Ternary conversion: yolo approval check, if/else-return patterns
- ✅ Default param compression: truncateForLlm opts
- ❌ textResponse helper: net LOC increase — reverted
- ❌ Import merge: net LOC increase — reverted

## Remaining Opportunities (Truly Exhausted)
- **Function body braces**: 20 exported functions with `return X;` — TypeScript requires braces
- **SBPL template** (~80 lines): SECURITY CRITICAL — do not modify
- **Complex blocks**: >3 statements with logic — readability concern
- **Blank lines**: ~190 — readability aids
- **Comments**: ~50 — readability aids
- **Interface sub-objects**: `models: { main?; plan?; }` — TypeScript syntax requires

## Future Ideas
- Extract sandbox state into a state object (reduces coupling, not LOC)
- Mutation testing (Stryker) to verify test coverage quality
- E2E testing with pi core
