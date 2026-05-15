# Autoresearch Ideas

## Completed This Session (2,540 → 2,116 LOC, -16.7%)
- ✅ Consolidated stdout/stderr data handlers (onStreamData)
- ✅ Merged killProcessGroup into requestTerminate
- ✅ Removed unused wrappers (updateModelConfig/updateThinkingConfig, timeoutReject/abortReject)
- ✅ Compressed ALL multi-line JSDoc → single-line across 9 source files
- ✅ Compressed all module-level JSDoc
- ✅ Simplified single-statement if blocks + arrow shorthand
- ✅ Sandbox status: array+join → template literal with helpers
- ✅ Session_start: mode parsing + path resolution simplified
- ✅ Output assembly: array+push → filter(Boolean).join
- ✅ Inlined implementation plan system prompt
- ✅ Removed stale JSDoc block, compressed waitForProcessDeath
- ✅ Extracted applyThinking, simplified compactOldProposedPlansInText, truncateForLlm

## Remaining Opportunities (Near Exhaustion)
- **SBPL template string**: ~80 lines of SBPL policy — SECURITY CRITICAL
- **Module-level JSDoc** (7 files, ~30 lines): Important file-level docs
- **Section dividers**: ~30 `// ───` lines — readability aids
- **Blank lines**: ~180 in code (normal spacing) + ~67 in SBPL template
- **SECURITY comments**: Cannot remove

## Completed (Original Session: 2,753 → 2,540 LOC)
- Dead code removal, shared functions, extracted helpers, merged handlers, registerModeConfigCommand factory

## Future Ideas
- Mutation testing (Stryker)
- E2E testing with pi core
- Cross-platform sandbox tests
- ESLint for code style
