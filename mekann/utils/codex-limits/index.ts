import type { AssistantMessage } from "@earendil-works/pi-ai";
import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";
import { CodexUsageState, queryUsage, type CodexUsageReport } from "./usage.js";
import { formatCodexUsageFooterLines, formatCodexUsageReport, formatQueryErrors, type CodexUsageModel } from "./format.js";
export { normalizeAppServerResponse } from "./usage.js";
export { formatCodexUsageFooterLines, formatCodexUsageReport, formatCodexUsageStatusline } from "./format.js";

const CODEX_PROVIDER_ID = "openai-codex";
const DEFAULT_TIMEOUT_MS = 15_000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const STATUS_KEY = "codex-usage";
const RESET_FOREGROUND = "\x1b[39m";

type QueryUsageOptions = {
	clearStatusline: boolean;
	refresh: boolean;
	statusline: boolean;
	timeoutMs: number;
};

export default function codexUsage(pi: ExtensionAPI): void {
	const usageState = new CodexUsageState(CACHE_TTL_MS);
	let statuslineClearTimer: ReturnType<typeof setTimeout> | undefined;
	let statuslineRefreshTimer: ReturnType<typeof setTimeout> | undefined;
	let usageStatusLines: string[] = [];

	const updateUsageWidget = (ctx: ExtensionContext) => {
		ctx.ui.setWidget("codex-usage", undefined);
		pi.events.emit("mekann:codex-usage:status", { text: usageStatusLines[0] });
		if (usageStatusLines.length === 0) {
			ctx.ui.setFooter(undefined);
			return;
		}
		ctx.ui.setFooter((tui, theme, footerData) => {
			const unsub = footerData.onBranchChange(() => tui.requestRender());
			return {
				dispose: unsub,
				invalidate() {},
				render(width: number): string[] {
					return renderCodexFooter(ctx, footerData, theme, width, usageStatusLines[1], pi.getThinkingLevel());
				},
			} satisfies Component & { dispose(): void };
		});
	};

	const clearStatuslineTimers = () => {
		if (statuslineClearTimer) clearTimeout(statuslineClearTimer);
		if (statuslineRefreshTimer) clearTimeout(statuslineRefreshTimer);
		statuslineClearTimer = undefined;
		statuslineRefreshTimer = undefined;
	};

	const clearUsageStatusline = (ctx: ExtensionContext) => {
		usageState.invalidateRequests();
		clearStatuslineTimers();
		usageStatusLines = [];
		updateUsageWidget(ctx);
	};

	const scheduleTemporaryStatuslineClear = (ctx: ExtensionContext) => {
		if (statuslineClearTimer) clearTimeout(statuslineClearTimer);
		statuslineClearTimer = setTimeout(() => {
			usageStatusLines = [];
			updateUsageWidget(ctx);
			statuslineClearTimer = undefined;
		}, CACHE_TTL_MS);
		statuslineClearTimer.unref?.();
	};

	const scheduleStatuslineRefresh = (ctx: ExtensionContext) => {
		if (statuslineRefreshTimer) clearTimeout(statuslineRefreshTimer);
		statuslineRefreshTimer = setTimeout(() => {
			void refreshCurrentCodexUsageStatusline(ctx, true);
		}, CACHE_TTL_MS);
		statuslineRefreshTimer.unref?.();
	};

	const setUsageStatusline = (
		ctx: ExtensionContext,
		report: CodexUsageReport,
		options: { autoRefresh: boolean; model: CodexUsageModel | undefined },
	) => {
		if (statuslineClearTimer) clearTimeout(statuslineClearTimer);
		statuslineClearTimer = undefined;
		usageStatusLines = formatCodexUsageFooterLines(report, options.model);
		updateUsageWidget(ctx);
		if (options.autoRefresh) scheduleStatuslineRefresh(ctx);
		else scheduleTemporaryStatuslineClear(ctx);
	};

	const refreshCurrentCodexUsageStatusline = async (
		ctx: ExtensionContext,
		force: boolean,
		model = ctx.model,
	) => {
		if (!isOpenAICodexModel(model)) {
			clearUsageStatusline(ctx);
			return;
		}

		const requestId = usageState.nextRequestId();
		const cached = usageState.getFreshCachedReport();
		if (cached && !force) {
			setUsageStatusline(ctx, cached.report, { autoRefresh: true, model });
			return;
		}

		usageStatusLines = ["checking Codex usage"];
		updateUsageWidget(ctx);
		const result = await queryUsage(ctx, { timeoutMs: DEFAULT_TIMEOUT_MS });
		if (!usageState.isCurrentRequest(requestId)) return;
		if (!isOpenAICodexModel(ctx.model)) {
			clearUsageStatusline(ctx);
			return;
		}

		if (!result.ok) {
			const message = result.errors[0]?.message ?? "unknown error";
			usageStatusLines = [`Codex usage error: ${truncateToWidth(message, 100, "...")}`];
			updateUsageWidget(ctx);
			scheduleStatuslineRefresh(ctx);
			return;
		}

		usageState.storeReport(result.report);
		setUsageStatusline(ctx, result.report, { autoRefresh: true, model });
	};

	pi.registerCommand("codex-status", {
		description: "Show Codex ChatGPT subscription usage and rate-limit windows",
		handler: async (args, ctx) => {
			const options = parseArgs(args);
			if (!options.ok) {
				ctx.ui.notify(options.error, "warning");
				return;
			}

			if (options.value.clearStatusline) {
				clearUsageStatusline(ctx);
				ctx.ui.notify("Codex usage statusline cleared.", "info");
				return;
			}

			const cached = usageState.getFreshCachedReport();
			if (cached && !options.value.refresh) {
				if (options.value.statusline) {
					setUsageStatusline(ctx, cached.report, {
						autoRefresh: isOpenAICodexModel(ctx.model),
						model: ctx.model,
					});
				}
				showReport(ctx, cached.report, true);
				return;
			}

			let keepStatusline = false;
			if (options.value.statusline) {
				usageStatusLines = ["checking Codex usage"];
				updateUsageWidget(ctx);
			}
			try {
				const result = await queryUsage(ctx, options.value);
				if (!result.ok) {
					ctx.ui.notify(formatQueryErrors(result.errors), "error");
					return;
				}

				usageState.storeReport(result.report);
				if (options.value.statusline) {
					setUsageStatusline(ctx, result.report, {
						autoRefresh: isOpenAICodexModel(ctx.model),
						model: ctx.model,
					});
					keepStatusline = true;
				}
				showReport(ctx, result.report, false);
			} finally {
				if (options.value.statusline && !keepStatusline) {
					usageStatusLines = [];
					updateUsageWidget(ctx);
				}
			}
		},
	});

	pi.on("session_start", (_event, ctx) => {
		if (isOpenAICodexModel(ctx.model)) void refreshCurrentCodexUsageStatusline(ctx, false);
		else clearUsageStatusline(ctx);
	});

	pi.on("session_tree", (_event, ctx) => {
		if (isOpenAICodexModel(ctx.model)) void refreshCurrentCodexUsageStatusline(ctx, false);
		else clearUsageStatusline(ctx);
	});

	pi.on("model_select", (event, ctx) => {
		if (isOpenAICodexModel(event.model)) {
			void refreshCurrentCodexUsageStatusline(ctx, false, event.model);
		} else {
			clearUsageStatusline(ctx);
		}
	});

	pi.on("session_shutdown", (_event, ctx) => clearUsageStatusline(ctx));
}


function renderCodexFooter(
	ctx: ExtensionContext,
	footerData: {
		getGitBranch(): string | null;
		getAvailableProviderCount(): number;
	},
	theme: { fg(name: string, text: string): string },
	width: number,
	secondUsageLine: string | undefined,
	thinkingLevel: string | undefined,
): string[] {
	let pwd = ctx.sessionManager.getCwd();
	const home = process.env.HOME || process.env.USERPROFILE;
	if (home && pwd.startsWith(home)) pwd = `~${pwd.slice(home.length)}`;
	const branch = footerData.getGitBranch();
	if (branch) pwd = `${pwd} (${branch})`;
	const sessionName = ctx.sessionManager.getSessionName();
	if (sessionName) pwd = `${pwd} • ${sessionName}`;

	const pwdLine = alignFooterLeftRight(theme.fg("dim", pwd), secondUsageLine ? theme.fg("dim", secondUsageLine) : "", width, theme);
	return [pwdLine, renderDefaultStatsLine(ctx, footerData, theme, width, thinkingLevel)];
}

function renderDefaultStatsLine(
	ctx: ExtensionContext,
	footerData: { getAvailableProviderCount(): number },
	theme: { fg(name: string, text: string): string },
	width: number,
	thinkingLevel: string | undefined,
): string {
	let totalInput = 0;
	let totalOutput = 0;
	let totalCacheRead = 0;
	let totalCacheWrite = 0;
	let totalCost = 0;
	for (const entry of ctx.sessionManager.getEntries()) {
		if (entry.type !== "message" || entry.message.role !== "assistant") continue;
		const message = entry.message as AssistantMessage;
		totalInput += message.usage.input;
		totalOutput += message.usage.output;
		totalCacheRead += message.usage.cacheRead;
		totalCacheWrite += message.usage.cacheWrite;
		totalCost += message.usage.cost.total;
	}

	const statsParts: string[] = [];
	if (totalInput) statsParts.push(`↑${formatTokenCount(totalInput)}`);
	if (totalOutput) statsParts.push(`↓${formatTokenCount(totalOutput)}`);
	if (totalCacheRead) statsParts.push(`R${formatTokenCount(totalCacheRead)}`);
	if (totalCacheWrite) statsParts.push(`W${formatTokenCount(totalCacheWrite)}`);
	const usingSubscription = ctx.model ? ctx.modelRegistry.isUsingOAuth(ctx.model) : false;
	if (totalCost || usingSubscription) statsParts.push(`$${totalCost.toFixed(3)}${usingSubscription ? " (sub)" : ""}`);

	const contextUsage = ctx.getContextUsage();
	const contextWindow = contextUsage?.contextWindow ?? ctx.model?.contextWindow ?? 0;
	const contextPercentValue = contextUsage?.percent ?? 0;
	const contextPercent = contextUsage?.percent !== null && contextUsage?.percent !== undefined ? contextPercentValue.toFixed(1) : "?";
	const contextDisplay = contextPercent === "?" ? `?/${formatTokenCount(contextWindow)} (auto)` : `${contextPercent}%/${formatTokenCount(contextWindow)} (auto)`;
	if (contextPercentValue > 90) statsParts.push(theme.fg("error", contextDisplay));
	else if (contextPercentValue > 70) statsParts.push(theme.fg("warning", contextDisplay));
	else statsParts.push(contextDisplay);

	let statsLeft = statsParts.join(" ");
	let statsLeftWidth = visibleWidth(statsLeft);
	if (statsLeftWidth > width) {
		statsLeft = truncateToWidth(statsLeft, width, "...");
		statsLeftWidth = visibleWidth(statsLeft);
	}

	const modelName = ctx.model?.id || "no-model";
	let rightSideWithoutProvider = modelName;
	if (ctx.model?.reasoning) {
		const level = thinkingLevel || "off";
		rightSideWithoutProvider = level === "off" ? `${modelName} • thinking off` : `${modelName} • ${level}`;
	}
	let rightSide = rightSideWithoutProvider;
	if (footerData.getAvailableProviderCount() > 1 && ctx.model) {
		const withProvider = `(${ctx.model.provider}) ${rightSideWithoutProvider}`;
		if (statsLeftWidth + 2 + visibleWidth(withProvider) <= width) rightSide = withProvider;
	}

	const line = alignFooterLeftRight(statsLeft, rightSide, width, theme);
	return theme.fg("dim", line);
}

function alignFooterLeftRight(left: string, right: string, width: number, theme: { fg(name: string, text: string): string }): string {
	let leftText = left;
	let leftWidth = visibleWidth(leftText);
	if (leftWidth > width) {
		leftText = truncateToWidth(leftText, width, theme.fg("dim", "..."));
		leftWidth = visibleWidth(leftText);
	}
	if (!right) return truncateToWidth(leftText, width, theme.fg("dim", "..."));
	const availableForRight = width - leftWidth - 2;
	if (availableForRight <= 0) return leftText;
	const rightText = truncateToWidth(right, availableForRight, "");
	const padding = " ".repeat(Math.max(1, width - leftWidth - visibleWidth(rightText)));
	return leftText + padding + rightText;
}

function formatTokenCount(count: number): string {
	if (count < 1000) return count.toString();
	if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
	if (count < 1000000) return `${Math.round(count / 1000)}k`;
	if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
	return `${Math.round(count / 1000000)}M`;
}

export function parseArgs(
	args: string,
): { ok: true; value: QueryUsageOptions } | { ok: false; error: string } {
	const tokens = args.trim().split(/\s+/).filter(Boolean);
	let clearStatusline = false;
	let refresh = false;
	let statusline = true;
	let timeoutMs = DEFAULT_TIMEOUT_MS;

	for (let index = 0; index < tokens.length; index++) {
		const token = tokens[index];
		if (token === "--clear-statusline") {
			clearStatusline = true;
			continue;
		}
		if (token === "--no-statusline") {
			statusline = false;
			continue;
		}
		if (token === "--refresh") {
			refresh = true;
			continue;
		}
		if (token === "--timeout") {
			const rawValue = tokens[index + 1];
			if (!rawValue)
				return { ok: false, error: "Usage: /codex-status [--refresh] [--timeout seconds]" };
			const parsed = Number(rawValue);
			if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 120) {
				return { ok: false, error: "--timeout must be a number of seconds between 1 and 120." };
			}
			timeoutMs = Math.round(parsed * 1000);
			index += 1;
			continue;
		}
		return {
			ok: false,
			error: `Unknown option: ${token}. Usage: /codex-status [--refresh] [--no-statusline] [--clear-statusline] [--timeout seconds]`,
		};
	}

	return { ok: true, value: { clearStatusline, refresh, statusline, timeoutMs } };
}

function isOpenAICodexModel(model: Pick<CodexUsageModel, "provider"> | undefined): boolean {
	return model?.provider === CODEX_PROVIDER_ID;
}


function showReport(
	ctx: ExtensionCommandContext,
	report: CodexUsageReport,
	fromCache: boolean,
): void {
	const text = formatCodexUsageReport(
		report,
		fromCache ? Date.now() - report.capturedAt : undefined,
	);
	ctx.ui.notify(ctx.hasUI ? brightenInfoNotification(text) : text, "info");
}

function brightenInfoNotification(text: string): string {
	return `${RESET_FOREGROUND}${text}`;
}
