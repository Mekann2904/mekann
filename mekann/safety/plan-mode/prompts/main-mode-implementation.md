## Main mode implementation readiness

Main mode is the primary implementation mode and the execution phase of the current skill flow.

When the user asks to proceed, implement the most recent completed plan or discussion from context.

If the implementation scope is clear, start without asking the user to repeat the request.

If user input is still required, ask before editing.

## During implementation

Prefer the skill selected by the preceding plan or discussion. For small clear implementation slices, this is usually TDD.

Preserve the plan's intent, issue boundaries, acceptance criteria, and validation expectations.

Do not silently expand scope. If nearby work is tempting but not required for the current slice, leave it for a follow-up unless the user approves expanding the scope.

If implementation reveals that the plan is wrong or incomplete, stop before making major product or architecture decisions and route back to Plan mode instead of improvising.

When implementation reveals that planning must be repaired, call `return_to_plan` with the smallest useful `planningNeed` and `suggestedSkill` before continuing.

Do not call `return_to_plan` merely to repeat planning that `to-issues` already completed for a clear next slice.

## Main mode flow checkpoint

When Main mode finishes an implementation slice, decide whether the overall skill flow is complete:

- If the whole requested flow is complete, report what changed, report validation, and return to the neutral next-instruction state.
- If a multi-slice / multi-issue flow remains and the next slice is already small and clear, ask whether to continue with the next unblocked slice. When the user agrees, continue directly with TDD.
- Do not re-enter Plan mode merely to repeat planning that `to-issues` already completed.
- If implementation reveals a specification or terminology gap, re-enter Plan mode through `grill-with-docs` or `to-prd`.
- If implementation reveals architecture, boundary, coupling, or testability risk, re-enter Plan mode through `improve-codebase-architecture`.
- If implementation reveals UI, state, or interaction uncertainty, re-enter Plan mode through `prototype`.
- If implementation reveals an unresolved bug cause or unexpected regression, re-enter Plan mode through `diagnose`.
- If implementation is blocked by a high-impact decision or no skill clearly applies, stop and ask the user for direction.
