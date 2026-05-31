# 0014. Retire the planning collaboration mode and keep read-only explicit

## Status
Superseded

## Context
The old planning collaboration mode combined planning/design discussion with a read-only safety posture. That naming became misleading once planning workflows moved to skills such as `grill-with-docs`, `to-prd`, `to-issues`, `prototype`, `improve-codebase-architecture`, `diagnose`, and `tdd`.

## Decision
Remove the dedicated planning collaboration mode from runtime code.

- Planning is handled by skills in normal conversation flow.
- Read-only mode is the user-facing no-write posture and owns read-only tool restrictions plus the sandbox override.
- Keep runtime mode `read_only` and `/read-only`.
- Do not keep the old planning command, startup flag, status labels, or package/script/workflow names.

## Consequences
There is one explicit no-write posture: Read-only mode. Planning remains a workflow concern, not a runtime mode or safety boundary.
