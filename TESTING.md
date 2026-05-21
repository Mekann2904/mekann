# Test Suite

This repository uses [Vitest](https://vitest.dev/) for testing.

## Quick Start

```bash
# Run all tests
npm test

# Run tests for specific module
cd mekann/safety/plan-mode && npm test
cd mekann/safety/sandbox && npm test
cd mekann/context/output-gate && npm test

# Production typecheck (all mekann code, no tests)
npm run typecheck:prod

# Full typecheck chain (prod + sandbox + subagent)
npm run typecheck

# Run with coverage
cd mekann/safety/sandbox && npx vitest run --coverage
cd mekann/safety/plan-mode && npx vitest run --coverage
```

## Test Structure

### plan-mode (313 tests)

| File | Tests | Description |
|------|-------|-------------|
| `plan-mode.test.ts` | 276 | utils.ts + state.ts + integration scenarios |
| `index.test.ts` | 37 | Extension hooks via mock API |

**Coverage**: 79.5% statements, 71.7% branches (index.ts was 0% → 73.7%)

### sandbox (283 tests)

| File | Tests | Description |
|------|-------|-------------|
| `tests/macSeatbelt.test.ts` | 156 | SBPL generation, env isolation, policy validation, macOS integration |
| `tests/approvals.test.ts` | 43 | UX approval layer (NOT a security boundary) |
| `tests/permissions.test.ts` | 43 | Policy builders, parseSandboxMode, modeLabel |
| `tests/pathPolicy.test.ts` | 21 | Path validation, symlink escape detection |
| `tests/index.test.ts` | 20 | truncateForLlm, constants |

**Coverage**: ~65% statements (index.ts extension body is UI-dependent; pure functions are fully covered)

### output-gate (120 tests)

| File | Tests | Description |
|------|-------|-------------|
| `store.test.ts` | ~48 | Artifact CRUD, manifest JSONL, redaction, preview, SHA-256 |
| `search.test.ts` | ~33 | rg-backed search, literal/regex, case-sensitive, fallback line scan |
| `index.test.ts` | ~30 | Tool registration, command handler (list/show/stats/purge/clear), tool_result hook |
| `redact.test.ts` | ~13 | Secret redaction patterns |

### context-ledger (~62 tests)

| File | Tests | Description |
|------|-------|-------------|
| `store.test.ts` | ~21 | Event CRUD, search, stats, format, validation |
| `snapshot.test.ts` | ~16 | XML snapshot generation, byte budgets, command integration |
| `snapshot-store.test.ts` | ~6 | Snapshot file persistence, read/write/overwrite |
| `index.test.ts` | ~19 | Extension registration, tool execute, clamp, --write, restore, summarize |

### zip-repo (36 tests)

| File | Tests | Description |
|------|-------|-------------|
| `index.test.ts` | 36 | Pure utility functions extracted from handler |

## Type Checking

```bash
# Production code only (recommended gate)
npm run typecheck:prod

# Full chain: prod + workspace typechecks
npm run typecheck
```

`tsconfig.prod.json` includes `mekann/**/*.ts` and excludes test files. This is the primary gate for ensuring the integrated extension compiles cleanly.

## CI

GitHub Actions runs all tests on every push/PR:

- `typecheck-prod`: Production typecheck for all mekann code
- `plan-mode`: Ubuntu (unit tests)
- `sandbox-unit`: Ubuntu (unit tests only)
- `sandbox-macos`: macOS (full integration with sandbox-exec)
- `zip-repo`: Ubuntu (unit tests)
- `subagent`: Ubuntu (unit tests + typecheck)
- `autoresearch`: Ubuntu (unit tests)
- `goal`: Ubuntu (unit tests)
- `output-gate`: Ubuntu (unit tests)
- `ledger`: Ubuntu (unit tests)

## Pre-push Hook (Husky)

`git push` 前に [Husky](https://typicode.github.io/husky/) が自動的に `npm run prepush` を実行する。

```
prepush = typecheck + CI prepare + workflow checks + module tests (parallel)
  ├── typecheck (sandbox + subagent)
  ├── plan-mode coverage threshold
  ├── sandbox tests
  ├── subagent tests
  ├── zip-repo tests
  ├── autoresearch fast tests
  ├── goal tests
  ├── output-gate tests
  └── ledger tests
```

```bash
# 手動実行
npm run prepush

# 型チェックのみ
npm run typecheck
npm run typecheck:prod

# hook を一時的に無視して push
git push --no-verify
```

## Adding Tests

1. **Pure functions**: Extract to exported functions and test directly
2. **Extension handlers**: Mock `ExtensionAPI` and test behavior
3. **Integration tests**: Use `describeMac` / `itSandbox` pattern for macOS-only tests
4. **Coverage**: Run `npx vitest run --coverage` to identify gaps
