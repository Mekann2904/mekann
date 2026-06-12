import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { execFileSync } from "node:child_process";

export interface PlanDefinition {
	planMarkdown: string;
	contract: unknown;
	benchmarkScript: string;
	checksScript?: string | null;
	metricName?: string;
	metricDirection?: "lower" | "higher" | string;
	successCriteria?: unknown;
	constraints?: unknown;
	/** Optional explicit identity. If omitted, one is derived from stable contract fields. */
	identity?: unknown;
}

export interface AutoresearchStateV2 {
	version: 2;
	sessionId?: string;
	currentPlanId?: string;
	currentPlanDir?: string;
	latestRunId?: string;
	bestRunId?: string;
	bestMetric?: { name: string; value: number; direction: string };
	runCount?: number;
	currentContractHash?: string;
	updatedAt: string;
}

export function canonicalJson(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value);
	if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
	const obj = value as Record<string, unknown>;
	return "{" + Object.keys(obj).sort().map((k) => JSON.stringify(k) + ":" + canonicalJson(obj[k])).join(",") + "}";
}

function sha256(s: string): string { return crypto.createHash("sha256").update(s).digest("hex"); }
function shortSha256(s: string): string { return sha256(s).slice(0, 12); }

const VOLATILE_KEYS = new Set([
	"createdAt", "updatedAt", "timestamp", "sessionId", "runId", "piRunId", "latestRunId", "bestRunId",
	"baselineCommit", "currentPlanDir", "currentPlanId", "absolutePath", "absolutePaths",
]);

export function stableIdentity(value: unknown): unknown {
	if (value === null || typeof value !== "object") return value;
	if (Array.isArray(value)) return value.map(stableIdentity);
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
		if (VOLATILE_KEYS.has(k)) continue;
		out[k] = stableIdentity(v);
	}
	return out;
}

export function planIdentity(input: PlanDefinition): unknown {
	if (input.identity !== undefined) return stableIdentity(input.identity);
	const c = stableIdentity(input.contract) as any;
	return {
		objective: c?.objective ?? c?.name ?? null,
		targetScope: c?.targetScope ?? c?.scope ?? null,
		benchmark: c?.benchmark ?? c?.benchmarkCommand ?? input.benchmarkScript,
		checks: c?.checks ?? input.checksScript ?? null,
		primaryMetric: c?.primaryMetric ?? c?.evaluation?.primaryMetric ?? { name: input.metricName ?? c?.metricName ?? null, direction: input.metricDirection ?? c?.direction ?? null },
		acceptance: input.successCriteria ?? c?.acceptance ?? null,
		safety: input.constraints ?? c?.safety ?? null,
		constraints: c?.constraints ?? null,
		planMarkdown: input.planMarkdown,
	};
}

export function computePlanId(input: PlanDefinition): string {
	return "plan-" + shortSha256(canonicalJson(planIdentity(input)));
}

export function getAutoresearchRoot(cwd: string): string { return path.join(cwd, ".autoresearch"); }
export function getPlansRoot(cwd: string): string { return path.join(getAutoresearchRoot(cwd), "plans"); }
export function getPlanDir(cwd: string, planId: string): string { return path.join(getPlansRoot(cwd), planId); }
export function getRunDir(cwd: string, planId: string, runId: string): string { return path.join(getPlanDir(cwd, planId), "runs", runId); }
export function statePath(cwd: string): string { return path.join(getAutoresearchRoot(cwd), "state.json"); }
export function currentPlanPath(cwd: string): string { return path.join(getAutoresearchRoot(cwd), "current.plan.json"); }
export function journalPath(cwd: string): string { return path.join(getAutoresearchRoot(cwd), "journal.jsonl"); }

export function readState(cwd: string): AutoresearchStateV2 {
	try { return JSON.parse(fs.readFileSync(statePath(cwd), "utf8")) as AutoresearchStateV2; }
	catch { return { version: 2, updatedAt: new Date().toISOString() }; }
}

export function writeState(cwd: string, state: AutoresearchStateV2): void {
	fs.mkdirSync(getAutoresearchRoot(cwd), { recursive: true });
	fs.writeFileSync(statePath(cwd), JSON.stringify({ ...state, version: 2, updatedAt: new Date().toISOString() }, null, 2) + "\n");
}

export function appendJournal(cwd: string, event: Record<string, unknown>): void {
	fs.mkdirSync(getAutoresearchRoot(cwd), { recursive: true });
	fs.appendFileSync(journalPath(cwd), JSON.stringify({ ...event, createdAt: event.createdAt ?? new Date().toISOString() }) + "\n");
}

export function generateRunId(cwd: string): string {
	let git = "nogit";
	try { git = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || git; } catch {}
	return `run-${new Date().toISOString().replace(/[:-]/g, "").replace("Z", "Z")}-${git}-${crypto.randomBytes(3).toString("hex")}`;
}

function fileHash(fp: string): string { return "sha256:" + sha256(fs.readFileSync(fp, "utf8")); }
function lockFor(planId: string, identity: unknown, planDir: string): Record<string, unknown> {
	const files: Record<string, string> = {};
	for (const f of ["plan.md", "contract.json", "benchmark.sh", "checks.sh"]) {
		const fp = path.join(planDir, f);
		if (fs.existsSync(fp)) files[f] = fileHash(fp);
	}
	return { version: 1, planId, identityHash: "sha256:" + sha256(canonicalJson(identity)), files };
}
function assertPlanNotModified(planId: string, planDir: string): void {
	const lockPath = path.join(planDir, "plan.lock.json");
	if (!fs.existsSync(lockPath)) return;
	const lock = JSON.parse(fs.readFileSync(lockPath, "utf8")) as any;
	const cur = lockFor(planId, {}, planDir).files as Record<string, string>;
	for (const [f, h] of Object.entries(lock.files ?? {})) {
		if (cur[f] !== h) throw new Error(`plan directory was modified: ${path.join(planDir, f)}`);
	}
}

export function createOrReusePlan(cwd: string, def: PlanDefinition, sessionId?: string): { planId: string; planDir: string; reused: boolean } {
	const identity = planIdentity(def);
	const planId = computePlanId(def);
	// Preflight root wrapper conflicts before mutating current.plan/state/journal.
	assertRootWrappersWritable(cwd);
	const planDir = getPlanDir(cwd, planId);
	const reused = fs.existsSync(planDir);
	if (reused) assertPlanNotModified(planId, planDir);
	fs.mkdirSync(planDir, { recursive: true });
	if (!reused) {
		fs.writeFileSync(path.join(planDir, "plan.md"), def.planMarkdown, "utf8");
		fs.writeFileSync(path.join(planDir, "contract.json"), JSON.stringify(stableIdentity(def.contract), null, 2) + "\n", "utf8");
		fs.writeFileSync(path.join(planDir, "benchmark.sh"), def.benchmarkScript, "utf8"); fs.chmodSync(path.join(planDir, "benchmark.sh"), 0o755);
		if (def.checksScript) { fs.writeFileSync(path.join(planDir, "checks.sh"), def.checksScript, "utf8"); fs.chmodSync(path.join(planDir, "checks.sh"), 0o755); }
		fs.writeFileSync(path.join(planDir, "plan.lock.json"), JSON.stringify(lockFor(planId, identity, planDir), null, 2) + "\n", "utf8");
	}
	const planRel = path.relative(cwd, planDir) || planDir;
	// Root wrappers must be updated before changing current.plan/state so a late
	// permission/disk failure does not leave current state pointing at a plan the
	// root entrypoints cannot invoke.
	writeRootWrappers(cwd, planId, def.contract as any);
	fs.mkdirSync(getAutoresearchRoot(cwd), { recursive: true });
	fs.writeFileSync(currentPlanPath(cwd), JSON.stringify({ planId, planDir: planRel, contractPath: path.join(planRel, "contract.json"), planPath: path.join(planRel, "plan.md"), benchmarkPath: path.join(planRel, "benchmark.sh"), checksPath: path.join(planRel, "checks.sh"), createdAt: new Date().toISOString() }, null, 2) + "\n");
	const prev = readState(cwd);
	const switchingPlan = prev.currentPlanId !== planId;
	writeState(cwd, {
		...prev,
		sessionId,
		currentPlanId: planId,
		currentPlanDir: planRel,
		latestRunId: switchingPlan ? undefined : prev.latestRunId,
		bestRunId: switchingPlan ? undefined : prev.bestRunId,
		bestMetric: switchingPlan ? undefined : prev.bestMetric,
		runCount: switchingPlan ? undefined : prev.runCount,
		currentContractHash: switchingPlan ? undefined : prev.currentContractHash,
	});
	appendJournal(cwd, { type: reused ? "plan_selected" : "plan_created", planId });
	if (!reused) appendJournal(cwd, { type: "plan_selected", planId });
	return { planId, planDir, reused };
}

const GENERATED = "AUTORESEARCH:generated";
function assertRootWrappersWritable(cwd: string): void {
	for (const f of ["autoresearch.sh", "autoresearch.checks.sh"]) {
		const fp = path.join(cwd, f);
		if (fs.existsSync(fp) && !fs.readFileSync(fp, "utf8").includes(GENERATED)) {
			throw new Error(`root file conflict: ${fp} has no generated marker`);
		}
	}
	const md = path.join(cwd, "autoresearch.md");
	if (fs.existsSync(md)) {
		const s = fs.readFileSync(md, "utf8");
		if (!s.includes("<!-- AUTORESEARCH:BEGIN generated -->") && !s.includes(GENERATED)) {
			throw new Error(`root file conflict: ${md} has no generated block`);
		}
	}
}
function writeGeneratedFileSafe(fp: string, content: string, mode?: number): void {
	if (fs.existsSync(fp)) {
		const old = fs.readFileSync(fp, "utf8");
		if (!old.includes(GENERATED)) {
			fs.writeFileSync(fp + ".new", content, mode ? { mode } : undefined);
			throw new Error(`root file conflict: ${fp} has no generated marker; wrote ${fp}.new`);
		}
	}
	fs.writeFileSync(fp, content, mode ? { mode } : undefined);
}
function updateGeneratedBlockSafe(fp: string, block: string): void {
	const begin = "<!-- AUTORESEARCH:BEGIN generated -->";
	const end = "<!-- AUTORESEARCH:END generated -->";
	const content = `${begin}\n${block}\n${end}\n`;
	if (!fs.existsSync(fp)) { fs.writeFileSync(fp, `# Autoresearch\n\n${content}`); return; }
	const old = fs.readFileSync(fp, "utf8");
	const re = new RegExp(`${begin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${end.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
	if (re.test(old)) fs.writeFileSync(fp, old.replace(re, content.trimEnd()), "utf8");
	else {
		fs.writeFileSync(fp + ".new", `# Autoresearch\n\n${content}`, "utf8");
		throw new Error(`root file conflict: ${fp} has no generated block; wrote ${fp}.new`);
	}
}

export function writeRootWrappers(cwd: string, planId: string, contract?: any): void {
	const planDir = `.autoresearch/plans/${planId}`;
	writeGeneratedFileSafe(path.join(cwd, "autoresearch.sh"), `#!/usr/bin/env bash\n# ${GENERATED}\nset -euo pipefail\nPLAN_DIR=\"$(node -e \"console.log(require('./.autoresearch/state.json').currentPlanDir)\")\"\nexec \"$PLAN_DIR/benchmark.sh\" \"$@\"\n`, 0o755);
	writeGeneratedFileSafe(path.join(cwd, "autoresearch.checks.sh"), `#!/usr/bin/env bash\n# ${GENERATED}\nset -euo pipefail\nPLAN_DIR=\"$(node -e \"console.log(require('./.autoresearch/state.json').currentPlanDir)\")\"\nif [ ! -f \"$PLAN_DIR/checks.sh\" ]; then echo \"No checks.sh for current autoresearch plan\" >&2; exit 0; fi\nexec \"$PLAN_DIR/checks.sh\" \"$@\"\n`, 0o755);
	updateGeneratedBlockSafe(path.join(cwd, "autoresearch.md"), `Current plan: \`${planDir}/\`\n\n## Current objective\n\n${contract?.objective ?? contract?.name ?? ""}\n\n## Files\n\n- Plan: \`${planDir}/plan.md\`\n- Contract: \`${planDir}/contract.json\`\n- Benchmark: \`${planDir}/benchmark.sh\`\n- Checks: \`${planDir}/checks.sh\`\n- Runs: \`${planDir}/runs/\``);
}

export function createRunArtifacts(cwd: string, planId: string, runId: string): { runDir: string } {
	const runDir = getRunDir(cwd, planId, runId);
	if (fs.existsSync(runDir)) throw new Error(`run directory already exists: ${runDir}`);
	fs.mkdirSync(runDir, { recursive: true });
	return { runDir };
}
