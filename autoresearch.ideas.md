# Autoresearch Ideas

## Session Status: 2680 → 1249 (-53.4%), 41 experiments

## Completed
- ✅ Dead code removal, deduplication, single-use inlining
- ✅ Multi-line import/export/brace/throw/return compression
- ✅ File merging: 21→15 files (capabilities, approvals, state, contentExtract, commandIntent, agentPath, pathPolicy)
- ✅ Helper extraction: evBase, enqueueToMailbox, resolveAgentOrFail, setStatusAndPublish, toolResult, withCtrl, disableSandbox, refreshStatusBar, logProfileRejection, logBlockedTool, shutdownControl, safeEmit, filterAgents, findAgent
- ✅ Merge duplicate branches (contextFork user/assistant loop)
- ✅ Delegate agentControl.openCount → registry.openCount
- ✅ Alias FollowupTaskParams = SendMessageParams
- ❌ textResponse helper: net LOC increase
- ❌ Import merge: net LOC increase

## Near-Floor Experiments (no score change)
- resolveCallerAndAgent helper: +4 LOC, same duplication
- spawnSandboxedProcess helper: +4 LOC, same duplication
- collectSandboxOutput extraction: score worsened (+1 dup)
- findAgent (first attempt): +2 LOC, same duplication (return undefined in other files)
- safeEmit helper: -4 LOC, same duplication (different catch comments)

## Natural Floor
Remaining 124 duplicated lines are structural JS syntax, framework API boilerplate,
type declarations, SECURITY CRITICAL SBPL template, and cross-file patterns that
represent genuine different code paths.

## Future Ideas
- Mutation testing (Stryker) to verify test coverage quality
- E2E testing with pi core
- Extract sandbox state into a state object (reduces coupling, not LOC)
