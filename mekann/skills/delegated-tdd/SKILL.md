---
name: delegated-tdd
description: Cost-aware TDD where the current planning/review model writes the spec patch and implementation brief, then delegates implementation patch proposals to a configured cheaper implementation model. Use when the user wants TDD with model-cost reduction, delegated implementation, or gpt-5.5 planning/review with glm implementation.
---

# Delegated TDD

## Language policy

Use Japanese explicitly for all interaction with the user: questions, recommendations, explanations, summaries, issue/PRD/report text, and documentation updates created during the session. Keep existing project terms, code identifiers, file names, labels, and quoted text in their original language when needed, but explain them in Japanese.

## Purpose

Use **Delegated TDD** when the user wants high-quality planning, test design, and review from the current parent model while reducing the cost of repeated implementation attempts. The parent model owns the problem framing, architecture, spec patch, implementation brief, and final review. A configured implementation model owns only the implementation patch proposal loop.

This workflow is for tasks where test-driven implementation iteration is likely to pay for itself: feature work, bug fixes with regression tests, multi-file changes, or changes where separating design/review from implementation reduces cost. Do not use it for documentation-only changes, configuration-only changes, one-line fixes, or investigation-only tasks unless the user explicitly insists after you explain the overhead.

## Required model setting

Fail closed if the implementation model is not configured. Do **not** silently inherit the parent model for the implementation subagent.

Before starting, inspect the relevant Pi settings locations if available, such as:

- workspace settings: `.pi/settings.json`
- global settings: `~/.pi/agent/settings.json`

Expected shape:

```json
{
  "delegatedTdd": {
    "implementationModel": "glm-5.1",
    "implementationEffort": "high",
    "maxImplementationAttempts": 2
  }
}
```

Defaults:

- `implementationModel`: required
- `implementationEffort`: `high` if omitted
- `maxImplementationAttempts`: `2` if omitted

If `delegatedTdd.implementationModel` is absent, stop and ask the user to configure it. Do not spawn an implementation subagent.

## Workspace safety

MVP requires a clean working tree before applying a spec patch or trial implementation patch. If the working tree is dirty, stop and ask the user to commit, stash, or use another worktree. Do not discard unrelated user changes.

Future isolated-worktree support may relax this, but this skill assumes main-worktree trial apply/revert safety.

## Role split

### Parent planning/review model

The current parent model is the planning and review model. It must:

- understand the problem and relevant architecture
- explore code only as far as needed for TDD-quality planning
- read `CONTEXT.md` and ADRs when domain language or architectural boundaries matter
- create the spec patch: tests or specification-facing changes
- create the delegated implementation brief
- apply the spec patch separately from implementation patches
- trial apply implementation patch proposals
- run checks
- perform final review after checks pass

### Implementation model

The implementation model runs as a subagent with explicit `model` and `reasoning_effort`. It must:

- return an implementation patch proposal only
- treat the spec patch and tests as fixed
- avoid editing tests
- stay within the allowed implementation scope
- return a test correction request if the tests appear wrong, contradictory, or unexecutable
- use failure handoff evidence to revise the implementation patch proposal

## Planning phase

Explore enough code to write a correct spec patch and brief, but avoid purposeless repo-wide reading.

Check:

- relevant existing tests
- target feature/API code
- nearby implementation patterns
- `CONTEXT.md` when project language matters
- `docs/adr/` when architectural decisions may constrain the change

Before editing, state the intended behavior and the first spec patch. Ask the user only when behavior, public interface, or risk is ambiguous.

## Spec patch vs implementation patch

Keep these separate.

- **Spec patch**: tests or specification-facing changes written by the parent model.
- **Implementation patch**: production-code changes proposed by the implementation model.

Apply the spec patch first. The implementation model must not weaken, rewrite, or remove the spec patch. If the loop is abandoned, make it clear whether the spec patch remains or should be reverted.

## Checks

Use two levels of checks:

- **Cheap checks**: narrow checks used during the implementation retry loop.
- **Acceptance checks**: broader checks required before final review and completion.

The parent model chooses both based on the task. Example:

```md
Cheap checks:
- npm test -- subagentLifecycle.test.ts

Acceptance checks:
- npm run test:subagent
- npm run typecheck
```

Prefer the smallest cheap checks that reliably exercise the spec patch. Do not skip acceptance checks unless the user explicitly accepts the risk.

## Delegated implementation brief template

Send a structured Markdown brief to the implementation subagent:

```md
## Goal
...

## Fixed tests / spec patch
Do not edit these files or weaken these assertions:
- ...

## Allowed implementation scope
You may edit:
- ...

## Forbidden changes
- Do not modify tests.
- Do not weaken behavior.
- Do not broaden scope beyond the requested fix.
- Do not touch unrelated files.

## Cheap checks
- ...

## Acceptance checks
- ...

## If blocked
Return a test correction request instead of editing tests. Explain exactly why the fixed tests are wrong, contradictory, or unexecutable.

## Expected result
Return a patch proposal only. Include changed files, rationale, and any checks you could reason about. Do not claim checks were run unless you actually ran them.
```

Spawn the subagent with:

- `model`: configured `delegatedTdd.implementationModel`
- `reasoning_effort`: configured `delegatedTdd.implementationEffort` or `high`
- `authority.mode`: `propose_patch`
- `authority.write_scope`: the allowed implementation scope
- `authority.require_base_hash`: `true` when practical
- `result_contract`: request a patch proposal, no-change result, blocked result, or test correction request

## Implementation loop

1. Ensure working tree is clean.
2. Apply the parent-created spec patch.
3. Spawn the implementation subagent with the delegated implementation brief.
4. Wait for the patch proposal.
5. Review it for obvious scope/test violations before applying.
6. Trial apply the implementation patch.
7. Run cheap checks.
8. If cheap checks fail, provide a failure handoff and ask the implementation model for a revised patch proposal, up to `maxImplementationAttempts`.
9. When cheap checks pass, run acceptance checks.
10. If acceptance checks pass, perform parent final review.
11. If final review passes, summarize the spec patch, implementation patch, checks, and review result.

If attempts are exhausted, stop and report:

- attempts used
- latest failure handoff
- current patch state
- recommended next step

## Failure handoff

When checks fail, pass the failure evidence back to the implementation model.

Default to the full failure output. If the output is too long for inline context, rely on existing context-control features such as output gate: provide the preview plus artifact reference, and retrieve only the needed snippets if the implementation model requests more detail.

Do not spend parent-model tokens summarizing every failure by default. Add a short parent diagnosis only when the raw failure is confusing or likely to mislead the implementation model.

## Final review handling

After cheap and acceptance checks pass, the parent model reviews the implementation.

Classify review findings:

- **implementation-only issue**: create a review-fix brief and delegate another implementation patch proposal if attempts remain or if the user approves another cycle.
- **architecture / test / scope issue**: the parent updates the design, spec patch, or delegated implementation brief before delegating again.
- **unsafe / ambiguous issue**: stop and ask the user.

Do not let the implementation model decide that tests should be weakened or scope should expand.

## Reporting

MVP does not require cost telemetry. Do not invent token or cost savings.

Final summary should include:

- spec patch files
- implementation patch files
- implementation model used
- attempts used
- cheap checks run
- acceptance checks run
- final review result
- any remaining risks
