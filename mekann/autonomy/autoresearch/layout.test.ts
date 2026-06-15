import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { computePlanId, createOrReusePlan, createRunArtifacts, generateRunId, journalPath, readState, retainRuns, retainRunsForPlan } from "./layout.js";

describe("plan-scoped autoresearch layout", () => {
	function tmp(): string { return fs.mkdtempSync(path.join(os.tmpdir(), "ar-layout-")); }

	it("reuses the same planId for identical content and creates a different planId for changed content", () => {
		const a = { planMarkdown: "# A\n", contract: { metric: "m", direction: "lower" }, benchmarkScript: "echo 1\n", metricName: "m", metricDirection: "lower" };
		const b = { ...a, planMarkdown: "# B\n" };
		expect(computePlanId(a)).toBe(computePlanId({ contract: { direction: "lower", metric: "m" }, planMarkdown: "# A\n", benchmarkScript: "echo 1\n", metricDirection: "lower", metricName: "m" }));
		expect(computePlanId(a)).not.toBe(computePlanId(b));
	});

	it("stores plan files under .autoresearch/plans/<planId> without overwriting existing plan dirs", () => {
		const cwd = tmp();
		const def = { planMarkdown: "# A\n", contract: { metric: "m" }, benchmarkScript: "echo METRIC m=1\n", metricName: "m" };
		const p1 = createOrReusePlan(cwd, def, "s1");
		const p2 = createOrReusePlan(cwd, def, "s1");
		expect(p2.planId).toBe(p1.planId);
		expect(p2.reused).toBe(true);
		expect(fs.existsSync(path.join(p1.planDir, "plan.md"))).toBe(true);
		expect(fs.readFileSync(path.join(cwd, "autoresearch.sh"), "utf8")).toContain("currentPlanDir");
		expect(readState(cwd).currentPlanId).toBe(p1.planId);
		expect(fs.readFileSync(journalPath(cwd), "utf8")).toContain("plan_created");
	});

	it("creates multiple unique run directories below one plan", () => {
		const cwd = tmp();
		const p = createOrReusePlan(cwd, { planMarkdown: "# A\n", contract: {}, benchmarkScript: "echo ok\n" });
		const r1 = generateRunId(cwd);
		const r2 = generateRunId(cwd);
		expect(r1).not.toBe(r2);
		expect(r1.startsWith("run-")).toBe(true);
		const d1 = createRunArtifacts(cwd, p.planId, r1).runDir;
		const d2 = createRunArtifacts(cwd, p.planId, r2).runDir;
		expect(path.dirname(d1)).toBe(path.dirname(d2));
		expect(fs.existsSync(d1)).toBe(true);
		expect(fs.existsSync(d2)).toBe(true);
	});
});

describe("run artifact retention (issue #47)", () => {
	function tmp(): string { return fs.mkdtempSync(path.join(os.tmpdir(), "ar-retain-")); }

	/** Write a run dir with the given manifest under `runsDir`. */
	function writeRun(runsDir: string, name: string, manifest: Record<string, unknown>): string {
		const runDir = path.join(runsDir, name);
		fs.mkdirSync(runDir, { recursive: true });
		fs.writeFileSync(path.join(runDir, "manifest.json"), JSON.stringify(manifest, null, 2));
		fs.writeFileSync(path.join(runDir, "stdout.log"), `body-${name}`);
		return runDir;
	}

	function completed(completedAt: number, startedAt = completedAt): Record<string, unknown> {
		return { piRunId: "x", completedAt, startedAt, artifactComplete: true, logFilesWritten: true, streamError: null };
	}

	it("removes only the oldest completed runs beyond the keep count", () => {
		const runsDir = path.join(tmp(), "runs");
		fs.mkdirSync(runsDir, { recursive: true });
		writeRun(runsDir, "run-1", completed(1000));
		writeRun(runsDir, "run-2", completed(2000));
		writeRun(runsDir, "run-3", completed(3000));
		writeRun(runsDir, "run-4", completed(4000));
		writeRun(runsDir, "run-5", completed(5000));

		const res = retainRuns(runsDir, 2);

		expect(res.removed).toBe(3);
		const remaining = fs.readdirSync(runsDir).sort();
		expect(remaining).toEqual(["run-4", "run-5"]);
	});

	it("never deletes in-progress runs (artifactComplete !== true)", () => {
		const runsDir = path.join(tmp(), "runs");
		fs.mkdirSync(runsDir, { recursive: true });
		writeRun(runsDir, "old-complete", completed(1000));
		writeRun(runsDir, "newer-inprogress", { ...completed(9999), artifactComplete: false });
		writeRun(runsDir, "newest-complete", completed(9000));

		// keep=1: should delete the oldest COMPLETE run, keep the newest complete,
		// and leave the in-progress run untouched regardless of its timestamp.
		const res = retainRuns(runsDir, 1);

		expect(res.removed).toBe(1);
		const remaining = fs.readdirSync(runsDir).sort();
		expect(remaining).toEqual(["newer-inprogress", "newest-complete"]);
	});

	it("never deletes runs without a manifest.json (incomplete / mid-write)", () => {
		const runsDir = path.join(tmp(), "runs");
		fs.mkdirSync(runsDir, { recursive: true });
		writeRun(runsDir, "c1", completed(1000));
		writeRun(runsDir, "c2", completed(2000));
		// dir with no manifest.json — must be left alone
		const noManifest = path.join(runsDir, "no-manifest");
		fs.mkdirSync(noManifest, { recursive: true });
		fs.writeFileSync(path.join(noManifest, "stdout.log"), "partial");

		retainRuns(runsDir, 1);

		expect(fs.existsSync(noManifest)).toBe(true);
		const remaining = fs.readdirSync(runsDir).sort();
		expect(remaining).toEqual(["c2", "no-manifest"]);
	});

	it("leaves an unparseable manifest run untouched", () => {
		const runsDir = path.join(tmp(), "runs");
		fs.mkdirSync(runsDir, { recursive: true });
		writeRun(runsDir, "c1", completed(1000));
		const broken = path.join(runsDir, "broken");
		fs.mkdirSync(broken, { recursive: true });
		fs.writeFileSync(path.join(broken, "manifest.json"), "{ not valid json");

		retainRuns(runsDir, 1);

		expect(fs.existsSync(broken)).toBe(true);
		const remaining = fs.readdirSync(runsDir).sort();
		expect(remaining).toEqual(["broken", "c1"]);
	});

	it("is a no-op when the completed count is within the limit", () => {
		const runsDir = path.join(tmp(), "runs");
		fs.mkdirSync(runsDir, { recursive: true });
		writeRun(runsDir, "c1", completed(1000));
		writeRun(runsDir, "c2", completed(2000));

		const res = retainRuns(runsDir, 5);

		expect(res).toEqual({ kept: 2, removed: 0 });
		expect(fs.readdirSync(runsDir).sort()).toEqual(["c1", "c2"]);
	});

	it("is a no-op when the runs directory does not exist", () => {
		const res = retainRuns(path.join(tmp(), "missing-runs"), 5);
		expect(res).toEqual({ kept: 0, removed: 0 });
	});

	it("keepCount=0 removes all completed runs while preserving in-progress ones", () => {
		const runsDir = path.join(tmp(), "runs");
		fs.mkdirSync(runsDir, { recursive: true });
		writeRun(runsDir, "c1", completed(1000));
		writeRun(runsDir, "inprogress", { ...completed(2000), artifactComplete: false });

		const res = retainRuns(runsDir, 0);

		expect(res.removed).toBe(1);
		expect(fs.readdirSync(runsDir).sort()).toEqual(["inprogress"]);
	});

	it("retainRunsForPlan operates on .autoresearch/plans/<planId>/runs only", () => {
		const cwd = tmp();
		const p = createOrReusePlan(cwd, { planMarkdown: "# A\n", contract: {}, benchmarkScript: "echo ok\n" });
		const runsDir = path.join(p.planDir, "runs");
		fs.mkdirSync(runsDir, { recursive: true });
		writeRun(runsDir, "r1", completed(1000));
		writeRun(runsDir, "r2", completed(2000));
		writeRun(runsDir, "r3", completed(3000));

		const res = retainRunsForPlan(cwd, p.planId, 1);

		expect(res.removed).toBe(2);
		// plan dir / contract / plan.md untouched — only runs pruned.
		expect(fs.existsSync(path.join(p.planDir, "plan.md"))).toBe(true);
		expect(fs.existsSync(path.join(p.planDir, "contract.json"))).toBe(true);
		expect(fs.readdirSync(runsDir).sort()).toEqual(["r3"]);
	});
});
