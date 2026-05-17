# Autoresearch: Test Coverage Improvement

## Goal
Improve test coverage across all modules, targeting >98% statement coverage.

## Metric
- **Primary**: uncovered statements (lower is better)
- **Baseline**: 183 uncovered (out of 2270 total)
- **Direction**: lower is better

## Current Status
- **Score**: 3652 (best, -10.3% from baseline 4072)
- **Source LOC**: 6288
- **Source files**: 20
- **Total tests**: 1492
- **Complexity functions**: 2
- **Duplication**: 270
- **Review risk**: 9

## Session: Maintenance Cost Reduction (2026-05-17)

| # | Description | Δ Score | Status |
|---|---|---|---|
| 0 | Baseline | 4072 | baseline |
| 1 | (previous session baseline) | - | baseline |
| 2 | uw() helper for updateWidget | +20 | discard |
| 3 | Move git helpers to runner.ts | -95 | keep |
| 4 | Move loop helpers to runner.ts | -100 | keep |
| 5 | Extract parseRunEntry from reconstructState | -10 | keep |
| 6 | Delete unused persistence.ts | -115 | keep |
| 7 | Merge render.ts into types.ts | -100 | keep |
| 8 | notifyError helper in goal/index.ts | 0 | discard |
| 9 | Merge plan-mode/utils.ts into index.ts | FAIL | discard |

## Rules
- All tests must pass (`npm test`)
- No behavior changes to source code
- Coverage measured per-module via `npx vitest run --coverage`

## Per-Module Coverage
| Module | Stmts | Branch | Tests |
|--------|-------|--------|-------|
| goal | 96.98% | 89.21% | 205 |
| autoresearch | 97.06% | 90.07% | 168 |
| plan-mode | 98.84% | 97.04% | 364 |
| sandbox | 98.09% | 96.10% | 465 |
| subagent | 99.43% | 93.71% | 235 |
| zip-repo | 100% | 100% | 57 |

## Benchmark
```bash
cd /Users/mekann/github/pi-plugin/mekann && npm test
```

## Coverage per module
```bash
for dir in autoresearch goal plan-mode sandbox subagent; do
  cd $dir && npx vitest run --coverage 2>&1 | grep -E '(File|% |Statements)'
  cd ..
done
```
