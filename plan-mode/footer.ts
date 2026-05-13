/**
 * Plan Mode — カスタムフッター
 *
 * 拡張機能のフッター描画を提供する。
 * piデフォルトのpwd・トークン統計に加え、plan/mainモデル情報を表示。
 */

import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { ModeState } from "./state.js";

// --- フッター ---

export interface FooterHandle {
	requestRender: () => void;
}

export function installFooter(ctx: ExtensionContext, state: ModeState): FooterHandle {
	let requestRenderFn: (() => void) | null = null;

	ctx.ui.setFooter((tui, theme, footerData) => {
		requestRenderFn = () => tui.requestRender();
		const unsub = footerData.onBranchChange(() => tui.requestRender());

		return {
		dispose() { unsub(); requestRenderFn = null; },
			invalidate() {},
			render(width: number): string[] {
				// --- piデフォルト: pwd行 ---
				let pwd = ctx.sessionManager.getCwd();
				const home = process.env.HOME || process.env.USERPROFILE;
				if (home && pwd.startsWith(home)) pwd = `~${pwd.slice(home.length)}`;
				const branch = footerData.getGitBranch();
				if (branch) pwd = `${pwd} (${branch})`;
				const sessionName = ctx.sessionManager.getSessionName();
				if (sessionName) pwd = `${pwd} • ${sessionName}`;

				// --- piデフォルト: トークン統計 ---
				let totalInput = 0, totalOutput = 0, totalCacheRead = 0, totalCacheWrite = 0, totalCost = 0;
				for (const entry of ctx.sessionManager.getBranch()) {
					if (entry.type === "message" && entry.message.role === "assistant") {
						const m = entry.message as AssistantMessage;
						totalInput += m.usage?.input ?? 0;
						totalOutput += m.usage?.output ?? 0;
						totalCacheRead += m.usage?.cacheRead ?? 0;
						totalCacheWrite += m.usage?.cacheWrite ?? 0;
						totalCost += m.usage?.cost?.total ?? 0;
					}
				}

				const fmt = (n: number) => {
					if (n < 1000) return `${n}`;
					if (n < 10000) return `${(n / 1000).toFixed(1)}k`;
					if (n < 1000000) return `${Math.round(n / 1000)}k`;
					if (n < 10000000) return `${(n / 1000000).toFixed(1)}M`;
					return `${Math.round(n / 1000000)}M`;
				};

				const statsParts: string[] = [];
				if (totalInput) statsParts.push(`↑${fmt(totalInput)}`);
				if (totalOutput) statsParts.push(`↓${fmt(totalOutput)}`);
				if (totalCacheRead) statsParts.push(`R${fmt(totalCacheRead)}`);
				if (totalCacheWrite) statsParts.push(`W${fmt(totalCacheWrite)}`);
				const usingSub = ctx.model ? ctx.modelRegistry.isUsingOAuth(ctx.model) : false;
				if (totalCost || usingSub) statsParts.push(`$${totalCost.toFixed(3)}${usingSub ? " (sub)" : ""}`);

				// コンテキスト使用率（公式 API 使用）
				const contextUsage = ctx.getContextUsage();
				const contextWindow = contextUsage?.contextWindow ?? ctx.model?.contextWindow ?? 0;
				const contextPct = contextUsage?.percent ?? 0;
				// != null で null と undefined の両方を判定
				const isContextKnown = contextUsage?.percent != null;
				const contextStr = isContextKnown ? `${contextPct.toFixed(1)}%` : "?";
				const contextDisplay = `${contextStr}/${fmt(contextWindow)}`;
				if (!isContextKnown) {
					statsParts.push(contextDisplay);
				} else if (contextPct > 90) {
					statsParts.push(theme.fg("error", contextDisplay));
				} else if (contextPct > 70) {
					statsParts.push(theme.fg("warning", contextDisplay));
				} else {
					statsParts.push(contextDisplay);
				}

				const statsLeft = statsParts.join(" ");

				// --- plan/mainモデル表示（右側2段） ---

				let planProvider = "?", planModelId = "未設定";
				if (state.planModel) {
					planProvider = state.planModel.provider;
					planModelId = state.planModel.modelId;
				} else if (ctx.model) {
					planProvider = ctx.model.provider;
					planModelId = ctx.model.id;
				}
				const planThinking = state.planThinkingLevel ?? "off";
				const planLabel = `(${planProvider}) ${planModelId} · ${planThinking}`;

				let mainProvider = "?", mainModelId = "未設定";
				if (state.originalModel) {
					mainProvider = state.originalModel.provider;
					mainModelId = state.originalModel.id;
				} else if (ctx.model) {
					mainProvider = ctx.model.provider;
					mainModelId = ctx.model.id;
				}
				const mainThinking = state.originalThinkingLevel ?? "off";
				const mainLabel = `(${mainProvider}) ${mainModelId} · ${mainThinking}`;

				let planText: string;
				if (state.planModeEnabled) {
					planText = theme.fg("warning", `${planLabel} (plan)`);
				} else {
					planText = theme.fg("dim", `${planLabel} (plan)`);
				}

				let mainText: string;
				if (state.planModeEnabled) {
					mainText = theme.fg("dim", `${mainLabel} (main)`);
				} else {
					mainText = theme.fg("warning", `${mainLabel} (main)`);
				}

				// --- 行1: pwd行 ---
				const line1 = truncateToWidth(theme.fg("dim", pwd), width, theme.fg("dim", "..."));

				// --- 行2: stats行 左=トークン統計 右=planモデル ---
				const statsLeftWidth = visibleWidth(statsLeft);
				const planWidth = visibleWidth(planText);
				const minPad = 2;

				let line2: string;
				if (statsLeftWidth + minPad + planWidth <= width) {
					const pad = " ".repeat(width - statsLeftWidth - planWidth);
					line2 = theme.fg("dim", statsLeft) + pad + planText;
				} else {
					const avail = Math.max(0, width - statsLeftWidth - minPad);
					const truncPlan = truncateToWidth(planText, avail, "");
					const pad = " ".repeat(Math.max(0, width - statsLeftWidth - visibleWidth(truncPlan)));
					line2 = theme.fg("dim", statsLeft) + pad + truncPlan;
				}

				// --- 行3: 左=他拡張ステータス 右=mainモデル ---
				const extStatuses = footerData.getExtensionStatuses();
				let extText = "";
				if (extStatuses.size > 0) {
					extText = Array.from(extStatuses.entries())
						.sort(([a], [b]) => a.localeCompare(b))
						.map(([, text]) => text.replace(/[\r\n\t]/g, " ").replace(/ +/g, " ").trim())
						.join(" ");
				}
				const extWidth = visibleWidth(extText);
				const mainWidth = visibleWidth(mainText);

				let line3: string;
				if (extWidth + minPad + mainWidth <= width) {
					const pad = " ".repeat(Math.max(0, width - extWidth - mainWidth));
					line3 = extText + pad + mainText;
				} else {
					const avail = Math.max(0, width - mainWidth - minPad);
					const truncExt = truncateToWidth(extText, avail, theme.fg("dim", "..."));
					const pad = " ".repeat(Math.max(0, width - visibleWidth(truncExt) - mainWidth));
					line3 = truncExt + pad + mainText;
				}

				return [line1, line2, line3];
			},
		};
	});

	return {
		requestRender: () => { if (requestRenderFn) requestRenderFn(); },
	};
}
