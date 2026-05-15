# Autoresearch: Maintenance Cost Reduction

## Goal
Reduce source LOC (excluding tests/config) while preserving all 765 tests and behavior.

## Metric
- **Primary**: source LOC (`.ts` excluding `*.test.*` and `vitest.config.*`)
- **Baseline**: 2,480 LOC
- **Direction**: lower is better

## Rules
- All tests must pass (`npm test` — 765 tests across plan-mode, sandbox, zip-repo)
- No behavior changes — tests should not need modification
- No cheating — don't just move code to test files or rename files
- Track test LOC separately (should remain stable)
- SECURITY CRITICAL code in macSeatbelt.ts SBPL template must not be weakened

## Benchmark
```bash
cd /Users/mekann/github/pi-plugin/mekann && npm test
```

## LOC Count
```bash
find . -maxdepth 2 -name '*.ts' ! -path '*/node_modules/*' ! -name '*.test.*' ! -name 'vitest.config.*' -exec cat {} + | wc -l
```
