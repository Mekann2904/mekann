/**
 * planning.test.ts — /autoresearch-scale コマンドと scale supervisor のテスト
 *
 * autoresearch/index.test.ts から仕様領域ごとに分割された focused suite。
 * scaling plan draft の生成、planning status の報告、scout hypothesis scoring に
 * よる supervisor action の進行を検証する。共有ヘルパーは ./index-test-utils.ts を参照。
 */

import { describe, it, expect, beforeEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
	autoresearchTestSetup,
	createMockPi,
	type MockCtx,
} from "./index-test-utils.js";

describe("autoresearchExtension", () => {
	let pi: ReturnType<typeof createMockPi>;
	let ctx: MockCtx;

	beforeEach(() => {
		({ pi, ctx } = autoresearchTestSetup());
	});

	// ── /autoresearch-scale ─────────────────────────────────────

	describe("/autoresearch-scale", () => {
		it("creates a scaling plan draft from a purpose", async () => {
			const handler = pi.commands.get("autoresearch-scale")!.handler;
			await handler("Reduce duration_seconds", ctx);
			const plan = fs.readFileSync(path.join(ctx.cwd, "autoresearch.plan.md"), "utf8");
			expect(plan).toContain("# Autoresearch Scaling Plan");
			expect(plan).toContain("mode\": \"test_time_scaling\"");
			expect(plan).toContain("## Hypothesis Population");
			expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("scaling plan draft"), "info");
		});

		it("reports planning status before approve", async () => {
			const handler = pi.commands.get("autoresearch-scale")!.handler;
			await handler("Reduce duration_seconds", ctx);
			ctx.ui.notify.mockClear();
			await handler("status", ctx);
			expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("autoresearch-scale: planning"), "info");
		});

		it("advances supervisor actions through scout hypothesis scoring", async () => {
			fs.mkdirSync(path.join(ctx.cwd, ".autoresearch", "plans", "plan-scale-test", "scaling"), { recursive: true });
			fs.writeFileSync(path.join(ctx.cwd, ".autoresearch", "state.json"), JSON.stringify({ version: 2, currentPlanId: "plan-scale-test", currentPlanDir: ".autoresearch/plans/plan-scale-test", updatedAt: new Date().toISOString() }));
			fs.writeFileSync(path.join(ctx.cwd, ".autoresearch", "plans", "plan-scale-test", "scaling", "state.json"), JSON.stringify({
				version: 1,
				status: "running",
				planId: "plan-scale-test",
				generation: 0,
				queues: { hypotheses: 0, proposals: 0, candidates: 0 },
				resources: { subagentsUsed: 0, subagentsMax: 2, evaluationsUsed: 0, evaluationsMax: 1, worktreesUsed: 0, worktreesMax: 2 },
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			}));

			const nextTool = pi.tools.find((t) => t.name === "autoresearch_scale_next")!;
			const completeTool = pi.tools.find((t) => t.name === "autoresearch_scale_complete_action")!;
			let next = await nextTool.execute("tc-next", {}, undefined, undefined, ctx);
			expect(next.details.type).toBe("start_generation");
			await completeTool.execute("tc-complete", { action_id: next.details.action_id, result: { summary: "started" } }, undefined, undefined, ctx);

			next = await nextTool.execute("tc-next2", {}, undefined, undefined, ctx);
			expect(next.details.type).toBe("spawn_scouts");
			await completeTool.execute("tc-complete2", { action_id: next.details.action_id, result: { summary: "spawned", started_count: 2 } }, undefined, undefined, ctx);

			next = await nextTool.execute("tc-next3", {}, undefined, undefined, ctx);
			expect(next.details.type).toBe("wait_scout_results");
			await completeTool.execute("tc-complete3", { action_id: next.details.action_id, result: { summary: "scouts done", hypotheses: [{ slot: "file_cluster", hypothesis: "Simplify hot path", suggested_paths: ["src/a.ts"], expected_evidence: ["benchmark metric improves"], risk: "low" }] } }, undefined, undefined, ctx);

			next = await nextTool.execute("tc-next4", {}, undefined, undefined, ctx);
			expect(next.details.type).toBe("score_hypotheses");
			await completeTool.execute("tc-complete4", { action_id: next.details.action_id, result: { summary: "scored" } }, undefined, undefined, ctx);

			const s = JSON.parse(fs.readFileSync(path.join(ctx.cwd, ".autoresearch", "plans", "plan-scale-test", "scaling", "state.json"), "utf8"));
			expect(s.phase).toBe("need_proposer");
			expect(s.hypotheses[0].score).toBeGreaterThan(0);
		});
	});
});
