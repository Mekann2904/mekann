# Autoresearch: Code Cleanup

## Objective
Clean up the entire repository codebase — remove noise, fix inconsistencies, eliminate duplication, trim unnecessary files — while keeping all 79 tests passing.

## Metrics
- **Primary**: lines (total non-test source lines, lower is better) — removing dead code, duplication, and unnecessary files
- **Secondary**: test_count (must stay at 79), readability_score (subjective)

## How to Run
`./autoresearch.sh` — outputs `METRIC name=number` lines.

## Files in Scope
- `plan-mode/index.ts` — extension entry point
- `plan-mode/utils.ts` — utility functions (isSafeCommand, loadPrompt, etc.)
- `plan-mode/state.ts` — state types and helpers
- `plan-mode/plan-mode.test.ts` — test suite
- `plan-mode/vitest.config.ts` — vitest config (candidate for removal)
- `plan-mode/README.md` — extension docs
- `plan-mode/package.json` — package config
- `zip-repo/index.ts` — zip extension
- `zip-repo/package.json` — zip package config
- `README.md` — repo docs
- `package.json` — repo package config
- `.gitignore` — ignore rules

## Off Limits
- `plan-mode/package-lock.json` — needed for reproducible installs
- `plan-mode/prompts/*.md` — prompt files are content, not code
- `plan-mode/node_modules/` — dependencies

## Constraints
- All 79 tests must pass
- No behavior changes — the extensions must work identically
- No new dependencies
- Keep test coverage: don't remove tests

## What's Been Tried
- ✅ Removed 10 section comments from index.ts, 6 from utils.ts, 2 from state.ts (-20 lines)
- ✅ Deduplicated SAFE_PLAN_TOOLS Set in index.ts (-2 lines)
- ✅ Removed vitest.config.ts (default-only config)
- ✅ Removed 15 numbered step comments from zip-repo/index.ts
- ✅ Fixed README shortcut inconsistency (Ctrl+Alt+P → Cmd+P)
- ✅ Removed 18 decorative === separators from test file
- ✅ Trimmed stale utils.ts header comment
- ✅ Reused enterPlanMode() in session_start handler (-6 lines duplication)
- ✅ Removed unnecessary sanitizePlanTools() call (DEFAULT_PLAN_TOOLS has no write tools)
- ✅ Removed redundant resetBlockTracking() call at init
- ✅ Consolidated duplicate ctx.ui.notify('main') in exitPlanMode

### Dead ends / not worth it
- Stale test comment removal: 0 source lines saved (test file not counted)
- WRITING_TOOL_NAMES/BLOCK_REASON_HEADER unexport: not worth risk, used by tests
- Inlining enterPlanMode/exitPlanMode: hurts readability

