# Autoresearch Ideas

## Completed (Previous Session)
- ✅ Dead code removal: sanitizePlanTools, validateWritableRoots, assertMacSandboxAvailable
- ✅ Shared functions: resolveSafeRealPath, checkUnsafeRoot, killPgSigkill, effectiveRoots, approveFullAccess
- ✅ Helpers: withModelSuppressed/withThinkingSuppressed, updateConfigField, persistIfChanged, applyThinking
- ✅ Merged handlers: registerModeConfigCommand factory, stdout/stderr data handlers
- ✅ Removed unused wrappers: updateModelConfig, updateThinkingConfig
- ✅ Removed unused params: compactOldProposedPlansInText keep param
- ✅ Removed unused variables: timeoutReject, abortReject
- ✅ Simplified: getArgumentCompletions, ModeConfigSection inline, static import for stat

## Current Session Achievements
- ✅ Consolidated stdout/stderr data handlers (onStreamData) — -16 LOC
- ✅ Merged killProcessGroup into requestTerminate — -5 LOC
- ✅ Removed unused updateModelConfig/updateThinkingConfig wrappers — -6 LOC
- ✅ Simplified compactOldProposedPlansInText (remove keep param) — -4 LOC
- ✅ Simplified sandbox-mode getArgumentCompletions — -4 LOC
- ✅ Extracted applyThinking helper — -3 LOC
- ✅ Removed unused timeoutReject/abortReject — -4 LOC
- ✅ Simplified truncateForLlm — -2 LOC
- ✅ Code cleanup: static import for stat in resolveGitdirPaths

## Remaining Opportunities (Diminishing Returns)
- **SBPL template in macSeatbelt.ts (~130 lines)**: Hard to reduce without compromising readability of security policy
- **sandbox/index.ts localBash lazy init pattern (~15 lines)**: Necessary for correct CWD handling
- **Comment removal**: ~85 comment lines in macSeatbelt.ts, ~29 in plan-mode/index.ts — NOT recommended for security-critical code
- **Test mock consolidation**: Would reduce test LOC, not source LOC

## Future Ideas
- **Mutation testing**: Stryker for test quality verification
- **E2E testing**: Integration tests with pi core
- **Cross-platform tests**: Linux sandbox testing (sandbox-exec alternative)
- **ESLint**: Code style unification
