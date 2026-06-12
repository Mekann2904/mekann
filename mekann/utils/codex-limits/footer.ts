import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

export function renderCodexFooter(
	ctx: ExtensionContext,
	footerData: {
		getGitBranch(): string | null;
		getAvailableProviderCount(): number;
	},
	theme: { fg(name: string, text: string): string },
	width: number,
	usageLine: string | undefined,
	thinkingLevel: string | undefined,
): string[] {
	let pwd = ctx.sessionManager.getCwd();
	const home = process.env.HOME || process.env.USERPROFILE;
	if (home && pwd.startsWith(home)) pwd = `~${pwd.slice(home.length)}`;
	const branch = footerData.getGitBranch();
	if (branch) pwd = `${pwd} (${branch})`;
	const sessionName = ctx.sessionManager.getSessionName();
	if (sessionName) pwd = `${pwd} • ${sessionName}`;

	const pwdLine = alignFooterLeftRight(theme.fg("dim", pwd), usageLine ? theme.fg("dim", usageLine) : "", width, theme);
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
