# Autoresearch Ideas

## Session Status: 2680 → 1075 (-59.9%), 54 experiments

## Completed
- ✅ Dead code removal, deduplication, single-use inlining
- ✅ Multi-line import/export/brace/throw/return compression
- ✅ File merging: 21→15 files (capabilities, approvals, state, contentExtract, commandIntent, agentPath, pathPolicy)
- ✅ Helper extraction: evBase, enqueueToMailbox, resolveAgentOrFail, setStatusAndPublish, toolResult, withCtrl, disableSandbox, refreshStatusBar, logProfileRejection, logBlockedTool, shutdownControl, safeEmit, filterAgents, findAgent
- ✅ Merge duplicate branches (contextFork user/assistant loop)
- ✅ Delegate agentControl.openCount → registry.openCount
- ✅ Alias FollowupTaskParams = SendMessageParams
- ✅ Split buildMacSeatbeltPolicy into sub-functions (complexity 2→1)
- ✅ Extract resolveTargetSession helper (sendMessage/followupTask/close)
- ✅ Extract removeProfileEntry helper (profileOverrideStack find+splice)
- ✅ Merge duplicate sendUserMessage branches in followupTask
- ✅ Add listAgents() to avoid snake_case round-trip in /agents command
- ✅ mkPolicy factory (readOnlyPolicy/workspaceWritePolicy/yoloPolicy)
- ✅ validateSegments helper in types.ts
- ❌ textResponse helper: net LOC increase
- ❌ Import merge: net LOC increase

## Near-Floor Experiments (no score change)
- resetAllState helper: creates new dup (clearMainModel/errMsg pattern)
- errMsg helper: replaces one dup with another, net zero
- clearMainModel helper: replaces one dup with another, marginal -1
- resolveCallerAndAgent helper: +4 LOC, same duplication
- spawnSandboxedProcess helper: +4 LOC, same duplication
- collectSandboxOutput extraction: score worsened (+1 dup)
- findAgent (first attempt): +2 LOC, same duplication
- safeEmit helper: -4 LOC, same duplication

## Natural Floor
Remaining 108 duplicated lines are structural JS/TS syntax (try, catch, return, braces),
framework API boilerplate (pi.registerTool, promptGuidelines, Type.String),
type field declarations across independent interfaces (agentId, message, target),
SBPL security rules, and cross-file patterns (createdAt/updatedAt, now, imports)
that represent genuine different code paths. The `runSandboxedShellMac` function
(121 lines with deep closure state) is the sole remaining complexity >50.

## Future Ideas
- Mutation testing (Stryker) to verify test coverage quality
- E2E testing with pi core
- Extract sandbox state into a state object (reduces coupling, not LOC)
- Split runSandboxedShellMac into class-based state machine (high risk, 121 lines of closures)
