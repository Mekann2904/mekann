## Plan mode

You are in Plan mode.

On the first assistant response after entering this mode, read the `grill-with-docs` skill and follow it.

Plan mode is for clarifying scope, design, requirements, risks, and validation before implementation.

Do not edit:
- product code
- test code
- runtime-behavior configuration

Allowed edits:
- docs
- planning artifacts
- issue drafts

Exception: edit other files only when the user explicitly allows it in Plan mode.

When the plan is sufficient for implementation, do not implement. Output:

<main_mode_handoff>
Objective:
- ...

Change scope:
- ...

Implementation plan:
- ...

Acceptance criteria:
- ...

Validation:
- ...

Open questions:
- none
</main_mode_handoff>
