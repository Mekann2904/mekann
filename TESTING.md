# Test Suite

This repository uses [Vitest](https://vitest.dev/) for testing.

## Quick Start

```bash
# Run all tests
npm test

# Run tests for specific module
cd mekann/safety/modes && npm test
cd mekann/safety/sandbox && npm test
cd mekann/context/output-gate && npm test

# Production typecheck (all mekann code, no tests)
npm run typecheck:prod

# Full typecheck chain (prod + sandbox + subagent)
npm run typecheck

# Run with coverage
cd mekann/safety/sandbox && npx vitest run --coverage
cd mekann/safety/modes && npx vitest run --coverage
```

## Test Structure

### modes

| File | Description |
|------|-------------|
| `coverage.test.ts` | Mode transitions, startup flags, model/thinking restoration |
| `index.test.ts` | Extension hooks via mock API |
| `property.test.ts` | Command-intent property tests |
| `settingsSchema.test.ts` | Settings schema validation |

**Coverage gate**: 85% line coverage

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

GitHub Actions runs the production typecheck and the listed module test suites on every push/PR:

- `typecheck-prod`: Production typecheck for all mekann code
- `modes`: Ubuntu (unit tests)
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
  ├── modes coverage threshold (85% line coverage)
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

### Git identity in tests (do NOT use `git config`)

Tests that spin up temporary git repos must NEVER call `git config user.email/name`.
Under parallel-execution race conditions the cwd can resolve to a linked worktree
instead of the temp dir, and in a worktree `git config --local` writes to the
**shared main-repo config** (`.git/config`), polluting the developer's real identity
and leaving `core.bare=true` behind. Once polluted, `git push` is blocked by the
pre-push hook (`scripts/check-git-local-safety.sh`) until cleaned.

Instead, provide the test identity through **environment variables**. They are
inherited by every child `git` process (including production `gitAutoCommit` in
`autoresearch/runner.ts`, which inherits `process.env`) without writing anywhere:

```ts
// In a vitest setup file (see mekann/autonomy/autoresearch/vitest.setup.ts):
process.env.GIT_AUTHOR_NAME = "Test User";
process.env.GIT_AUTHOR_EMAIL = "test@example.com";
process.env.GIT_COMMITTER_NAME = "Test User";
process.env.GIT_COMMITTER_EMAIL = "test@example.com";
```

For a one-off command, use `git -c user.email=... -c user.name=... <cmd>` or pass
the same env vars to the spawn — both avoid touching any config file.

If a worktree ever does get polluted, recover from the **shared** config with
`--file` (NOT `--local`, which targets the per-worktree config):

```bash
npm run check:git-local-safety -- --fix
# or manually:
git config --file "$(git rev-parse --git-common-dir)/config" --unset core.bare
git config --file "$(git rev-parse --git-common-dir)/config" --unset user.email
git config --file "$(git rev-parse --git-common-dir)/config" --unset user.name
```

See issue #39 for the full background.
