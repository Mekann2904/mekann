/**
 * autoresearch/contractV1.ts — AutoresearchContractV1 型・TypeBox schema・validation。
 *
 * 新しい contract mode の正本。schemaVersion = "autoresearch/v1"。
 * manual acceptance は禁止。command は argv array。
 */

import { Type, Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

// ---------------------------------------------------------------------------
// TypeBox schemas
// ---------------------------------------------------------------------------

const CommandSchema = Type.Object(
	{
		argv: Type.Array(Type.String(), { minItems: 1 }),
		cwd: Type.String(),
		env: Type.Optional(
			Type.Object(
				{
					allow: Type.Optional(Type.Array(Type.String())),
					set: Type.Optional(Type.Record(Type.String(), Type.String())),
				},
				{ additionalProperties: false },
			),
		),
	},
	{ additionalProperties: false },
);

const MetricLineSourceSchema = Type.Object(
	{
		type: Type.Literal("metric_line"),
		format: Type.Literal("METRIC <name>=<number>"),
		fallback: Type.Optional(Type.Union([Type.Literal("wall_clock"), Type.Literal("none")])),
		producer: Type.Optional(
			Type.Union([Type.Literal("benchmark_harness"), Type.Literal("runner")]),
		),
	},
	{ additionalProperties: false },
);

const WallClockSourceSchema = Type.Object(
	{
		type: Type.Literal("wall_clock"),
	},
	{ additionalProperties: false },
);

const PrimaryMetricSchema = Type.Object(
	{
		name: Type.String(),
		direction: Type.Union([Type.Literal("lower"), Type.Literal("higher")]),
		unit: Type.Optional(Type.String()),
		source: Type.Union([MetricLineSourceSchema, WallClockSourceSchema]),
	},
	{ additionalProperties: false },
);

const CheckSchema = Type.Object(
	{
		name: Type.String(),
		command: CommandSchema,
		timeoutSeconds: Type.Number({ minimum: 1 }),
		required: Type.Boolean(),
	},
	{ additionalProperties: false },
);

const BenchmarkSchema = Type.Object(
	{
		command: CommandSchema,
		timeoutSeconds: Type.Number({ minimum: 1 }),
		repeats: Type.Number({ minimum: 1 }),
		aggregate: Type.Union([
			Type.Literal("median"),
			Type.Literal("mean"),
			Type.Literal("min"),
			Type.Literal("max"),
		]),
	},
	{ additionalProperties: false },
);

const EvaluationSchema = Type.Object(
	{
		benchmark: BenchmarkSchema,
		primaryMetric: PrimaryMetricSchema,
		checks: Type.Array(CheckSchema),
	},
	{ additionalProperties: false },
);

const AcceptanceSchema = Type.Object(
	{
		mode: Type.Union([
			Type.Literal("better_than_baseline"),
			Type.Literal("better_than_best"),
		]),
		minRelativeImprovement: Type.Number({ minimum: 0 }),
		requireImprovementAboveNoiseFloor: Type.Boolean(),
		requireAllChecksPass: Type.Boolean(),
		rejectIfMetricMissing: Type.Boolean(),
		rejectIfImmutableReadPathChanged: Type.Boolean(),
		rejectIfForbiddenFilesChanged: Type.Boolean(),
		rejectIfBenchmarkChanged: Type.Boolean(),
	},
	{ additionalProperties: false },
);

const ScopeSchema = Type.Object(
	{
		allowedWritePaths: Type.Array(Type.String()),
		forbiddenWritePaths: Type.Array(Type.String()),
		immutableReadPaths: Type.Array(Type.String()),
		requireGit: Type.Boolean(),
		requireCleanGitWorktree: Type.Boolean(),
	},
	{ additionalProperties: false },
);

const ObjectiveSchema = Type.Object(
	{
		summary: Type.String(),
		successDefinition: Type.String(),
	},
	{ additionalProperties: false },
);

const LoopSchema = Type.Object(
	{
		maxIterations: Type.Number({ minimum: 1 }),
		maxRuntimeMinutes: Type.Number({ minimum: 1 }),
		maxConsecutiveNoImprovement: Type.Number({ minimum: 0 }),
		maxConsecutiveFailures: Type.Number({ minimum: 0 }),
	},
	{ additionalProperties: false },
);

const FailurePolicySchema = Type.Object(
	{
		onBenchmarkFailure: Type.Union([Type.Literal("discard"), Type.Literal("pause")]),
		onCheckFailure: Type.Union([Type.Literal("discard"), Type.Literal("pause")]),
		onMetricMissing: Type.Union([Type.Literal("discard"), Type.Literal("pause")]),
		onContractViolation: Type.Literal("pause"),
		onRevertFailure: Type.Literal("pause"),
	},
	{ additionalProperties: false },
);

export const AutoresearchContractV1Schema = Type.Object(
	{
		schemaVersion: Type.Literal("autoresearch/v1"),
		objective: ObjectiveSchema,
		scope: ScopeSchema,
		evaluation: EvaluationSchema,
		acceptance: AcceptanceSchema,
		loop: LoopSchema,
		failurePolicy: FailurePolicySchema,
	},
	{ additionalProperties: false },
);

export type AutoresearchContractV1 = Static<typeof AutoresearchContractV1Schema>;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface ContractV1ValidationResult {
	valid: boolean;
	errors: string[];
	warnings: string[];
}

/**
 * Validate a value against AutoresearchContractV1Schema.
 * Returns all TypeBox validation errors as human-readable strings.
 * Also adds semantic validations beyond schema.
 */
export function validateContractV1(value: unknown): ContractV1ValidationResult {
	const errors: string[] = [];
	const warnings: string[] = [];

	// TypeBox structural validation
	const tbErrors = [...Value.Errors(AutoresearchContractV1Schema, value)];
	for (const err of tbErrors) {
		errors.push((err.path || "/") + ": " + err.message);
	}

	// Semantic validation (only if structural validation passed)
	if (errors.length === 0) {
		const contract = value as AutoresearchContractV1;

		// Reject manual acceptance mode (this is already enforced by the schema union,
		// but double-check for clarity)
		if ((contract.acceptance as any).mode === "manual") {
			errors.push("acceptance.mode: manual は autoresearch/v1 contract で禁止されています");
		}

		// Warn if no checks defined
		if (contract.evaluation.checks.length === 0) {
			warnings.push("checks が空です。benchmark の妥当性検証なしで実験が進みます。");
		}

		// Warn if single repeat with wall_clock
		if (
			contract.evaluation.benchmark.repeats === 1 &&
			contract.evaluation.primaryMetric.source.type === "wall_clock"
		) {
			warnings.push(
				"wall_clock 指標を単発測定しています。ノイズが大きい場合、repeats ≥ 3 と aggregate='median' を推奨します。",
			);
		}

		// Warn if minRelativeImprovement is 0
		if (contract.acceptance.minRelativeImprovement === 0) {
			warnings.push(
				"minRelativeImprovement=0: わずかな改善でも accept されます。ノイズに注意してください。",
			);
		}

		if (contract.acceptance.mode === "better_than_best") {
			warnings.push(
				"acceptance.mode=better_than_best is experimental in contract v1/P1. " +
				"Prefer better_than_baseline for P0 contract mode unless best-metric ledger recovery is acceptable.",
			);
		}

		// Check command argv safety
		const allCommands = [
			contract.evaluation.benchmark.command,
			...contract.evaluation.checks.map((c) => c.command),
		];
		for (const cmd of allCommands) {
			for (const arg of cmd.argv) {
				// Reject shell metacharacters in argv (should not contain shell expansion)
				if (new RegExp(String.fromCharCode(96) + "$").test(arg) && cmd.argv.length === 1) {
					warnings.push(
						"command argv contains shell-like characters in single-element argv: \"" + arg + "\". " +
						"argv execution does not expand shell variables.",
					);
				}
			}
		}

		// Validate path patterns
		const allPatterns = [
			...contract.scope.allowedWritePaths,
			...contract.scope.forbiddenWritePaths,
			...contract.scope.immutableReadPaths,
		];
		for (const p of allPatterns) {
			if (p.includes("..")) {
				errors.push('path pattern "' + p + '" contains ".." (path traversal rejected)');
			}
			if (path.isAbsolute(p)) {
				errors.push('path pattern "' + p + '" is absolute (must be relative to repo root)');
			}
		}

		// rejectIfBenchmarkChanged requires benchmark/fixture paths in immutableReadPaths
		if (contract.acceptance.rejectIfBenchmarkChanged) {
			if (contract.scope.immutableReadPaths.length === 0) {
				errors.push(
					"rejectIfBenchmarkChanged=true requires non-empty immutableReadPaths. " +
					"Add benchmark-related files to immutableReadPaths for drift detection.",
				);
			} else {
				const hasBenchmarkImmutablePath = contract.scope.immutableReadPaths.some((p) => {
					const normalized = p.replace(/\\/g, "/");
					return normalized.startsWith("benchmark/") || normalized.startsWith("benchmarks/") ||
						normalized.startsWith("fixtures/") || normalized.startsWith("test/fixtures/");
				});
				if (!hasBenchmarkImmutablePath) {
					errors.push(
						"rejectIfBenchmarkChanged=true requires benchmark or fixture paths in immutableReadPaths " +
						"(for example: benchmarks/**, benchmark/**, fixtures/**, test/fixtures/**).",
					);
				}
			}
		}
	}

	return {
		valid: errors.length === 0,
		errors,
		warnings,
	};
}

// ---------------------------------------------------------------------------
// Canonical JSON + hash
// ---------------------------------------------------------------------------

import * as crypto from "node:crypto";
import * as path from "node:path";

/**
 * Recursively sort object keys and produce canonical JSON string.
 * JSON.stringify with a replacer that sorts keys at every level.
 */
export function canonicalJsonStringify(value: unknown): string {
	if (value === null || value === undefined) return "null";
	if (typeof value !== "object") return JSON.stringify(value);
	if (Array.isArray(value)) {
		return "[" + value.map(canonicalJsonStringify).join(",") + "]";
	}
	const obj = value as Record<string, unknown>;
	const sortedKeys = Object.keys(obj).sort();
	return (
		"{" +
		sortedKeys.map((k) => JSON.stringify(k) + ":" + canonicalJsonStringify(obj[k])).join(",") +
		"}"
	);
}

/**
 * Canonical JSON with pretty printing.
 */
export function canonicalJsonPretty(value: unknown): string {
	const canonical = canonicalJsonStringify(value);
	// Re-parse and pretty print
	return JSON.stringify(JSON.parse(canonical), null, 2);
}

/**
 * Compute SHA-256 hash of canonical JSON.
 */
export function computeContractHash(value: unknown): string {
	const canonical = canonicalJsonStringify(value);
	return "sha256:" + crypto.createHash("sha256").update(canonical, "utf8").digest("hex");
}

// ---------------------------------------------------------------------------
// Plan block extractor
// ---------------------------------------------------------------------------

const CONTRACT_BLOCK_LANG = "autoresearch-contract jsonc";

/**
 * Extract contract block from plan markdown.
 * Returns the raw JSONC string from the fenced block.
 * Exactly one block is required.
 */
export function extractContractBlockFromPlan(markdown: string): {
	jsonc: string;
	startLine: number;
	endLine: number;
} {
	const lines = markdown.split("\n");
	const blocks: { jsonc: string; startLine: number; endLine: number }[] = [];

	let inBlock = false;
	let blockLang = "";
	let blockStart = -1;
	let blockContent: string[] = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (!inBlock) {
			// Look for opening fence
			const match = line.match(new RegExp(String.fromCharCode(96,96,96) + "\\s*(.+)$"));
			if (match) {
				const lang = match[1].trim();
				if (lang === CONTRACT_BLOCK_LANG) {
					inBlock = true;
					blockLang = lang;
					blockStart = i;
					blockContent = [];
				}
			}
		} else {
			// Look for closing fence
			if (line.match(new RegExp(String.fromCharCode(96,96,96) + "\\s*$"))) {
				blocks.push({
					jsonc: blockContent.join("\n"),
					startLine: blockStart,
					endLine: i,
				});
				inBlock = false;
			} else {
				blockContent.push(line);
			}
		}
	}

	if (blocks.length === 0) {
		throw new Error(
			"plan has no contract block.\n" +
			"exactly one ${CONTRACT_BLOCK_LANG} fenced code block is required.",
		);
	}

	if (blocks.length > 1) {
		throw new Error(
			"plan has " + blocks.length + " contract blocks.\n" +
			"exactly one ${CONTRACT_BLOCK_LANG} block is required.",
		);
	}

	return blocks[0];
}

// ---------------------------------------------------------------------------
// JSONC parser (safe, minimal)
// ---------------------------------------------------------------------------

/**
 * Strip JSONC comments (single-line // and multi-line block comments) and trailing commas.
 * This is a simple, safe implementation that handles common JSONC patterns.
 */
export function stripJsonc(input: string): string {
	let result = "";
	let i = 0;
	let inString = false;

	while (i < input.length) {
		const ch = input[i];

		if (inString) {
			result += ch;
			if (ch === "\\" && i + 1 < input.length) {
				// Escaped character - consume next char too
				i++;
				result += input[i];
			} else if (ch === '"') {
				inString = false;
			}
			i++;
			continue;
		}

		if (ch === '"') {
			inString = true;
			result += ch;
			i++;
			continue;
		}

		// Single-line comment
		if (ch === "/" && i + 1 < input.length && input[i + 1] === "/") {
			// Skip until end of line
			while (i < input.length && input[i] !== "\n") {
				i++;
			}
			continue;
		}

		// Multi-line comment
		if (ch === "/" && i + 1 < input.length && input[i + 1] === "*") {
			i += 2;
			while (i < input.length && !(input[i] === "*" && i + 1 < input.length && input[i + 1] === "/")) {
				i++;
			}
			i += 2; // skip */
			continue;
		}

		result += ch;
		i++;
	}

	// Remove trailing commas before } or ]
	result = result.replace(/,\s*([}\]])/g, "$1");

	return result;
}

/**
 * Parse JSONC string to JSON object.
 */
export function parseJsonc(input: string): unknown {
	const stripped = stripJsonc(input);
	return JSON.parse(stripped);
}

// ---------------------------------------------------------------------------
// Immutable read set hash
// ---------------------------------------------------------------------------

import * as fs from "node:fs";
import { execFileSync } from "node:child_process";
import { glob as tinyglobby } from "tinyglobby";

/**
 * Compute hash of all files matching immutableReadPaths patterns.
 * Returns { hash, files, warnings }.
 */
export async function computeImmutableReadSetHash(
	cwd: string,
	patterns: string[],
): Promise<{ hash: string; files: string[]; warnings: string[] }> {
	if (patterns.length === 0) {
		return { hash: "sha256:empty", files: [], warnings: [] };
	}

	const warnings: string[] = [];
	const allFiles: string[] = [];

	for (const pattern of patterns) {
		try {
			// Use tinyglobby for glob matching
			const matches = await tinyglobby(pattern, {
				cwd,
				absolute: false,
				dot: true,
				onlyFiles: true,
			});
			if (matches.length === 0) {
				warnings.push('immutableReadPaths pattern "' + pattern + '" matched no files');
			}
			allFiles.push(...matches);
		} catch (e) {
			warnings.push(
				'immutableReadPaths pattern "' + pattern + '" expansion failed: ' + (e instanceof Error ? e.message : String(e)),
			);
		}
	}

	// Deduplicate and sort
	const uniqueFiles = [...new Set(allFiles)].sort();

	if (uniqueFiles.length === 0) {
		return { hash: "sha256:no-files", files: [], warnings };
	}

	// Hash each file: relative path + file content hash
	const fileHashes: string[] = [];
	for (const relPath of uniqueFiles) {
		const absPath = path.join(cwd, relPath);
		try {
			const content = fs.readFileSync(absPath);
			const hash = crypto.createHash("sha256").update(relPath).update(":").update(content).digest("hex");
			fileHashes.push(relPath + ':' + hash);
		} catch {
			warnings.push('immutableReadPaths file "' + relPath + '" read failed');
		}
	}

	// Sort and compute aggregate hash
	fileHashes.sort();
	const aggregate = crypto
		.createHash("sha256")
		.update(fileHashes.join("\n"))
		.digest("hex");

	return { hash: "sha256:" + aggregate, files: uniqueFiles, warnings };
}

// ---------------------------------------------------------------------------
// Environment fingerprint
// ---------------------------------------------------------------------------

export interface EnvironmentFingerprint {
	platform: string;
	arch: string;
	nodeVersion: string;
	npmVersion: string;
	timezone: string;
	packageJsonHash: string;
	packageLockHash: string;
	immutableReadSetHash: string;
}

/**
 * Collect environment fingerprint.
 */
export async function collectEnvironmentFingerprint(
	cwd: string,
	immutableReadSetHash: string,
): Promise<EnvironmentFingerprint> {
	let npmVersion = "unknown";
	try {
		npmVersion = execFileSync("npm", ["--version"], {
			cwd,
			encoding: "utf8",
			timeout: 5_000,
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
	} catch {}

	const packageJsonPath = path.join(cwd, "package.json");
	let packageJsonHash = "sha256:none";
	try {
		if (fs.existsSync(packageJsonPath)) {
			const content = fs.readFileSync(packageJsonPath);
			packageJsonHash = "sha256:" + crypto.createHash("sha256").update(content).digest("hex");
		}
	} catch {}

	const packageLockPath = path.join(cwd, "package-lock.json");
	let packageLockHash = "sha256:none";
	try {
		if (fs.existsSync(packageLockPath)) {
			const content = fs.readFileSync(packageLockPath);
			packageLockHash = "sha256:" + crypto.createHash("sha256").update(content).digest("hex");
		}
	} catch {}

	return {
		platform: process.platform,
		arch: process.arch,
		nodeVersion: process.version,
		npmVersion,
		timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
		packageJsonHash,
		packageLockHash,
		immutableReadSetHash,
	};
}

// ---------------------------------------------------------------------------
// Baseline noise summary
// ---------------------------------------------------------------------------

export interface BaselineNoiseSummary {
	samples: number[];
	aggregate: number;
	min: number;
	max: number;
	mean: number;
	stddev: number;
	relativeRange: number;
}

/**
 * Compute baseline noise summary from samples.
 */
export function computeBaselineNoise(
	samples: number[],
	aggregateMethod: "median" | "mean" | "min" | "max",
): BaselineNoiseSummary {
	if (samples.length === 0) {
		throw new Error("baseline samples が空です");
	}

	const sorted = [...samples].sort((a, b) => a - b);

	let aggregate: number;
	switch (aggregateMethod) {
		case "median": {
			const mid = Math.floor(sorted.length / 2);
			aggregate =
				sorted.length % 2 === 0
					? (sorted[mid - 1] + sorted[mid]) / 2
					: sorted[mid];
			break;
		}
		case "mean":
			aggregate = samples.reduce((s, v) => s + v, 0) / samples.length;
			break;
		case "min":
			aggregate = sorted[0];
			break;
		case "max":
			aggregate = sorted[sorted.length - 1];
			break;
	}

	const min = sorted[0];
	const max = sorted[sorted.length - 1];
	const mean = samples.reduce((s, v) => s + v, 0) / samples.length;

	const variance =
		samples.reduce((s, v) => s + (v - mean) ** 2, 0) / samples.length;
	const stddev = Math.sqrt(variance);

	const absAggregate = Math.abs(aggregate);
	const relativeRange = absAggregate === 0 ? (max === min ? 0 : Infinity) : (max - min) / absAggregate;

	return {
		samples,
		aggregate,
		min,
		max,
		mean,
		stddev,
		relativeRange,
	};
}

// ---------------------------------------------------------------------------
// Lock file types
// ---------------------------------------------------------------------------

export interface LockFile {
	schemaVersion: "autoresearch-lock/v1";
	contractId: string;
	contractHash: string;
	approvedAt: number;
	approvedBy: string;
	baseline: {
		gitCommit: string;
		runs: Array<{
			runId: string;
			metric: number;
			durationSeconds: number;
		}>;
		aggregate: "median" | "mean" | "min" | "max";
		primaryMetricValue: number;
		noise: BaselineNoiseSummary;
	};
	environment: EnvironmentFingerprint;
}

// ---------------------------------------------------------------------------
// .autoresearch path helpers
// ---------------------------------------------------------------------------

const AUTORESEARCH_DIR = ".autoresearch";

export function autoresearchDir(cwd: string): string {
	return path.join(cwd, AUTORESEARCH_DIR);
}

export function currentContractPath(cwd: string): string {
	return path.join(cwd, AUTORESEARCH_DIR, "current.contract.json");
}

export function currentLockPath(cwd: string): string {
	return path.join(cwd, AUTORESEARCH_DIR, "current.lock.json");
}

export function eventsPath(cwd: string): string {
	return path.join(cwd, AUTORESEARCH_DIR, "events.jsonl");
}

function runsPath(cwd: string): string {
	return path.join(cwd, AUTORESEARCH_DIR, "runs.jsonl");
}

export function metricsPath(cwd: string): string {
	return path.join(cwd, AUTORESEARCH_DIR, "metrics.jsonl");
}

export function decisionsPath(cwd: string): string {
	return path.join(cwd, AUTORESEARCH_DIR, "decisions.jsonl");
}

export function planPath(cwd: string): string {
	return path.join(cwd, "autoresearch.plan.md");
}

export function ensureAutoresearchDir(cwd: string): void {
	const dir = autoresearchDir(cwd);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}

}

// ---------------------------------------------------------------------------
// File I/O for new contract mode
// ---------------------------------------------------------------------------

export function writeCurrentContract(cwd: string, contract: AutoresearchContractV1): void {
	ensureAutoresearchDir(cwd);
	const canonical = canonicalJsonPretty(contract);
	fs.writeFileSync(currentContractPath(cwd), canonical, "utf8");
}

export function readCurrentContract(cwd: string): AutoresearchContractV1 | null {
	const fp = currentContractPath(cwd);
	if (!fs.existsSync(fp)) return null;
	try {
		const data = JSON.parse(fs.readFileSync(fp, "utf8"));
		const validation = validateContractV1(data);
		if (validation.valid) return data as AutoresearchContractV1;
		return null;
	} catch {
		return null;
	}
}

export function writeLockFile(cwd: string, lock: LockFile): void {
	ensureAutoresearchDir(cwd);
	fs.writeFileSync(currentLockPath(cwd), JSON.stringify(lock, null, 2), "utf8");
}

export function readLockFile(cwd: string): LockFile | null {
	const fp = currentLockPath(cwd);
	if (!fs.existsSync(fp)) return null;
	try {
		return JSON.parse(fs.readFileSync(fp, "utf8")) as LockFile;
	} catch {
		return null;
	}
}

// ---------------------------------------------------------------------------
// Event logging
// ---------------------------------------------------------------------------

export interface ContractEvent {
	timestamp: number;
	contractId: string;
	contractHash: string;
	event: string;
	details?: Record<string, unknown>;
}

export function appendEvent(cwd: string, event: ContractEvent): void {
	ensureAutoresearchDir(cwd);
	const line = JSON.stringify(event) + "\n";
	fs.appendFileSync(eventsPath(cwd), line, "utf8");
}

// ---------------------------------------------------------------------------
// Decision logging
// ---------------------------------------------------------------------------

export interface DecisionEntry {
	timestamp: number;
	contractId: string;
	contractHash: string;
	decision: "keep" | "discard" | "pause";
	reason: string;
	metric: number | null;
	reference: number | null;
	details: Record<string, unknown>;
}

export function appendDecision(cwd: string, entry: DecisionEntry): void {
	ensureAutoresearchDir(cwd);
	const line = JSON.stringify(entry) + "\n";
	fs.appendFileSync(decisionsPath(cwd), line, "utf8");
}

// ---------------------------------------------------------------------------
// Contract-mode run / metric logging
// ---------------------------------------------------------------------------

export interface ContractRunEntry {
	timestamp: number;
	contractId: string;
	contractHash: string;
	iteration: number;
	decision: "keep" | "discard" | "pause";
	measurements: number[];
	representativeMetric: number | null;
	reference: number | null;
	changedFiles: string[];
	checkResults: Record<string, boolean>;
	durationSeconds: number;
}

export function appendContractRun(cwd: string, entry: ContractRunEntry): void {
	ensureAutoresearchDir(cwd);
	const line = JSON.stringify(entry) + "\n";
	fs.appendFileSync(runsPath(cwd), line, "utf8");
}

export interface ContractMetricEntry {
	timestamp: number;
	contractId: string;
	contractHash: string;
	iteration: number;
	metricName: string;
	metricValue: number | null;
	allMeasurements: number[];
	aggregateMethod: string;
	decision: "keep" | "discard" | "pause";
}

export function appendContractMetric(cwd: string, entry: ContractMetricEntry): void {
	ensureAutoresearchDir(cwd);
	const line = JSON.stringify(entry) + "\n";
	fs.appendFileSync(metricsPath(cwd), line, "utf8");
}

// ---------------------------------------------------------------------------
// Path matching
// ---------------------------------------------------------------------------

/**
 * Match a relative posix path against patterns.
 * Patterns can be:
 *
 * For P0, we use a simple matching strategy:
 * - Exact match
 * - Prefix match (if pattern ends with /)
 * - Simple glob with star support via RegExp conversion
 */
export function matchesPath(pattern: string, filePath: string): boolean {
	// Normalize both to posix
	const normPattern = pattern.replace(/\\/g, "/");
	const normFile = filePath.replace(/\\/g, "/");

	// Exact match
	if (normPattern === normFile) return true;

	// Directory prefix match
	if (normPattern.endsWith("/")) {
		return normFile.startsWith(normPattern) || normFile === normPattern.slice(0, -1);
	}

	// Glob pattern: convert to regex
	if (normPattern.includes("*") || normPattern.includes("?") || normPattern.includes("[")) {
		let regexStr = normPattern
			.replace(/[.\+\^\$\{\}\(\)\|\[\]\\\\]/g, "\\$&") // Escape regex special chars (except * and ?)
			.replace(/\*\*/g, "<<DOUBLESTAR>>")
			.replace(/\*/g, "[^/]*")
			.replace(/<<DOUBLESTAR>>/g, ".*")
			.replace(/\?/g, "[^/]");
		regexStr = "^" + regexStr + "$";
		try {
			const re = new RegExp(regexStr);
			return re.test(normFile);
		} catch {
			return false;
		}
	}

	// File prefix match (without trailing /)
	if (normFile.startsWith(normPattern + "/")) return true;

	return false;
}

/**
 * Check if a file path matches any of the patterns.
 */
export function matchesAnyPattern(filePath: string, patterns: string[]): boolean {
	return patterns.some((p) => matchesPath(p, filePath));
}

/**
 * Validate that changed files don't violate forbidden/allowed write paths.
 */
export function validateWritePaths(
	changedFiles: string[],
	allowedWritePaths: string[],
	forbiddenWritePaths: string[],
): { violations: string[] } {
	const violations: string[] = [];

	for (const file of changedFiles) {
		// Check forbidden first
		if (matchesAnyPattern(file, forbiddenWritePaths)) {
			violations.push('changed file "' + file + '" matches forbiddenWritePaths');
			continue;
		}

		// Check allowed (if non-empty, file must match at least one)
		if (allowedWritePaths.length > 0 && !matchesAnyPattern(file, allowedWritePaths)) {
			violations.push('changed file "' + file + '" does not match allowedWritePaths');
		}
	}

	return { violations };
}

// ---------------------------------------------------------------------------
// Internal path filtering
// ---------------------------------------------------------------------------

/**
 * Check if a path is an internal autoresearch or .pi artifact path.
 * These should be excluded from candidate changedFiles.
 */
export function isInternalArtifactPath(p: string): boolean {
	const n = p.replace(/\\/g, "/");
	return (
		n === ".autoresearch" ||
		n.startsWith(".autoresearch/") ||
		n === ".pi" ||
		n.startsWith(".pi/") ||
		n === "autoresearch.plan.md"
	);
}

/**
 * Filter internal artifact paths from a list of changed files.
 */
export function filterInternalPaths(files: string[]): string[] {
	return files.filter((f) => !isInternalArtifactPath(f));
}

// ---------------------------------------------------------------------------
// Command safety validation
// ---------------------------------------------------------------------------

/**
 * Validate command safety: reject shell invocations, path escapes, etc.
 */
export function validateCommandSafety(
	commands: Array<{ argv: string[]; cwd: string }>,
	repoRoot: string,
): string[] {
	const errors: string[] = [];

	for (let ci = 0; ci < commands.length; ci++) {
		const cmd = commands[ci];
		const label = ci === 0 ? "benchmark" : "check[" + (ci - 1) + "]";

		// Reject shell -c invocations, including variants such as bash -lc,
		// sh -ec, and /usr/bin/env bash -c.
		const shellNames = ["bash", "sh", "zsh", "fish", "dash", "ksh", "csh", "tcsh"];
		let shellIndex = -1;
		let exe = cmd.argv[0] ?? "";
		const base = path.basename(exe);
		if (shellNames.includes(base)) {
			shellIndex = 0;
		} else if (base === "env") {
			const envShellIndex = cmd.argv.findIndex((arg, idx) => idx > 0 && shellNames.includes(path.basename(arg)));
			if (envShellIndex >= 0) {
				shellIndex = envShellIndex;
				exe = cmd.argv[envShellIndex];
			}
		}
		if (shellIndex >= 0) {
			const hasShellStringFlag = cmd.argv.slice(shellIndex + 1).some((arg) => /^-[A-Za-z]*c[A-Za-z]*$/.test(arg));
			if (hasShellStringFlag) {
				errors.push(
					label + ": command uses " + exe + " -c/-lc style shell string invocation. " +
					"Use a script file instead: [" + exe + ", \"./script.sh\"]. " +
					"Shell -c defeats the purpose of argv-based command safety.",
				);
			}
		}

		// Reject sudo / su
		if (cmd.argv[0] === "sudo" || cmd.argv[0] === "su") {
			errors.push(
				label + ": command uses " + cmd.argv[0] + " (privilege escalation rejected).",
			);
		}

		// Reject curl|sh patterns (argv containing pipe to shell)
		const argStr = cmd.argv.join(" ");
		if (/curl.*\|.*sh|wget.*\|.*sh/.test(argStr)) {
			errors.push(
				label + ": command contains curl|sh or wget|sh pattern (remote execution rejected).",
			);
		}

		// Reject rm -rf /
		if (cmd.argv[0] === "rm" && cmd.argv.includes("-rf") && (cmd.argv.includes("/") || cmd.argv.includes("/*"))) {
			errors.push(
				label + ": command contains \"rm -rf /\" (destructive operation rejected).",
			);
		}

		// Validate cwd resolves inside repo
		if (path.isAbsolute(cmd.cwd)) {
			errors.push(
				label + ": cwd is absolute (\"" + cmd.cwd + "\"). Must be relative to repo root.",
			);
		} else if (cmd.cwd.includes("..")) {
			errors.push(
				label + ": cwd contains \"..\" (path traversal rejected): \"" + cmd.cwd + "\".",
			);
		} else {
			const resolved = path.resolve(repoRoot, cmd.cwd);
			const root = path.resolve(repoRoot);
			if (resolved !== root && !resolved.startsWith(root + path.sep)) {
				errors.push(
					label + ": cwd escapes repo root: \"" + cmd.cwd + "\" resolves to \"" + resolved + "\".",
				);
			}
		}
	}

	return errors;
}

/**
 * Resolve a cwd inside the repo, throwing on escape.
 */
export function resolveCwdInsideRepo(repoRoot: string, cwd: string): string {
	if (path.isAbsolute(cwd)) throw new Error("cwd is absolute: " + cwd);
	if (cwd.includes("..")) throw new Error("cwd contains ..: " + cwd);
	const resolved = path.resolve(repoRoot, cwd);
	const root = path.resolve(repoRoot);
	if (resolved !== root && !resolved.startsWith(root + path.sep)) {
		throw new Error("cwd escapes repo: " + cwd + " -> " + resolved);
	}
	return resolved;
}
