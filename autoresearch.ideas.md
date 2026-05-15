# Autoresearch Ideas

## Completed This Session (2,480 → 1,882 LOC, maintenance_score: 2680 → 1524)
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
- ✅ File merging: 21→15 files (capabilities, approvals, state, contentExtract, commandIntent, agentPath, pathPolicy)
- ✅ Helper extraction: evBase, enqueueToMailbox, abortSession, resolveModel, finalizeWithError, allAgents, toolResult, disableSandbox, refreshStatusBar
- ❌ textResponse helper: net LOC increase
- ❌ Import merge: net LOC increase

## Remaining Opportunities (diminishing)
- Sandbox index.ts: more tool response pattern extraction
- subagent/index.ts: wrap tool handlers to auto-provide ctrl/callerPath
- plan-mode/index.ts: compress mode event handlers

## Structural Limits
- duplication: 151 lines, mostly structural JS syntax (try/catch, return, JSDoc markers)
- JSDoc markers (/**, */) count as 2 duplicated lines = 20 points — removing docs is counter-productive
- review_risk: 0 (at threshold of 15 files)
- SBPL template: SECURITY CRITICAL — must not touch

## Future Ideas
- Extract sandbox state into a state object (reduces coupling, not LOC)
- Mutation testing (Stryker) to verify test coverage quality
- E2E testing with pi core
- Higher-order tool wrapper to eliminate `const ctrl = ensureControl()` boilerplate (9 occurrences → 1 unique dup line = 10 points)
