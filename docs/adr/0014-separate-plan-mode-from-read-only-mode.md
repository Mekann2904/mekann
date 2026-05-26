# 0014. Separate Plan mode from Read-only mode

## Status
Accepted

## Context
Plan mode used to combine two concerns: planning/design collaboration and a read-only safety posture. That made the name misleading once planning workflows needed to update domain docs inline through `grill-with-docs`, and it also encouraged treating Plan mode as a security boundary.

## Decision
Separate the concerns.

- Plan mode is a UX-level collaboration mode for planning, design discussion, and specification sharpening.
- Plan mode is not inherently read-only and uses the same sandbox posture as the mode it was entered from.
- Read-only mode is the user-facing no-write posture and owns the old read-only tool restrictions and sandbox override.
- Add runtime mode `read_only` and `/read-only`.
- Rename the sandbox capability profile from `read_only` to `read_only` without an alias.
- Remove `plan-grill-with-docs`; Plan mode instructs the agent to read and follow `grill-with-docs` instead.
- Remove Plan mode's implementation brief handoff workflow.

## Consequences
Plan mode can update docs during planning sessions when the active sandbox allows it. Users who want investigation without file changes explicitly enter Read-only mode. Future code should avoid using Plan mode as a synonym for read-only execution.
