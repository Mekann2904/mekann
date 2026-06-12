# 0015. Continue unfinished skill flows after implementation work

## Status
Superseded

## Context
Planning work is routed through skills such as `grill-with-docs`, `to-prd`, `to-issues`, `prototype`, `improve-codebase-architecture`, `diagnose`, and `tdd`. Once a plan is small and clear enough to implement, the agent asks whether to proceed and then main-mode implementation work begins.

That left one lifecycle gap: implementation may finish one slice while the larger skill flow is not yet complete. For example, `to-issues` may create several independently grabbable vertical slices, and implementation may complete only the first slice. During implementation, the agent may also discover that the original plan has a specification gap, architectural risk, UI uncertainty, or an unresolved bug cause.

## Decision
Implementation completion is a checkpoint, not always the end of the whole workflow.

When implementation work completes:

- If the whole requested flow is complete, report what changed, report validation, and return to the neutral next-instruction state.
- If a multi-slice / multi-issue flow remains and the next slice is already small and clear, ask whether to continue with the next unblocked slice and continue directly with `tdd` when the user agrees.
- If implementation invalidates the plan or reveals a missing decision, re-enter the smallest useful skill:
  - specification or terminology gap → `grill-with-docs` or `to-prd`
  - architecture, boundary, coupling, or testability risk → `improve-codebase-architecture`
  - UI, state, or interaction uncertainty → `prototype`
  - unresolved bug cause or unexpected regression → `diagnose`
  - high-impact product or engineering decision → ask the user
- If implementation is blocked and no skill clearly applies, stop and ask the user for direction.

## Consequences
Main implementation work can participate in a larger skill chain without pretending every implementation completion is final. Multi-slice work remains efficient because planned, unblocked slices can continue through TDD without unnecessary mode churn. Newly discovered uncertainty routes back to the relevant planning skill so the destination or journey can be repaired before more code is changed.
