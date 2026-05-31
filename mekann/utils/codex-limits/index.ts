import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { truncateToWidth, type Component } from "@earendil-works/pi-tui";
import { featureValue } from "../../settings/featureConfig.js";
import { renderCodexFooter } from "./footer.js";
import { CodexUsageState, queryUsage, type CodexUsageReport } from "./usage.js";
import { formatCodexUsageFooterLines, formatCodexUsageReport, formatQueryErrors, type CodexUsageModel } from "./format.js";
export { normalizeAppServerResponse } from "./usage.js";
export { formatCodexUsageFooterLines, formatCodexUsageReport, formatCodexUsageStatusline } from "./format.js";

const CODEX_PROVIDER_ID = "openai-codex";
const DEFAULT_TIMEOUT_MS = 15_000;
const CACHE_TTL_MS = 60 * 1000;
const STATUS_KEY = "codex-usage";
const RESET_FOREGROUND = "\x1b[39m";

type QueryUsageOptions = {
	clearStatusline: boolean;
	refresh: boolean;
	statusline: boolean;
	timeoutMs: number;
};

export default function codexUsage(pi: ExtensionAPI): void {
	if (featureValue("codex-limits", "enabled") === false) return;

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
		const nextLines = formatCodexUsageFooterLines(report, options.model);
		if (!sameLines(usageStatusLines, nextLines)) {
			usageStatusLines = nextLines;
			updateUsageWidget(ctx);
		}
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

		const staleCached = usageState.getCachedReport();
		if (staleCached) {
			const staleLines = formatCodexUsageFooterLines(staleCached.report, model);
			if (!sameLines(usageStatusLines, staleLines)) {
				usageStatusLines = staleLines;
				updateUsageWidget(ctx);
			}
		} else {
			usageStatusLines = ["checking Codex usage"];
			updateUsageWidget(ctx);
		}
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

function sameLines(left: string[], right: string[]): boolean {
	return left.length === right.length && left.every((line, index) => line === right[index]);
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
