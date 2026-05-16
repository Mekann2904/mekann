# Maintenance Research Notes

## Current State (2026-05-16 restart)

- **Baseline**: 6436 LOC, 24 files, 1392 tests
- **After Exp 1**: 6405 LOC (-31)
- **New modules since last session**: autoresearch/ (1279 LOC), goal/ (1601 LOC) — 45% of total

### File sizes (source LOC)
- autoresearch/index.ts: 837 (command handler + tool registrations)
- goal/index.ts: 645 (command handler + tool registrations)
- subagent/agentControl.ts: 489
- sandbox/index.ts: 422
- sandbox/macSeatbelt.ts: 420
- goal/runtime.ts: 347
- goal/state.ts: 359
- subagent/index.ts: 371
- subagent/registry.ts: 279
- plan-mode/index.ts: 283
- policy-core/modes.ts: 183
- autoresearch/runner.ts: 175
- autoresearch/state.ts: 182
- plan-mode/utils.ts: 183
- subagent/contextFork.ts: 97
- goal/prompts.ts: 149
- sandbox/permissions.ts: 153
- subagent/mailbox.ts: 160
- goal/render.ts: 75
- autoresearch/render.ts: 72
- zip-repo/index.ts: 171
- subagent/render.ts: 72
- subagent/types.ts: 251
- subagent/persistence.ts: 48

## First-Principles Analysis

### Premises

1. **P1**: Each extension needs its own directory structure — **fact** (pi extension contract)
2. **P2**: policy-core provides shared definitions — **fact** (verified by imports)
3. **P3**: SBPL template in macSeatbelt.ts must not be weakened — **fact** (SECURITY CRITICAL)
4. **P4**: `extractText` and `extractAssistantText` in contextFork.ts are identical — **resolved by Exp1** (now `extractTextFromContent`)
5. **P5**: subagent/types.ts has 10 lifecycle event interfaces with near-identical shapes — **fact**
6. **P6**: extractAssistantText is duplicated in agentControl.ts and contextFork.ts — **resolved by Exp1** (consolidated into `extractTextFromContent`)
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

1. **Lifecycle event type explosion** in types.ts: 10 separate interfaces for events that share {type, agentId, agentPath, timestamp} + 1-2 extra fields each. A new event type requires adding a new interface + updating LifecycleEvent union.

3. **sandbox/index.ts coupling**: 430-line file mixing mode management, yolo approval, bash tool handler, profile overrides, events, session lifecycle. Multiple responsibilities in one closure.

4. **agentControl.ts complexity**: 561 lines. Long methods (spawn is ~150 lines). Multiple concerns mixed.

5. **subagent/index.ts verbosity**: 473 lines, dominated by tool registration boilerplate. Each tool follows the same pattern (schema + execute + return).

6. **Hardcoded strings**: Japanese UI strings scattered throughout sandbox/index.ts and plan-mode. Not localized, but embedded in logic.

7. **Event type string literals**: Lifecycle event types are string literals scattered across files. Could benefit from constants.

### Hypotheses to Test

H1: ~~Extract `extractAssistantText` / `extractText` into shared utility~~ → **Done (Exp1): now `extractTextFromContent` in `contextFork.ts`. Consider moving to `messageContent.ts` if more callers appear.**
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

### Exp 1: Extract contentExtract.ts (KEEP, -120 pts)
- Deduplicated extractText/extractAssistantText
- 3977→3946 LOC, duplication 195→183

### Exp 2: Consolidate lifecycle event types with extends (DISCARD)
- Score 2560→2565 (+5), changed_loc penalty outweighed LOC bonus

### Exp 3: Delete unused SessionSource types (KEEP, -6 pts)
- 3946→3924 LOC, duplication 183→182

### Exp 4: Remove unused CAPABILITY_PROFILES (KEEP, -5 pts)
- 3924→3897 LOC

### Exp 5: Remove unused appendState (DISCARD)
- Score 2549→2550 (+1), changed_loc penalty

### Exp 6: Consolidate lifecycle events with LifecycleBase (KEEP, -9 pts)
- 3897→3832 LOC, duplication 182→181

### Exp 7-15: (see results.tsv for details)
- Previous session reached ~1075 score with 54 experiments

### Exp 16 (2026-05-16): Deduplicate on/default + formatDuration (KEEP, -31 LOC)
- autoresearch/index.ts: on/default cases merged into activateAutoresearch helper
- goal/render.ts: formatDuration moved to import from goal/prompts.ts
- 6436→6405 LOC, all 1392 tests pass

### Key Learnings
- Small dead code removals have minimal impact due to changed_loc penalty
- Helper extraction that reduces code volume AND duplication is high-value
- Deduplication of event construction patterns is the highest-leverage lever
- File count increase from new modules can offset max_file_loc benefits

### Current score breakdown (2345)
- duplication: 162 × 10 = 1620
- review_risk: 7 × 100 = 700
- complexity: 2 × 10 = 20
- test_seconds: ~10 × 1 = 10
- LOC bonus: -5 * ((-220)/100) = -10 (3757 vs 3977 baseline)
- Total: 1620 + 700 + 20 + 10 - 10 - 5(changed_loc) = 2345 ✓
