# Autoresearch Ideas

## Completed This Session (2,540 → 2,335 LOC)
- ✅ Consolidated stdout/stderr data handlers (onStreamData) — -16 LOC
- ✅ Merged killProcessGroup into requestTerminate — -5 LOC
- ✅ Removed unused updateModelConfig/updateThinkingConfig wrappers — -6 LOC
- ✅ Simplified compactOldProposedPlansInText (remove keep param) — -4 LOC
- ✅ Simplified sandbox-mode getArgumentCompletions — -4 LOC
- ✅ Extracted applyThinking helper — -3 LOC
- ✅ Removed unused timeoutReject/abortReject — -4 LOC
- ✅ Simplified truncateForLlm — -2 LOC
- ✅ Compressed JSDoc across macSeatbelt.ts (isMacSandboxAvailable, buildSandboxPath, buildSandboxEnv, resolveGitdirPaths, validatePolicy, buildMacSeatbeltPolicy, waitForProcessDeath, runSandboxedShellMac)
- ✅ Compressed inline comments (output tracking, requestTerminate, close handler, catch block)
- ✅ Simplified single-statement if blocks
- ✅ Arrow function shorthand in .map()
- ✅ Compressed comments in sandbox/index.ts (user_bash, localBash)

## Remaining Opportunities (Diminishing Returns)
- **SBPL template string in buildMacSeatbeltPolicy**: ~80 lines of SBPL policy template. Cannot compress without compromising security policy readability.
- **sandbox/index.ts localBash lazy init**: ~15 lines, necessary for correct CWD handling.
- **Section divider comments**: `// ─── ... ───` lines are single lines, minimal savings.
- **Blank lines**: ~100 in macSeatbelt.ts, ~70 in plan-mode/index.ts — removing would hurt readability.
- **Test mock consolidation**: Would reduce test LOC, not source LOC.

## Completed (Original Session: 2,753 → 2,540 LOC)
- Dead code removal, shared functions, extracted helpers, merged handlers, registerModeConfigCommand factory

## Future Ideas
- Mutation testing (Stryker)
- E2E testing with pi core
- Cross-platform sandbox tests
- ESLint for code style
