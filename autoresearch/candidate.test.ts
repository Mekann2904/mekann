import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { computeContractHash, type AutoresearchContractV1, type LockFile } from "./contractV1.js";
import { writeState } from "./layout.js";
import { createHash } from "node:crypto";
import { applyCandidate, applyCandidateIsolated, assertCandidateReadyForRun, candidateChangedFiles, candidateEventsPath, importSubagentResultsAsCandidates, listCandidates, readCandidate, updateCandidateStatus } from "./candidate.js";

function tmpRepo(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-test-"));
	execFileSync("git", ["init"], { cwd: dir, stdio: "ignore" });
	execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
	execFileSync("git", ["config", "user.name", "Test"], { cwd: dir });
	fs.writeFileSync(path.join(dir, "README.md"), "base\n");
	execFileSync("git", ["add", "README.md"], { cwd: dir });
	execFileSync("git", ["commit", "-m", "initial"], { cwd: dir, stdio: "ignore" });
	fs.mkdirSync(path.join(dir, ".autoresearch", "plans", "plan-test"), { recursive: true });
	writeState(dir, { version: 2, currentPlanId: "plan-test", currentPlanDir: ".autoresearch/plans/plan-test", updatedAt: new Date().toISOString() });
	return dir;
}

function contract(): AutoresearchContractV1 {
	return {
		schemaVersion: "autoresearch/v1",
		objective: { summary: "test", successDefinition: "metric lower" },
		scope: { allowedWritePaths: ["src"], forbiddenWritePaths: ["forbidden"], immutableReadPaths: ["bench"], requireGit: true, requireCleanGitWorktree: true },
		evaluation: { benchmark: { command: { argv: ["true"], cwd: "." }, timeoutSeconds: 1, repeats: 1, aggregate: "median" }, primaryMetric: { name: "duration", direction: "lower", source: { type: "wall_clock" } }, checks: [] },
		acceptance: { mode: "better_than_best", minRelativeImprovement: 0, requireImprovementAboveNoiseFloor: false, requireAllChecksPass: false, rejectIfMetricMissing: true, rejectIfImmutableReadPathChanged: true, rejectIfForbiddenFilesChanged: true, rejectIfBenchmarkChanged: true },
		loop: { maxIterations: 1, maxRuntimeMinutes: 1, maxConsecutiveNoImprovement: 1, maxConsecutiveFailures: 1 },
		failurePolicy: { onBenchmarkFailure: "discard", onCheckFailure: "discard", onMetricMissing: "discard", onContractViolation: "pause", onRevertFailure: "pause" },
	};
}

function lock(c: AutoresearchContractV1): LockFile {
	return { schemaVersion: "autoresearch-lock/v1", contractId: "contract-test", contractHash: computeContractHash(c), approvedAt: Date.now(), approvedBy: "test", baseline: { gitCommit: "HEAD", runs: [], aggregate: "median", primaryMetricValue: 1, noise: { samples: [1], mean: 1, median: 1, min: 1, max: 1, stddev: 0, relativeStddev: 0 } }, environment: { immutableReadSetHash: "sha256:x", files: [] } };
}

function hashText(s: string): string { return "sha256:" + createHash("sha256").update(s).digest("hex"); }
function writeSubagentPatch(cwd: string, patch: string, touched = ["src/a.txt"], status = "pending", outcome = "patch", baseFiles: Array<{ path: string; hash: string }> = []): string {
	const dir = path.join(cwd, ".pi", "subagent-results"); fs.mkdirSync(dir, { recursive: true });
	const id = "sar_test_1"; fs.writeFileSync(path.join(dir, `${id}.patch`), patch);
	fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify({ result_id: id, agent_id: "a", agent_path: "/root/a", created_at: Date.now(), status, result: { schema: "subagent.result.v1", outcome, summary: "make src", patch: { format: "unified_diff", ref: path.join(dir, `${id}.patch`), bytes: patch.length }, base: { files: baseFiles }, scope: { allowed_paths: ["src"], touched_paths: touched }, semantic: { reads: [], writes: [], assumptions: [], effects: [], public_surface_delta: [], risk: { level: "low" } }, validation: { suggested: [] } } }, null, 2));
	return id;
}

describe("autoresearch candidates", () => {
	it("escrows pending subagent patch without changing result status and applies as trial", () => {
		const cwd = tmpRepo();
		const patch = "diff --git a/src/a.txt b/src/a.txt\nnew file mode 100644\nindex 0000000..257cc56\n--- /dev/null\n+++ b/src/a.txt\n@@ -0,0 +1 @@\n+hello\n";
		const id = writeSubagentPatch(cwd, patch);
		const c = contract(); const res = importSubagentResultsAsCandidates(cwd, c, lock(c), { source: "pending" });
		expect(res.imported).toHaveLength(1);
		const storedAfterEscrow = JSON.parse(fs.readFileSync(path.join(cwd, ".pi", "subagent-results", `${id}.json`), "utf8"));
		expect(storedAfterEscrow.status).toBe("escrowed");
		expect(storedAfterEscrow.escrow_record.candidate_id).toBe(res.imported[0].candidate_id);
		const applied = applyCandidate(cwd, c, lock(c), res.imported[0].candidate_id);
		expect(applied.status).toBe("trial_applied");
		expect(fs.readFileSync(path.join(cwd, "src", "a.txt"), "utf8")).toBe("hello\n");
		const events = fs.readFileSync(candidateEventsPath(cwd, applied.candidate_id), "utf8").trim().split(/\n/).map((l) => JSON.parse(l));
		expect(events.map((e) => e.to)).toEqual(["pending", "leased", "trial_applied"]);
	});

	it("detects post-apply diff identity drift", () => {
		const cwd = tmpRepo();
		const patch = "diff --git a/src/a.txt b/src/a.txt\nnew file mode 100644\nindex 0000000..257cc56\n--- /dev/null\n+++ b/src/a.txt\n@@ -0,0 +1 @@\n+hello\n";
		writeSubagentPatch(cwd, patch);
		const c = contract(); const res = importSubagentResultsAsCandidates(cwd, c, lock(c), { source: "pending" });
		const applied = applyCandidate(cwd, c, lock(c), res.imported[0].candidate_id);
		fs.appendFileSync(path.join(cwd, "src", "a.txt"), "mutated\n");
		expect(() => assertCandidateReadyForRun(cwd, c, lock(c), applied.candidate_id)).toThrow(/diff identity mismatch/);
	});

	it("applies candidate in isolated worktree without dirtying main tree", () => {
		const cwd = tmpRepo();
		const patch = "diff --git a/src/a.txt b/src/a.txt\nnew file mode 100644\nindex 0000000..257cc56\n--- /dev/null\n+++ b/src/a.txt\n@@ -0,0 +1 @@\n+hello\n";
		writeSubagentPatch(cwd, patch);
		const c = contract(); const res = importSubagentResultsAsCandidates(cwd, c, lock(c), { source: "pending" });
		const applied = applyCandidateIsolated(cwd, c, lock(c), res.imported[0].candidate_id);
		expect(applied.status).toBe("trial_applied");
		expect(applied.trial?.mode).toBe("isolated_worktree");
		expect(fs.existsSync(path.join(cwd, "src", "a.txt"))).toBe(false);
		expect(candidateChangedFiles(cwd)).toEqual([]);
		expect(fs.readFileSync(path.join(applied.trial!.worktree_path!, "src", "a.txt"), "utf8")).toBe("hello\n");
	});

	it("skips non-patch and forbidden candidates", () => {
		const cwd = tmpRepo();
		writeSubagentPatch(cwd, "diff --git a/forbidden/a.txt b/forbidden/a.txt\n--- /dev/null\n+++ b/forbidden/a.txt\n@@ -0,0 +1 @@\n+x\n", ["forbidden/a.txt"]);
		const c = contract();
		const res = importSubagentResultsAsCandidates(cwd, c, lock(c), { source: "pending" });
		expect(res.imported).toHaveLength(0);
		expect(res.skipped[0].reason).toBe("outside_allowed_write_paths");
		expect(listCandidates(cwd)).toHaveLength(0);
	});

	it("uses contract glob semantics and verifies base file hashes", () => {
		const cwd = tmpRepo(); fs.mkdirSync(path.join(cwd, "src")); fs.writeFileSync(path.join(cwd, "src", "a.ts"), "old\n");
		execFileSync("git", ["add", "src/a.ts"], { cwd }); execFileSync("git", ["commit", "-m", "src"], { cwd, stdio: "ignore" });
		const patch = "diff --git a/src/a.ts b/src/a.ts\nindex 3e75765..b6fc4c6 100644\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-old\n+new\n";
		writeSubagentPatch(cwd, patch, ["src/a.ts"], "pending", "patch", [{ path: "src/a.ts", hash: hashText("old\n") }]);
		const c = contract(); c.scope.allowedWritePaths = ["src/*.ts"];
		const res = importSubagentResultsAsCandidates(cwd, c, lock(c), { source: "pending" });
		expect(res.imported).toHaveLength(1);
	});

	it("rejects unsafe patch paths and missing base hashes for existing touched files", () => {
		const unsafeCwd = tmpRepo();
		writeSubagentPatch(unsafeCwd, "diff --git a/../evil.txt b/../evil.txt\n--- a/../evil.txt\n+++ b/../evil.txt\n@@ -1 +1 @@\n-old\n+new\n", ["evil.txt"]);
		const c1 = contract();
		const unsafe = importSubagentResultsAsCandidates(unsafeCwd, c1, lock(c1), { source: "pending" });
		expect(unsafe.imported).toHaveLength(0);
		expect(unsafe.skipped[0].reason).toBe("unsafe_patch_path");

		const cwd = tmpRepo(); fs.mkdirSync(path.join(cwd, "src")); fs.writeFileSync(path.join(cwd, "src", "a.txt"), "old\n");
		execFileSync("git", ["add", "src/a.txt"], { cwd }); execFileSync("git", ["commit", "-m", "src"], { cwd, stdio: "ignore" });
		const patch = "diff --git a/src/a.txt b/src/a.txt\nindex 3e75765..b6fc4c6 100644\n--- a/src/a.txt\n+++ b/src/a.txt\n@@ -1 +1 @@\n-old\n+new\n";
		writeSubagentPatch(cwd, patch, ["src/a.txt"]);
		const c2 = contract();
		const missing = importSubagentResultsAsCandidates(cwd, c2, lock(c2), { source: "pending" });
		expect(missing.imported).toHaveLength(0);
		expect(missing.skipped[0].reason).toBe("base_hash_mismatch");
		expect((missing.skipped[0].details as any).reason).toBe("missing_base_hash");
	});

	it("does not leave candidates leased when apply check fails", () => {
		const cwd = tmpRepo();
		const brokenPatch = "diff --git a/src/b.txt b/src/b.txt\nnew file mode 100644\n--- /dev/null\n+++ b/src/b.txt\n@@ -0,0 +1 @@\n";
		writeSubagentPatch(cwd, brokenPatch, ["src/b.txt"]);
		const c = contract(); const res = importSubagentResultsAsCandidates(cwd, c, lock(c), { source: "pending" });
		expect(res.imported).toHaveLength(1);
		expect(() => applyCandidate(cwd, c, lock(c), res.imported[0].candidate_id)).toThrow();
		expect(readCandidate(cwd, res.imported[0].candidate_id).status).toBe("paused_dirty");
	});

	it("does not leave isolated candidates leased when apply check fails and records worktree path", () => {
		const cwd = tmpRepo();
		const brokenPatch = "diff --git a/src/b.txt b/src/b.txt\nnew file mode 100644\n--- /dev/null\n+++ b/src/b.txt\n@@ -0,0 +1 @@\n";
		writeSubagentPatch(cwd, brokenPatch, ["src/b.txt"]);
		const c = contract(); const res = importSubagentResultsAsCandidates(cwd, c, lock(c), { source: "pending" });
		expect(res.imported).toHaveLength(1);
		expect(() => applyCandidateIsolated(cwd, c, lock(c), res.imported[0].candidate_id)).toThrow();
		const candidate = readCandidate(cwd, res.imported[0].candidate_id);
		expect(candidate.status).toBe("paused_dirty");
		expect(candidate.trial?.worktree_path).toBeTruthy();
	});

	it("rejects base hash mismatch and terminal status transitions", () => {
		const cwd = tmpRepo(); fs.mkdirSync(path.join(cwd, "src")); fs.writeFileSync(path.join(cwd, "src", "a.txt"), "old\n");
		execFileSync("git", ["add", "src/a.txt"], { cwd }); execFileSync("git", ["commit", "-m", "src"], { cwd, stdio: "ignore" });
		const patch = "diff --git a/src/a.txt b/src/a.txt\nindex 3e75765..b6fc4c6 100644\n--- a/src/a.txt\n+++ b/src/a.txt\n@@ -1 +1 @@\n-old\n+new\n";
		writeSubagentPatch(cwd, patch, ["src/a.txt"], "pending", "patch", [{ path: "src/a.txt", hash: hashText("different\n") }]);
		const c = contract();
		const res = importSubagentResultsAsCandidates(cwd, c, lock(c), { source: "pending" });
		expect(res.imported).toHaveLength(0);
		expect(res.skipped[0].reason).toBe("base_hash_mismatch");

		writeSubagentPatch(cwd, "diff --git a/src/b.txt b/src/b.txt\n--- /dev/null\n+++ b/src/b.txt\n@@ -0,0 +1 @@\n+b\n", ["src/b.txt"]);
		const ok = importSubagentResultsAsCandidates(cwd, c, lock(c), { source: "pending" });
		const kept = updateCandidateStatus(cwd, ok.imported[0].candidate_id, "rejected_policy");
		expect(() => updateCandidateStatus(cwd, kept.candidate_id, "pending")).toThrow(/invalid candidate status transition/);
	});
});
