# Maintenance Research Notes

## Codebase Overview

4 pi extensions: plan-mode, sandbox, subagent, zip-repo + 1 shared policy-core.
Total: 3,977 source LOC across 21 files. 852 tests across 6 test files (~5,050 test LOC).

### File sizes (source LOC)
- subagent/agentControl.ts: 561 (largest — most complex)
- subagent/index.ts: 473 (tool registrations + commands)
- sandbox/macSeatbelt.ts: 460 (SBPL policy generation + sandboxed execution)
- sandbox/index.ts: 430 (sandbox mode management, events, bash handler)
- subagent/registry.ts: 293 (agent tracking, lifecycle events)
- plan-mode/index.ts: 298 (mode toggling, hooks)
- subagent/types.ts: 236 (type definitions)
- subagent/mailbox.ts: 166 (async message queue)
- plan-mode/utils.ts: 155 (utility functions)
- subagent/contextFork.ts: 128 (context extraction)
- zip-repo/index.ts: 113
- subagent/agentPath.ts: 110
- policy-core/commandIntent.ts: 105
- sandbox/pathPolicy.ts: 74
- subagent/render.ts: 72
- policy-core/modes.ts: 71
- sandbox/permissions.ts: 65
- subagent/persistence.ts: 48
- sandbox/approvals.ts: 47
- policy-core/capabilities.ts: 43
- plan-mode/state.ts: 29

## First-Principles Analysis

### Premises

1. **P1**: Each extension needs its own directory structure — **fact** (pi extension contract)
2. **P2**: policy-core provides shared definitions — **fact** (verified by imports)
3. **P3**: SBPL template in macSeatbelt.ts must not be weakened — **fact** (SECURITY CRITICAL)
4. **P4**: `extractText` and `extractAssistantText` in contextFork.ts are identical — **fact** (verified line-by-line)
5. **P5**: subagent/types.ts has 10 lifecycle event interfaces with near-identical shapes — **fact**
6. **P6**: extractAssistantText is duplicated in agentControl.ts and contextFork.ts — **fact**
7. **P7**: The 4 extensions are independent — **inference** (plan-mode and sandbox coordinate via events)
8. **P8**: Current code organization is optimal — **convention/unverified**
9. **P9**: Separate type definitions in types.ts are needed — **convention** (could use inline types)
10. **P10**: Sandbox index.ts at 430 lines is manageable — **unverified** (high coupling risk)

### Essential Facts (what remains if premises fail)
- Observable behavior: test suite validates behavior
- Explicit contracts: ExtensionAPI from pi SDK, SandboxPolicy, AgentMetadata
- Necessary data flow: commands → handlers → tools → execution
- Necessary state transitions: mode changes, agent lifecycle, sandbox profiles
- Necessary interfaces: ExtensionAPI, SandboxPolicy, AgentMetadata, MailboxItem

### Maintenance Cost Sources (prioritized)

1. **extractAssistantText duplicated** in agentControl.ts (lines ~515-530) and contextFork.ts (lines ~88-102). Identical logic. Change amplification: bug fix must touch 2 places.

2. **Lifecycle event type explosion** in types.ts: 10 separate interfaces for events that share {type, agentId, agentPath, timestamp} + 1-2 extra fields each. A new event type requires adding a new interface + updating LifecycleEvent union.

3. **sandbox/index.ts coupling**: 430-line file mixing mode management, yolo approval, bash tool handler, profile overrides, events, session lifecycle. Multiple responsibilities in one closure.

4. **agentControl.ts complexity**: 561 lines. Long methods (spawn is ~150 lines). Multiple concerns mixed.

5. **subagent/index.ts verbosity**: 473 lines, dominated by tool registration boilerplate. Each tool follows the same pattern (schema + execute + return).

6. **Hardcoded strings**: Japanese UI strings scattered throughout sandbox/index.ts and plan-mode. Not localized, but embedded in logic.

7. **Event type string literals**: Lifecycle event types are string literals scattered across files. Could benefit from constants.

8. **No shared text extraction utility**: Both contextFork.ts and agentControl.ts extract text from message content using identical code.

### Hypotheses to Test

H1: Extract `extractAssistantText` / `extractText` into shared utility → reduces duplication, reduces change amplification
H2: Consolidate lifecycle event interfaces into a single generic type → reduces type boilerplate
H3: Extract bash tool handler from sandbox/index.ts → reduces file size, improves locality
H4: Extract yolo approval management from sandbox/index.ts → reduces coupling
H5: Delete unused code / dead exports → reduces LOC without behavior change
H6: Reduce subagent/index.ts tool registration boilerplate → reduce LOC
H7: Inline trivial functions that add indirection without abstraction value

### Risks
- SBPL template is SECURITY CRITICAL — do NOT modify security logic
- Sandbox event coordination with plan-mode is fragile — changes must preserve event contracts
- Test mocks depend on internal structure — refactoring may break test imports

## Experiment Log

(Updated after each experiment)
