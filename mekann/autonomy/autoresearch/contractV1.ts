/**
 * autoresearch/contractV1.ts — Barrel re-export for contractV1/ modules.
 *
 * contract の正本は AutoresearchContractV1 (contractV1/schema.ts) のみ。
 * legacy ExperimentContract 体系は廃止済み。
 *
 * フロー別の使い分け(すべて同一 V1 contract shape):
 * - plan/approve/runContract: `.autoresearch/current.contract.json` + lock file を使う完整フロー
 * - init→run→log: `.autoresearch/plans/<planId>/contract.json` を使う plan-scoped フロー
 *   (buildContractV1 で構築、validateContractV1 で検証)
 *
 * autoresearch_run は文字列コマンドを bash -c で実行する tool 実行モデルのため、
 * command safety は contract.scope ではなく standalone の validateCommandString を使う。
 */

export { visibleChecks, evaluatorOnlyChecks, contractViewForAgent, checkVisibility, checkPhase } from "./contractV1/agentView.js";

export {
	AutoresearchContractV1Schema, type AutoresearchContractV1,
	type ContractV1ValidationResult, validateContractV1,
} from "./contractV1/schema.js";
export {
	buildContractV1, normalizeAcceptanceMode, normalizeAggregate,
	DEFAULT_V1_ACCEPTANCE, DEFAULT_V1_LOOP, DEFAULT_V1_FAILURE_POLICY, DEFAULT_V1_SCOPE,
	type InitContractV1Params, type V1AcceptanceMode, type InitAcceptanceMode, type LegacyAcceptanceMode, type V1Aggregate,
} from "./contractV1/builder.js";
export {
	canonicalJsonStringify, canonicalJsonPretty, computeContractHash,
	extractContractBlockFromPlan, stripJsonc, parseJsonc,
	computeImmutableReadSetHash, type EnvironmentFingerprint,
	collectEnvironmentFingerprint, type BaselineNoiseSummary,
	computeBaselineNoise,
} from "./contractV1/crypto.js";
export {
	type LockFile, type LockFileV1ValidationResult, validateLockFileV1,
	autoresearchDir, currentContractPath, currentLockPath,
	eventsPath, metricsPath, decisionsPath, planPath, ensureAutoresearchDir,
	writeCurrentContract, readCurrentContract, writeLockFile, readLockFile,
	type ContractEvent, appendEvent, type DecisionEntry, appendDecision,
	type ContractRunEntry, appendContractRun, type ContractMetricEntry,
	appendContractMetric,
} from "./contractV1/io.js";
export {
	matchesPath, matchesAnyPattern, validateWritePaths,
	isInternalArtifactPath, filterInternalPaths,
	validateCommandSafety, resolveCwdInsideRepo,
	validateCommandString, DEFAULT_FORBIDDEN_COMMAND_PATTERNS,
	validateScopeGitSafety,
} from "./contractV1/safety.js";
