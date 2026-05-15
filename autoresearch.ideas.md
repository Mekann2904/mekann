# Autoresearch Ideas

## Completed This Session (2,480 → 1,882 LOC, -24.1%)
- ✅ Dead code removal, deduplication, single-use inlining
- ✅ Multi-line import/export compression (34 LOC)
- ✅ Brace block compression (~50 blocks)
- ✅ Multi-line throw/return/object/function call compression
- ✅ Ternary conversion, arrow function compression
- ✅ Interface compression (7 interfaces → single lines)
- ✅ Callback compression (turn_end, setTimeout, child.on, timeoutPromise)
- ✅ Multi-line notify/confirm call compression (7 calls)
- ✅ Multi-line function call compression (15+ calls)
- ✅ Blank line removal between sequential code (~40 lines)
- ❌ textResponse helper: net LOC increase
- ❌ Import merge: net LOC increase

## Remaining Opportunities (diminishing)
- More blank line removals (~20 safe ones remain)
- Some plan-mode/index.ts sequential guards still have blanks

## Truly Exhausted
- All imports/exports: single-line
- All simple interfaces: single-line
- All simple function calls: single-line
- All brace blocks with ≤2 statements: compressed
- SBPL template: SECURITY CRITICAL

## Future Ideas
- Extract sandbox state into a state object (reduces coupling, not LOC)
- Mutation testing (Stryker) to verify test coverage quality
- E2E testing with pi core
