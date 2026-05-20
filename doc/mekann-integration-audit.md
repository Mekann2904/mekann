# mekann integration and responsibility-separation audit plan

This document records the implementation checklist for verifying that the integrated `mekann` extension suite is wired correctly and keeps module responsibilities separated.

## Responsibility matrix

| Module | Owns | Must not own | Integration surface |
| --- | --- | --- | --- |
| `mekann/index.ts` | Suite load order | Feature behavior | Calls `core`, `safety`, `autonomy`, `utils` in order |
| `core/prompt-core` | Prompt fragment registry, canonical rendering, hashes | Pi lifecycle hooks, feature state | Imported by prompt-producing modules and `cache-friendly-prompt` |
| `core/cache-friendly-prompt` | Final prompt orchestration | Feature-specific state transitions | Pi hooks: `before_agent_start`, `context`, `before_provider_request`; emits `cache-friendly-prompt:dynamic-tail-sent` |
| `core/agent-guidelines` | Stable coding-guideline prompt fragment | Tool gating, lifecycle control | Prompt provider `agent-guidelines` |
| `safety/policy-core` | Shared mode names, event constants, read-only command intent vocabulary | UI, filesystem, Pi API calls | Imported by `plan-mode`, `sandbox`, and `goal` |
| `safety/plan-mode` | Plan/main mode transitions, active tool restriction, plan extraction, model/thinking profile switching | OS sandbox enforcement | Emits sandbox profile events and plan-mode status; registers prompt provider `plan-mode` |
| `safety/sandbox` | Bash/user_bash sandboxing, elevation, sandbox status UI | Plan parsing, goal continuation, autoresearch decisions | Overrides `bash`; registers `request_elevation`; consumes plan-mode/sandbox events |
| `autonomy/goal` | Persistent goal state, budget accounting, idle continuation | Tool restriction, sandbox profile changes, experiment evaluation | Consumes `PLAN_MODE_STATUS_EVENT`; registers `get_goal`, `create_goal`, `update_goal` |
| `autonomy/subagent` | Subagent lifecycle, mailbox, result store, mechanical apply queue | Autoresearch keep/discard decisions | Provides subagent tools and structured patch result storage |
| `autonomy/autoresearch` | Experiment contract/run/log/candidate evaluation | Subagent lifecycle implementation | Imports subagent results as candidates; root agent owns benchmark and decisions |
| `utils/zip-repo` | `/zip` archive command | Shared lifecycle or policy | Isolated command only |

## Static invariants now covered by tests

`mekann/mekann.test.ts` checks:

- root package exposes only `./mekann` as the extension entry
- suite entrypoints exist
- top-level load order is stable
- sandbox loads before plan-mode
- autonomy modules load as `goal`, `subagent`, `autoresearch`
- tool names remain owned by their expected module and do not collide
- command names remain owned by their expected module and do not collide
- plan-mode coordination consumers use the shared policy-core constant rather than a local event string

## Manual review checklist

1. Confirm prompt providers have unique provider ids and stable/semi-stable/dynamic classification matches each module's state volatility.
2. Confirm `plan-mode` and `sandbox` remain layered: plan-mode is UX/tool restriction, sandbox is OS-level bash enforcement.
3. Confirm `goal` suppresses continuation in plan mode but does not mutate sandbox or plan-mode state directly.
4. Confirm `autoresearch` uses `autoresearch_candidate_escrow` / `autoresearch_apply_candidate` / `autoresearch_run_contract` for subagent patches instead of marking subagent results applied directly.
5. Confirm `zip-repo` remains independent and only registers `/zip`.
6. Re-run docs consistency checks when defaults change, especially sandbox default mode and policy-core file layout.

## Verification commands

```bash
npm test
npm run typecheck
```

If the full suite fails, run module suites individually:

```bash
cd mekann && npm test
cd mekann/core/prompt-core && npm test
cd mekann/core/cache-friendly-prompt && npm test
cd mekann/safety/plan-mode && npm test
cd mekann/safety/sandbox && npm test
cd mekann/autonomy/goal && npm test
cd mekann/autonomy/subagent && npm test
cd mekann/autonomy/autoresearch && npm test
cd mekann/utils/zip-repo && npm test
```
