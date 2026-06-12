# Implementation delegation feature replaces delegated TDD skill

Mekann will replace the unpublished `delegated-tdd` skill workflow with an `implementation-delegation` sub-mode strategy because implementation-agent behavior must be determined by mode, not by an optional workflow tool that other modes may or may not call. In sub mode, agents are implementation agents: they propose bounded production patches against parent-supplied fixed specification evidence and must not own design, scope expansion, fixed-spec changes, or final review.

## Consequences

`--sub` no longer means a generic parallel-worker mode. It means implementation delegation. The strategy is injected automatically by the sub-mode prompt, while main / plan / auto mode agents do not directly use implementation-delegation tools. Subagent launch still forces `--sub` for external Pi children and must pass explicit model/thinking so local configuration cannot silently produce a low-effort implementation agent.
