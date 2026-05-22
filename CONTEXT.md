# Mekann Pi Extensions Context

Mekann is a suite of pi extensions for safety, autonomy, context, core prompt handling, utilities, and skills. This context records project-specific language so architecture reviews and refactors use the same names.

## Language

**Pi extension suite**:
A grouped set of pi extensions loaded together by the `mekann` wrapper. A suite collects related modules such as safety, autonomy, context, core, and utils.
_Avoid_: plugin bundle, package group

**Subagent result**:
The structured outcome produced by a subagent and stored for later review, application, or escrow. A subagent result may be a patch proposal, observation, no-change result, blocked result, or decision request.
_Avoid_: child output, agent response

**Patch proposal**:
A subagent result whose outcome is `patch` and whose payload includes a unified diff plus declared base, scope, semantic metadata, and validation hints. A patch proposal is not trusted merely because it exists.
_Avoid_: patch response, diff result

**PatchProposalPolicy**:
The module that decides whether a patch proposal can move to the next stage by checking patch safety, declared touched paths, authority scope, base hashes, and public surface declarations. It produces findings that candidate escrow and subagent apply can interpret differently.
_Avoid_: PatchProposalValidator, SubagentResultTrust

**Candidate escrow**:
The autoresearch step that stores a trusted patch proposal as an experiment candidate without applying it to the main worktree. Candidate escrow preserves the patch for later evaluation under the autoresearch contract.
_Avoid_: candidate import, patch staging

**Subagent apply**:
The step that applies a trusted patch proposal to the workspace after policy checks, semantic conflict checks, git apply checks, and requested validation commands.
_Avoid_: patch merge, result execution

## Example dialogue

Developer: “Can this subagent result become an autoresearch candidate?”
Domain expert: “Only if its patch proposal passes PatchProposalPolicy. Candidate escrow should reject unsafe paths or undeclared public surface changes, but it should not run validation commands.”

Developer: “Can the same patch proposal go through subagent apply?”
Domain expert: “Yes, but subagent apply interprets the same findings with a different profile, then continues with semantic conflict checks, git apply, and validation commands.”
