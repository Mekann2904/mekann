# Test Suite

This repository uses [Vitest](https://vitest.dev/) for testing.

## Quick Start

```bash
# Run all tests
npm test

# Run tests for specific module
cd plan-mode && npm test
cd sandbox && npm test
cd zip-repo && npm test

# Run with coverage
cd sandbox && npx vitest run --coverage
cd plan-mode && npx vitest run --coverage
```

## Test Structure

### plan-mode (276 tests)

| File | Tests | Description |
|------|-------|-------------|
| `plan-mode.test.ts` | 276 | utils.ts + state.ts + integration scenarios |

**Coverage**: 97.84% statements, 97.1% branches

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

## Adding Tests

1. **Pure functions**: Extract to exported functions and test directly
2. **Extension handlers**: Mock `ExtensionAPI` and test behavior
3. **Integration tests**: Use `describeMac` / `itSandbox` pattern for macOS-only tests
4. **Coverage**: Run `npx vitest run --coverage` to identify gaps
