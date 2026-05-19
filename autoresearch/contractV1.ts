/**
 * autoresearch/contractV1.ts — Barrel re-export for contractV1/ modules.
 */

export {
	AutoresearchContractV1Schema, type AutoresearchContractV1,
	type ContractV1ValidationResult, validateContractV1,
} from "./contractV1/schema.js";
export {
	canonicalJsonStringify, canonicalJsonPretty, computeContractHash,
	extractContractBlockFromPlan, stripJsonc, parseJsonc,
	computeImmutableReadSetHash, type EnvironmentFingerprint,
	collectEnvironmentFingerprint, type BaselineNoiseSummary,
	computeBaselineNoise,
} from "./contractV1/crypto.js";
export {
	type LockFile, autoresearchDir, currentContractPath, currentLockPath,
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
} from "./contractV1/safety.js";
