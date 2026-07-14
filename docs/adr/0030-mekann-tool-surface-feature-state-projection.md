# Mekann tool surface is projected from explicit Feature state

## Status

Accepted

## Context

Mekann already uses `getActiveTools` / `setActiveTools` and feature-local `toolSurface` settings for Goal, Subagent, Autoresearch, Output gate, and Context ledger. The behavior is distributed across features, however, so there is no single place to observe projected schema savings, verify that an inactive tool would not have been needed, or fail open consistently when the host interface changes.

Tool schemas consume provider input on every request and can churn the cache prefix. A Planner could infer task intent and choose tools, but the current Planner is heuristic and is not calibrated strongly enough to hide capabilities safely. Mekann also observes registrations through a temporary `registerTool` monkey-patch; ADR-0028 requires replacing that workaround with an official Pi hook rather than expanding its authority.

The design must reduce recurring input cost without allowing Mekann to hide Pi-owned or third-party capabilities, and without turning an SDK compatibility failure into loss of coding functionality.

## Decision

### Scope

Tool surface optimization controls only Mekann-owned tools. Pi-owned and third-party tools remain outside its authority. Extending optimization to those tools requires a future official Pi deferred-tool interface and a separate decision.

### Projection source

The Mekann tool surface is projected from explicit Feature state. Runtime facts such as an active Goal, an active Autoresearch run, an available Output gate artifact, or the active collaboration mode may expose the corresponding tools. Planner inference and free-form prompt classification do not decide tool visibility.

### Failure behavior

Projection is fail-open. If `getActiveTools` or `setActiveTools` is unavailable, throws, or cannot be verified, Mekann preserves the existing visible tool set, records a diagnostic, and reports that optimization is inactive. Coding capability takes precedence over schema savings.

### Rollout

Rollout has two stages:

1. **Tool surface shadow mode** records the current and projected Mekann tool surfaces, prospective schema-byte savings, and evidence that a hidden-by-projection tool was subsequently needed. It does not change active tools.
2. **Enforcement** may begin only after shadow evidence shows acceptable missed-tool behavior. Enforcement applies the same projection through the host interface and retains fail-open behavior.

The runtime must expose status and a session-local escape hatch that restores all Mekann-owned tools. Shadow telemetry must distinguish predicted savings from provider-reported token or cache effects; prospective schema bytes are not Actual cache usage.

### Module shape

A single Tool surface projection module owns Mekann-tool declarations, Feature-state projection, shadow observations, host adaptation, diagnostics, and enforcement status. Feature implementations declare ownership and state; they do not each reinterpret failure policy or telemetry.

## Considered Options

### Optimize all registered tools

Rejected. Mekann cannot reliably infer ownership or activation semantics for Pi and third-party tools. Expanding the `registerTool` monkey-patch would contradict the migration direction in ADR-0028.

### Planner-selected tools

Rejected for enforcement. The Planner uses configurable heuristics and static quality-risk labels that are appropriate for recommendations, not for removing capabilities.

### A model-facing tool-search tool first

Deferred. It may provide greater savings, but introduces a discoverability failure mode when the model does not search. Explicit Feature-state projection is mechanically testable and should establish the baseline first.

### Immediate enforcement

Rejected. Existing feature-local behavior does not provide unified missed-tool evidence or calibrated savings. Shadow mode is required before changing the default surface.

## Consequences

- Mekann-owned tool declarations must become centrally observable while feature behavior remains locally owned.
- Existing feature-local `setToolsActive` calls should migrate behind the Tool surface projection module rather than receive another module on top.
- Tests must cover projection rules, SDK absence and exceptions, session-local restore-all behavior, and shadow/enforcement equivalence.
- Schema-byte reduction is a prospective metric until correlated with provider usage and Actual cache usage.
- ADR-0028 remains authoritative for registration observation: the temporary monkey-patch is not promoted into a control seam.
