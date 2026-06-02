import * as fs from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { planPath } from "./contractV1.js";
import { buildScalingPlan, claimNextAction, createPlanningScaleState, nextActionMessage, requestScaleStop, startScale, statusText as scaleStatusText, type ScaleRuntimeStore } from "./scale.js";
import { handleCommand } from "./tools/commandHandler.js";
import type { SessionStore } from "./tools/sessionStore.js";
import type { toolDeps } from "./index.js";

export function registerAutoresearchCommands(
	pi: ExtensionAPI,
	store: SessionStore,
	scaleStore: ScaleRuntimeStore,
	syncAutoresearchToolSurface: () => void,
	deps: typeof toolDeps,
): void {
	pi.registerCommand("autoresearch", {
		description: "autoresearch モードの管理(on / off / status / clear)",
		handler: async (args, ctx) => {
			await handleCommand(args, ctx, pi, store, { ...deps, onSurfaceChange: syncAutoresearchToolSurface });
		},
	});

	pi.registerCommand("autoresearch-scale", {
		description: "autoresearch test-time scaling supervisor の管理(start / stop / status / <目的文>)",
		handler: async (args, ctx) => {
			const raw = (args ?? "").trim();
			try {
				if (raw === "status" || raw === "") {
					ctx.ui.notify(scaleStatusText(ctx.cwd), "info");
					return;
				}
				if (raw === "start") {
					store.active = true;
					store.autoLoop = false;
					const s = startScale(ctx.cwd);
					scaleStore.active = true;
					scaleStore.promptQueued = false;
					syncAutoresearchToolSurface();
					store.updateWidget(ctx);
					ctx.ui.notify(`autoresearch-scale を開始しました: generation=${s.generation}`, "info");
					const action = claimNextAction(ctx.cwd);
					if (action) {
						scaleStore.promptQueued = true;
						pi.sendUserMessage(nextActionMessage(action), { deliverAs: "followUp" });
					}
					return;
				}
				if (raw === "stop") {
					const s = requestScaleStop(ctx.cwd);
					scaleStore.active = s.status === "draining";
					scaleStore.promptQueued = false;
					syncAutoresearchToolSurface();
					ctx.ui.notify(s.status === "draining" ? "autoresearch-scale は graceful stopping です" : "autoresearch-scale を停止しました", "info");
					return;
				}

				const plan = buildScalingPlan(raw);
				fs.writeFileSync(planPath(ctx.cwd), plan.markdown, "utf8");
				createPlanningScaleState(ctx.cwd);
				store.active = true;
				store.autoLoop = false;
				scaleStore.active = false;
				scaleStore.promptQueued = false;
				syncAutoresearchToolSurface();
				store.updateWidget(ctx);
				let msg = `[OK] scaling plan draft を生成しました: ${planPath(ctx.cwd)}\n`;
				msg += `判定: ${plan.decision}\n主指標: ${plan.contract.evaluation.primaryMetric.name} (${plan.contract.evaluation.primaryMetric.direction})\n`;
				if (plan.blockingIssues.length > 0) msg += `\nブロッキング issue:\n${plan.blockingIssues.map((i) => `- ${i}`).join("\n")}\n`;
				if (plan.clarifyingQuestions.length > 0) msg += `\n確認質問:\n${plan.clarifyingQuestions.map((q) => `- ${q}`).join("\n")}\n`;
				msg += "\nplan を確認・編集した後、autoresearch_approve を実行してください。承認後に /autoresearch-scale start で開始できます。";
				ctx.ui.notify(msg, "info");
			} catch (e) {
				ctx.ui.notify(`[ERROR] autoresearch-scale: ${e instanceof Error ? e.message : String(e)}`, "error");
			}
		},
	});
}
