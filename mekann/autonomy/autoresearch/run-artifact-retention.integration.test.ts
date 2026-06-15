import { beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

import {
	autoresearchTestSetup,
	createGitTestDir,
	createMockCtx,
	createMockPi,
} from "./index-test-utils.js";

describe("autoresearch run artifact retention integration (issue #47)", () => {
	let pi: ReturnType<typeof createMockPi>;

	beforeEach(() => {
		({ pi } = autoresearchTestSetup());
	});

	it("keeps run dirs bounded per plan across many runs", async () => {
		const testDir = createGitTestDir("test-ar-retain");
		const localCtx = createMockCtx({ cwd: testDir });

		// Lower the per-plan retention limit so the bound is observable without
		// running dozens of real commands.
		const prev = process.env.MEKANN_AUTORESEARCH_MAX_RUNS_PER_PLAN;
		process.env.MEKANN_AUTORESEARCH_MAX_RUNS_PER_PLAN = "3";
		try {
			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			await cmdHandler("on", localCtx);

			const runTool = pi.tools.find((t) => t.name === "autoresearch_run")!;

			const runIds: string[] = [];
			for (let i = 0; i < 5; i++) {
				const r = await runTool.execute(
					`tc-retain-${i}`,
					{ command: `echo METRIC ms=${100 - i}` },
					undefined,
					undefined,
					localCtx,
				);
				runIds.push(r.details.piRunId);
			}

			const state = JSON.parse(fs.readFileSync(path.join(testDir, ".autoresearch", "state.json"), "utf8"));
			const planId = state.currentPlanId;
			expect(planId).toBeTruthy();
			const planRunsDir = path.join(testDir, ".autoresearch", "plans", planId, "runs");
			expect(fs.existsSync(planRunsDir)).toBe(true);

			const remaining = fs.readdirSync(planRunsDir).sort();
			expect(remaining.length).toBe(3);
			expect(remaining).not.toContain(runIds[0]);
			expect(remaining).not.toContain(runIds[1]);
			expect(remaining).toContain(runIds[4]);

			expect(fs.existsSync(path.join(testDir, ".autoresearch", "plans", planId, "plan.md"))).toBe(true);
			expect(fs.existsSync(path.join(testDir, ".autoresearch", "state.json"))).toBe(true);

			const sessDirs = fs.readdirSync(path.join(testDir, ".pi", "autoresearch"));
			const sessionId = sessDirs[0];
			const legacyRunsDir = path.join(testDir, ".pi", "autoresearch", sessionId, "runs");
			expect(fs.existsSync(legacyRunsDir)).toBe(true);
			expect(fs.readdirSync(legacyRunsDir).length).toBe(3);
		} finally {
			if (prev === undefined) delete process.env.MEKANN_AUTORESEARCH_MAX_RUNS_PER_PLAN;
			else process.env.MEKANN_AUTORESEARCH_MAX_RUNS_PER_PLAN = prev;
			fs.rmSync(testDir, { recursive: true, force: true });
		}
	});

	it("does not delete the current completed run under a tight limit", async () => {
		const testDir = createGitTestDir("test-ar-retain-cur");
		const localCtx = createMockCtx({ cwd: testDir });

		const prev = process.env.MEKANN_AUTORESEARCH_MAX_RUNS_PER_PLAN;
		process.env.MEKANN_AUTORESEARCH_MAX_RUNS_PER_PLAN = "1";
		try {
			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			await cmdHandler("on", localCtx);

			const runTool = pi.tools.find((t) => t.name === "autoresearch_run")!;
			const r = await runTool.execute(
				"tc-retain-cur",
				{ command: "echo METRIC ms=1" },
				undefined,
				undefined,
				localCtx,
			);

			expect(r.details.piRunId).toBeTruthy();
			expect(fs.existsSync(r.details.artifactDir)).toBe(true);
			expect(fs.existsSync(path.join(r.details.artifactDir, "manifest.json"))).toBe(true);
			const manifest = JSON.parse(fs.readFileSync(path.join(r.details.artifactDir, "manifest.json"), "utf8"));
			expect(manifest.artifactComplete).toBe(true);
		} finally {
			if (prev === undefined) delete process.env.MEKANN_AUTORESEARCH_MAX_RUNS_PER_PLAN;
			else process.env.MEKANN_AUTORESEARCH_MAX_RUNS_PER_PLAN = prev;
			fs.rmSync(testDir, { recursive: true, force: true });
		}
	});
});
