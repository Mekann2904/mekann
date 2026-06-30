import type { AutoresearchContractV1 } from "./schema.js";

export type CheckVisibility = "agent_visible" | "evaluator_only";
export type CheckPhase = "pre_benchmark" | "post_benchmark";
export type ContractCheck = AutoresearchContractV1["evaluation"]["checks"][number];

export function checkVisibility(check: ContractCheck): CheckVisibility {
	return check.visibility === "evaluator_only" ? "evaluator_only" : "agent_visible";
}

export function checkPhase(check: ContractCheck): CheckPhase {
	return check.phase === "pre_benchmark" ? "pre_benchmark" : "post_benchmark";
}

export function visibleChecks(contract: AutoresearchContractV1): ContractCheck[] {
	return contract.evaluation.checks.filter((c) => checkVisibility(c) === "agent_visible");
}

export function evaluatorOnlyChecks(contract: AutoresearchContractV1): ContractCheck[] {
	return contract.evaluation.checks.filter((c) => checkVisibility(c) === "evaluator_only");
}

export function contractViewForAgent(contract: AutoresearchContractV1): AutoresearchContractV1 {
	return {
		...contract,
		evaluation: {
			...contract.evaluation,
			checks: visibleChecks(contract),
		},
	};
}
