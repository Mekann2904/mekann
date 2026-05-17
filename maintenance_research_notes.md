# Maintenance Research Notes

## Current State (2026-05-17 session)

- **Score progression**: 4072 (baseline) → 3652 (best, -10.3%)
- **LOC**: 6325 → 6288 (-37)
- **Files**: 22 → 20 (-2)
- **Tests**: 1497 → 1492 (-5 deleted dead tests)
- **Complexity functions**: 3 → 2 (reconstructState shrunk from 51→42 lines)

### File sizes (source LOC, current)
- autoresearch/index.ts: 719 (was 837)
- goal/index.ts: 626
- subagent/agentControl.ts: 489
- subagent/types.ts: 323 (was 251 + render.ts 72)
- sandbox/index.ts: 422
- sandbox/macSeatbelt.ts: 420
- goal/state.ts: 363
- goal/runtime.ts: 335
- subagent/index.ts: 371
- subagent/registry.ts: 279
- plan-mode/index.ts: 287
- autoresearch/runner.ts: 272 (was 175, absorbed git+loop helpers)
- autoresearch/state.ts: 236
- plan-mode/utils.ts: 183
- policy-core/modes.ts: 183
- goal/prompts.ts: 200
- sandbox/permissions.ts: 153
- subagent/mailbox.ts: 160
- subagent/contextFork.ts: 97
- zip-repo/index.ts: 171

### Score Structure (best: 3652)
- duplication_score: 270 × 10 = 2700 (74%)
- review_risk: 9 × 100 = 900 (25%)
- complexity_score: 2 × 10 = 20 (1%)
- test_seconds: 32 × 1 = 32 (1%)

### Key Learnings (this session)

1. **Moving pure functions to separate modules reduces max file size without adding duplication**: git helpers, loop helpers moved from autoresearch/index.ts (837→719 lines) to runner.ts
2. **Deleting truly unused code is high-value**: persistence.ts had 48 LOC + 5 tests, zero source references
3. **File merging reduces file count**: render.ts (72 lines) → types.ts saved 1 file, -100pts
4. **Helper extraction that only shortens call sites increases LOC**: uw() helper added 2 lines (def+ctx save) per call site, net score increase
5. **notifyError helper is neutral**: deduplicates pattern but adds definition LOC
6. **File merging has test isolation limits**: utils.ts → index.ts fails when index.ts has runtime-only imports (@earendil-works/pi-tui) unavailable in test env
7. **parseRunEntry extraction**: Split 51-line function to reduce complexity score

### Natural Floor Analysis
- **duplication_score (270)**: ~66 JSDoc markers, ~44 `return;`, ~42 `);`, ~39 `try {` — all fundamental TS syntax or meaningful documentation
- **review_risk (9)**: Max file 719 lines (4 pts) + 20 files over 15 threshold (5 pts). Reducing max file below 500 or file count below 15 is unrealistic
- **complexity (2)**: runCommand (70 lines) and runSandboxedShellMac (120 lines, SECURITY CRITICAL)
- **Remaining duplication**: API contract boilerplate (pi.registerTool, promptGuidelines, parameters) is externally-visible behavior and cannot be reduced

### Remaining Opportunities (low-ROI)
1. goal/prompts.ts → goal/state.ts merge (200+363=563, over 500)
2. sandbox/permissions.ts → sandbox/index.ts merge (153+422=575, over 500)
3. JSDoc removal (132 dup lines) — most are meaningful, removal reduces clarity
4. Error pattern helper across modules — requires shared dependency or increases coupling
5. Test speed optimization — 32s is modest, most time is subagent/sandbox integration tests
