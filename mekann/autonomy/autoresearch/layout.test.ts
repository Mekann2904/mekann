import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { computePlanId, createOrReusePlan, createRunArtifacts, generateRunId, journalPath, readState } from "./layout.js";

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
