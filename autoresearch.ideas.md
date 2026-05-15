# Autoresearch Ideas

## Session Status: 2680 → 1319 (-50.8%), 29 experiments

## Completed
- ✅ Dead code removal, deduplication, single-use inlining
- ✅ Multi-line import/export/brace/throw/return compression
- ✅ File merging: 21→15 files (capabilities, approvals, state, contentExtract, commandIntent, agentPath, pathPolicy)
- ✅ Helper extraction: evBase, enqueueToMailbox, resolveAgentOrFail, setStatusAndPublish, allAgents, toolResult, withCtrl, disableSandbox, refreshStatusBar, logProfileRejection, logBlockedTool, shutdownControl
- ✅ Merge duplicate branches (contextFork user/assistant loop)
- ❌ textResponse helper: net LOC increase
- ❌ Import merge: net LOC increase

## Natural Floor Reached
The remaining 131 duplicated lines are:
- 48 `/**` + 48 `*/` + 19 `*` = JSDoc markers (115 occurrences, 3 unique dup lines = 30 pts)
- 22 `try {`, 16 `return;`, etc. = structural JS syntax (~20 unique dup lines = 200 pts)
- 10 `description:`, 8 `pi.registerTool({`, etc. = API-inherent boilerplate
- 7 `: ""` = SBPL template (SECURITY CRITICAL)
- 5 `ctx: ExtensionContext,` = method signatures
- 5 `const callerPath = this.resolveCallerPath(ctx)` = method boilerplate
- Type fields (agentPath, nickname, role) = different interfaces

These cannot be reduced without:
- Removing documentation (counter-productive)
- Over-abstracting method signatures
- Changing API patterns

## Future Ideas
- Mutation testing (Stryker) to verify test coverage quality
- E2E testing with pi core
- Extract sandbox state into a state object (reduces coupling, not LOC)
