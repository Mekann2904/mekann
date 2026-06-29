import type { AutoresearchContractV1 } from "./contractV1.js";
import { contractViewForAgent, visibleChecks } from "./contractV1.js";
import type { SubagentAuthority, ValidationCommand } from "../subagent/types.js";
import { MEKANN_SUBAGENT_DEFAULTS } from "../../config.js";

export type AutoresearchSubagentRole = "scout" | "proposer" | "critic" | "historian";

function commandToValidationCommand(check: AutoresearchContractV1["evaluation"]["checks"][number]): ValidationCommand | null {
	const argv = check.command.argv;
	if (argv[0] === "npm" && argv[1] === "run" && typeof argv[2] === "string") return { kind: "npm_script", script: argv[2], args: argv.slice(3).filter((a) => a !== "--") };
	return null;
}

export function authorityFromContract(contract: AutoresearchContractV1, role: AutoresearchSubagentRole): SubagentAuthority {
	if (role !== "proposer") return { mode: "read_only" };
	return {
		mode: "propose_patch",
		write_scope: contract.scope.allowedWritePaths,
		require_base_hash: true,
		isolated_worktree: "preferred",
		max_patch_bytes: MEKANN_SUBAGENT_DEFAULTS.maxPatchBytes,
		allowed_commands: visibleChecks(contract).map(commandToValidationCommand).filter((v): v is ValidationCommand => Boolean(v)),
	};
}

export function suggestSubagents(contract: AutoresearchContractV1): { scouts: unknown[]; proposers: unknown[]; critics: unknown[] } {
	const view = contractViewForAgent(contract);
	const scopeNote = `Allowed write paths: ${JSON.stringify(contract.scope.allowedWritePaths)}\nForbidden write paths: ${JSON.stringify(contract.scope.forbiddenWritePaths)}\nImmutable read paths: ${JSON.stringify(contract.scope.immutableReadPaths)}`;
	return {
		scouts: [{
			task_name: "research/autoresearch-scout",
			message: `Read-only scout. Investigate bottlenecks and propose experiment ideas. Do not edit files, run benchmarks, or call autoresearch tools. Agent-visible contract view:\n${JSON.stringify(view, null, 2)}\n${scopeNote}`,
			authority: authorityFromContract(contract, "scout"),
		}],
		proposers: [{
			task_name: "propose/autoresearch-candidate",
			message: `Create one minimal patch proposal as subagent.result.v1. Do not run benchmark. Respect contract scope. Evaluator-only checks, if any, are intentionally hidden.\n${scopeNote}\nPrimary metric: ${contract.evaluation.primaryMetric.name} (${contract.evaluation.primaryMetric.direction})`,
			authority: authorityFromContract(contract, "proposer"),
			result_contract: "subagent_result_v1",
		}],
		critics: [{
			task_name: "review/autoresearch-critic",
			message: `Read-only critic. Review candidate risks, metric hacking risk, hidden side effects, and whether touched paths match the contract. Do not edit files.\n${scopeNote}`,
			authority: authorityFromContract(contract, "critic"),
		}],
	};
}
