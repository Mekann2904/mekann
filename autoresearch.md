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
(Baseline run)
