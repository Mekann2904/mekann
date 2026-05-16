# Autoresearch: Test Coverage Improvement

## Goal
Improve test coverage across all modules, targeting >98% statement coverage.

## Metric
- **Primary**: uncovered statements (lower is better)
- **Baseline**: 183 uncovered (out of 2270 total)
- **Direction**: lower is better

## Current Status
- **Uncovered**: 40 statements (natural floor)
- **Coverage**: 98.24%
- **Total tests**: 1494 (was 1392, +102)

## Experiments Summary
| # | Description | Δ Uncovered | Status |
|---|---|---|---|
| 1 | goal/lifecycle.test.ts (21 tests) | 183→129 (-54) | keep |
| 2 | command.test.ts +19, tool.test.ts +5 | 129→85 (-44) | keep |
| 3 | goal/prompts.test.ts (28 tests) | 85→73 (-12) | keep |
| 4 | autoresearch loop tests +7 | 73→57 (-16) | keep |
| 5 | goal/runtime.test.ts +21 | 57→44 (-13) | keep |
| 6 | goal/command.test.ts +3 | 44→40 (-4) | keep |
| 7 | hasCompleteMarker edge cases | 40→40 (0) | discard |

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
