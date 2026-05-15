# Autoresearch Ideas

## Completed This Session (2,540 → 2,230 LOC, -12.2%)
- ✅ Consolidated stdout/stderr data handlers (onStreamData) — -16 LOC
- ✅ Merged killProcessGroup into requestTerminate — -5 LOC
- ✅ Removed unused updateModelConfig/updateThinkingConfig wrappers — -6 LOC
- ✅ Simplified compactOldProposedPlansInText (remove keep param) — -4 LOC
- ✅ Simplified sandbox-mode getArgumentCompletions — -4 LOC
- ✅ Extracted applyThinking helper — -3 LOC
- ✅ Removed unused timeoutReject/abortReject — -4 LOC
- ✅ Simplified truncateForLlm — -2 LOC
- ✅ Compressed all multi-line JSDoc → single-line across all source files
- ✅ Compressed inline comments (output tracking, requestTerminate, close handler, catch block)
- ✅ Simplified single-statement if blocks
- ✅ Arrow function shorthand in .map()
- ✅ Compressed comments in sandbox/index.ts (user_bash, localBash, session_start)
- ✅ Removed stale JSDoc block (updateModelConfig leftover)
- ✅ Compressed module-level JSDoc (macSeatbelt 22→5, sandbox/index 18→5)
- ✅ Inlined implementation plan system prompt
- ✅ Compressed waitForProcessDeath comments + error handler

## Remaining Opportunities (Near Exhaustion)
- **SBPL template string**: ~80 lines of SBPL policy template — SECURITY CRITICAL, must not compress
- **Section dividers**: 33 `// ───` lines across files — readability aids, single lines each
- **Blank lines**: ~250 total but ~67 inside SBPL template; remaining ~180 are normal code spacing
- **SECURITY comments**: Cannot remove — safety-critical documentation
- **Test mock consolidation**: Would reduce test LOC, not source LOC

## Completed (Original Session: 2,753 → 2,540 LOC)
- Dead code removal, shared functions, extracted helpers, merged handlers, registerModeConfigCommand factory

## Future Ideas
- Mutation testing (Stryker)
- E2E testing with pi core
- Cross-platform sandbox tests
- ESLint for code style
