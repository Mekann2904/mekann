# Autoresearch Ideas

## Completed This Session (2,480 → 2,043 LOC, -17.6%)
- ✅ Dead code removal: SAFE_PLAN_TOOLS, getCapabilityProfile, profileToSandboxMode, eslint-disable
- ✅ Deduplication: popSandboxOverride, killProcessGroup
- ✅ Single-use inlining: buildSandboxPath, createIsolatedTempDir, approveYolo, currentModelRef, etc.
- ✅ String compression: multi-line concatenations, yoloApprovalMessage array→string
- ✅ Multi-line import compression: 8 imports across 3 files (34 LOC)
- ✅ Multi-line object compression: CAPABILITY_PROFILES, commandIntent returns, registerFlag/registerCommand
- ✅ Brace block compression: ~50 single-stmt if/for blocks → braceless or single-line
- ✅ Multi-line throw/return compression: all throw and simple return objects
- ✅ 2-stmt block compression: ~15 if/for blocks → single-line { stmt1; stmt2; }
- ✅ Ternary conversion: yolo approval check, if/else-return patterns
- ✅ Arrow function compression: done(), resolvePromise(), abortHandler
- ✅ Spawn options, Type.Object params, emit objects
- ❌ textResponse helper: net LOC increase — reverted
- ❌ Import merge: net LOC increase — reverted

## Truly Exhausted
All remaining multi-line patterns are complex function bodies, interface definitions, 
SECURITY CRITICAL SBPL templates, or blocks with 3+ statements that would harm readability.

## Future Ideas
- Extract sandbox state into a state object (reduces coupling, not LOC)
- Mutation testing (Stryker) to verify test coverage quality
- E2E testing with pi core
