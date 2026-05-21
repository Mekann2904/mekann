/**
 * /autoresearch コマンドハンドラ + activateAutoresearch
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { deleteContract } from "../contract.js";
import { freshState } from "../state.js";
import type { SessionStore } from "./sessionStore.js";

export async function handleCommand(
	args: string | undefined,
	ctx: ExtensionContext,
	pi: ExtensionAPI,
	store: SessionStore,
	deps: {
		jsonlPath: (cwd: string) => string;
		mdFilePath: (cwd: string) => string;
	},
): Promise<void> {
	const parts = (args ?? "").trim().split(/\s+/);
	const sub = parts[0] || "status";

	switch (sub) {
		case "on": {
			activateAutoresearch(ctx, pi, store, parts.slice(1).join(" ").trim(), deps.mdFilePath);
			break;
		}
		case "off": {
			store.active = false; store.autoLoop = false; store.loopPromptQueued = false;
			store.updateWidget(ctx);
			ctx.ui.notify("autoresearch モードを無効にしました", "info");
			break;
		}
		case "clear": {
			const clearAll = parts[1] === "all";
			const jp = deps.jsonlPath(ctx.cwd);
			try { if (fs.existsSync(jp)) fs.rmSync(jp, { recursive: true, force: true }); } catch {}
			deleteContract(ctx.cwd);
			const clearWarnings: string[] = [];
			try {
				if (clearAll) {
					fs.rmSync(path.join(ctx.cwd, ".autoresearch"), { recursive: true, force: true });
					fs.rmSync(path.join(ctx.cwd, ".pi", "autoresearch"), { recursive: true, force: true });
					for (const f of ["autoresearch.sh", "autoresearch.checks.sh"]) {
						const fp = path.join(ctx.cwd, f);
						try {
							if (fs.existsSync(fp)) {
								const content = fs.readFileSync(fp, "utf8");
								if (content.includes("AUTORESEARCH:generated")) {
									fs.rmSync(fp, { force: true });
								} else {
									clearWarnings.push(`${f} は生成ファイルではないため削除しません`);
								}
							}
						} catch (e) { clearWarnings.push(`${f} の削除に失敗: ${e instanceof Error ? e.message : String(e)}`); }
					}
					for (const f of ["autoresearch.md", "autoresearch.plan.md", "autoresearch.ideas.md"]) {
						const fp = path.join(ctx.cwd, f);
						try {
							if (fs.existsSync(fp)) {
								const content = fs.readFileSync(fp, "utf8");
								if (content.includes("AUTORESEARCH:BEGIN generated") || content.includes("AUTORESEARCH:generated")) {
									fs.rmSync(fp, { force: true });
								} else {
									clearWarnings.push(`${f} は生成ファイルではないため削除しません`);
								}
							}
						} catch (e) { clearWarnings.push(`${f} の削除に失敗: ${e instanceof Error ? e.message : String(e)}`); }
					}
					for (const f of ["autoresearch.jsonl", "autoresearch.contract.json"]) {
						const fp = path.join(ctx.cwd, f);
						try { if (fs.existsSync(fp)) fs.rmSync(fp, { force: true }); } catch {}
					}
				} else {
					for (const f of ["state.json", "current.plan.json"]) {
						fs.rmSync(path.join(ctx.cwd, ".autoresearch", f), { force: true });
					}
					const disabled = "#!/usr/bin/env bash\n# AUTORESEARCH:generated\necho 'autoresearch current state is cleared. Run autoresearch_init first.' >&2\nexit 1\n";
					fs.writeFileSync(path.join(ctx.cwd, "autoresearch.sh"), disabled, { mode: 0o755 });
					fs.writeFileSync(path.join(ctx.cwd, "autoresearch.checks.sh"), disabled, { mode: 0o755 });
				}
			} catch {}
			store.state = freshState(); store.active = false; store.autoLoop = false; store.runningExperiment = null;
			store.runResultMap.clear(); store.resetLoopProgress();
			store.updateWidget(ctx);
			ctx.ui.notify(clearAll ? "autoresearch の全データをクリアしました" : "autoresearch の current state をクリアしました", "info");
			if (clearWarnings.length > 0) {
				ctx.ui.notify("警告:\n" + clearWarnings.join("\n"), "warning");
			}
			break;
		}
		case "status": {
			const kept = store.state.results.filter(r => r.status === "keep").length;
			const best = store.state.bestMetric !== null ? `${store.state.metricName}=${store.state.bestMetric}${store.state.metricUnit}` : "未測定";
			const maxStr = store.maxLoopIterations === null ? "∞" : String(store.maxLoopIterations);
			ctx.ui.notify(
				`autoresearch: ${store.active ? "有効" : "無効"}\n` +
				`loop: ${store.autoLoop ? "ON" : "OFF"} (${store.loopIterationCount}/${maxStr})\n` +
				`実験回数: ${store.state.runCount} / 採用: ${kept} / 最良: ${best}`,
				"info",
			);
			break;
		}
		case "loop": {
			const loopSub = parts[1] || "status";
			if (loopSub === "on") { store.autoLoop = true; store.noProgressAgentEnds = 0; store.loopPromptQueued = false; store.updateWidget(ctx); ctx.ui.notify("autoresearch loop を有効にしました", "info"); break; }
			if (loopSub === "off") { store.autoLoop = false; store.loopPromptQueued = false; store.updateWidget(ctx); ctx.ui.notify("autoresearch loop を無効にしました", "info"); break; }
			if (loopSub === "max") {
				const raw = parts[2];
				if (raw === "none" || raw === "∞" || raw === "infinite") { store.maxLoopIterations = null; }
				else { const p = Number(raw); if (!Number.isInteger(p) || p <= 0) { ctx.ui.notify("使い方: loop max <正の整数|none>", "warning"); break; } store.maxLoopIterations = p; }
				store.updateWidget(ctx);
				ctx.ui.notify(`autoresearch loop max を ${store.maxLoopIterations ?? "∞"} に設定しました`, "info");
				break;
			}
			ctx.ui.notify(`loop: ${store.autoLoop ? "ON" : "OFF"} iter=${store.loopIterationCount}`, "info");
			break;
		}
		default: {
			activateAutoresearch(ctx, pi, store, (args ?? "").trim(), deps.mdFilePath);
			break;
		}
	}
}

const AUTORESEARCH_PURPOSE_MAX_CHARS = 2_000;
function truncatePurpose(purpose: string): string {
	if (purpose.length <= AUTORESEARCH_PURPOSE_MAX_CHARS) return purpose;
	return `${purpose.slice(0, AUTORESEARCH_PURPOSE_MAX_CHARS)}\n[omitted: ${purpose.length - AUTORESEARCH_PURPOSE_MAX_CHARS} chars from autoresearch activation context]`;
}

function activateAutoresearch(
	ctx: ExtensionContext,
	pi: ExtensionAPI,
	store: SessionStore,
	purpose: string,
	mdFilePath: (cwd: string) => string,
): void {
	store.active = true; store.autoLoop = true; store.resetLoopProgress(); store.loopPromptQueued = true;
	store.updateWidget(ctx);
	ctx.ui.notify("autoresearch モードを有効にしました(loop ON)", "info");
	const hasMd = fs.existsSync(mdFilePath(ctx.cwd));
	const safePurpose = purpose ? truncatePurpose(purpose) : "";
	let msg: string;
	if (hasMd) {
		msg = "autoresearch.md を読み直して再開してください。";
		if (safePurpose) msg += `\n追加コンテキスト: ${safePurpose}`;
	} else {
		msg = "autoresearch モードを有効化しました。" +
			"目的・指標・実行コマンドを整理して autoresearch.md とベンチマークスクリプトを作成し、実験を開始してください。" +
			"\n必要なら `/skill:autoresearch-create` で手順を確認できます。";
		if (safePurpose) msg += `\n目的: ${safePurpose}`;
	}
	pi.sendUserMessage(msg, { deliverAs: "followUp" });
}
