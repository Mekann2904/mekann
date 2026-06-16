# 0025. Protect repo metadata dirs from a single source (incl. `.pi`)

## Status
Accepted

## Context
Repo-metadata path protection had drifted across three surfaces (GitHub issue #80, bug-candidates C-004 / C-005):

- `safeRepoRelativePath` existed twice with different return types and different protection strength. The autoresearch copy (`candidate.ts`) did **not** reject `.git`/`.pi`, so a patch touching `.git/config` or `.pi/...` was not flagged `unsafe_path` by `validateTouchedAgainstContract`. The subagent copy (`fingerprint.ts`) rejected `.git`/`.pi` but not `.codex`/`.agents`.
- The macOS Seatbelt SBPL deny regex protected `.git/.codex/.agents` at any depth but **not** `.pi`, while the programmatic `isProtectedPath` helper (also `.git/.codex/.agents`) was dead code never called from enforcement.

The mismatch was silent — no ADR stated an intent to leave `.pi` writable. Since `.pi/` is the Context control plane (subagent-results, ledger, output-gate artifacts per `CONTEXT.md`), a `workspace_write` sandbox could let an agent rewrite its own audit log or candidate patch.

## Decision
Make one list the single source of truth and derive every surface from it.

- `PROTECTED_DIRS = [".git", ".pi", ".codex", ".agents"]` lives in `mekann/safety/sandbox/permissions.ts` and is exported.
- `safeRepoRelativePath` (repo-relative path validation, rejects top-level protected dirs) is defined once in `permissions.ts` and shared by both `candidate.ts` (autoresearch) and `fingerprint.ts` (subagent). `fingerprint.ts` re-exports it to preserve its public API.
- `isProtectedPath` (absolute-path, any-depth check) uses the same `PROTECTED_DIRS`.
- The SBPL deny regex in `macSeatbelt.ts` is generated from `PROTECTED_DIRS` via `protectedDirsSbplAlternation()`, so Seatbelt enforcement and the helpers can never drift again.
- `.pi` is protected on all surfaces, matching the subagent side.

`safeRepoRelativePath` keeps top-level-only protection (matching prior behavior) while `isProtectedPath`/SBPL protect at any depth; this preserves the existing contract where deep paths like `vendor/submodule/.git` are governed by the sandbox, not by patch-path validation.

## Consequences
- One list to edit when the protected-metadata set changes; all three enforcement surfaces stay consistent automatically.
- Patches touching `.git/.pi/.codex/.agents` at the repo root are rejected as `unsafe_path` in autoresearch candidate validation, closing the C-004 gap.
- `workspace_write` no longer permits writes under `.pi/`, protecting the audit/control-plane artifacts (C-005).
- SBPL policy snapshots and the `permissions.js` test mocks were updated to reflect `.pi` and the generated regex; future list changes update snapshots via the snapshot tests rather than hand-editing the regex.
