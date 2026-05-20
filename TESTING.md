# Test Suite

This repository uses [Vitest](https://vitest.dev/) for testing.

## Quick Start

```bash
# Run all tests
npm test

# Run tests for specific module
cd mekann/safety/plan-mode && npm test
cd mekann/safety/sandbox && npm test
cd mekann/utils/zip-repo && npm test

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

### zip-repo (36 tests)

| File | Tests | Description |
|------|-------|-------------|
| `index.test.ts` | 36 | Pure utility functions extracted from handler |

## CI

GitHub Actions runs all tests on every push/PR:

- `plan-mode`: Ubuntu (unit tests)
- `sandbox-unit`: Ubuntu (unit tests only)
- `sandbox-macos`: macOS (full integration with sandbox-exec)
- `zip-repo`: Ubuntu (unit tests)
- `subagent`: Ubuntu (unit tests + typecheck)
- `autoresearch`: Ubuntu (unit tests)
- `goal`: Ubuntu (unit tests)

## Pre-push Hook (Husky)

`git push` 前に [Husky](https://typicode.github.io/husky/) が自動的に `npm run prepush` を実行する。

```
prepush = typecheck + npm test
  ├── sandbox typecheck
  ├── subagent typecheck
  ├── plan-mode tests
  ├── sandbox tests
  ├── subagent tests
  ├── zip-repo tests
  ├── autoresearch tests
  └── goal tests
```

```bash
# 手動実行
npm run prepush

# 型チェックのみ
npm run typecheck

# hook を一時的に無視して push
git push --no-verify
```

## Adding Tests

1. **Pure functions**: Extract to exported functions and test directly
2. **Extension handlers**: Mock `ExtensionAPI` and test behavior
3. **Integration tests**: Use `describeMac` / `itSandbox` pattern for macOS-only tests
4. **Coverage**: Run `npx vitest run --coverage` to identify gaps
