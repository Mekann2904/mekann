# Autoresearch Ideas

## Completed This Session (2,480 → 2,146 LOC, -13.5%)
- ✅ Dead code removal: SAFE_PLAN_TOOLS, getCapabilityProfile, profileToSandboxMode, eslint-disable
- ✅ Deduplication: popSandboxOverride, killProcessGroup
- ✅ Single-use inlining: buildSandboxPath, createIsolatedTempDir, approveYolo, currentModelRef, etc.
- ✅ String compression: 6 multi-line concatenations, yoloApprovalMessage array→string
- ✅ Multi-line object compression: CAPABILITY_PROFILES, commandIntent returns, registerFlag/registerCommand
- ✅ Brace block compression: ~40 single-stmt if/for blocks → braceless or single-line
- ✅ Multi-line throw/return compression: 3 throw, 6+ return objects
- ✅ 2-stmt block compression: 13 if/for blocks → single-line { stmt1; stmt2; }
- ❌ textResponse helper: net LOC increase — reverted
- ❌ Import merge: net LOC increase — reverted

## Remaining Opportunities (Diminishing Returns)
- **SBPL template** (~80 lines): SECURITY CRITICAL — do not modify
- **Multi-line strings**: plan-mode block messages — too long for single lines
- **Complex blocks**: >2 statements, nested logic — readability concern
- **Blank lines**: ~200 — readability aids
- **Comments**: ~55 — readability aids

## Future Ideas
- Extract sandbox state into a state object (reduces coupling, not LOC)
- Mutation testing (Stryker) to verify test coverage quality
- E2E testing with pi core
