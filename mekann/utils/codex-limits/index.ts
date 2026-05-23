import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { createInterface } from "node:readline";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";

const CODEX_PROVIDER_ID = "openai-codex";
const DEFAULT_TIMEOUT_MS = 15_000;
const CODEX_BIN_ENV = "CODEX_BIN";
const CACHE_TTL_MS = 5 * 60 * 1000;
const STATUS_KEY = "codex-usage";
const USAGE_SETTINGS_URL = "https://chatgpt.com/codex/settings/usage";
const BAR_SEGMENTS = 24;
const LIMIT_VALUE_COLUMN = 12;
const MAX_ERROR_BODY_CHARS = 600;
const RESET_FOREGROUND = "\x1b[39m";

type UsageSource = "codex-app-server";
type PiModel = NonNullable<ExtensionContext["model"]>;
export type CodexUsageModel = Pick<PiModel, "id" | "name" | "provider">;

type QueryUsageOptions = {
	clearStatusline: boolean;
	refresh: boolean;
	statusline: boolean;
	timeoutMs: number;
};

type CachedReport = {
	createdAt: number;
	report: CodexUsageReport;
};

type QueryUsageResult =
	| { ok: true; report: CodexUsageReport }
	| { ok: false; errors: UsageQueryError[] };

type UsageQueryError = {
	source: UsageSource;
	message: string;
	cause?: unknown;
};

export type CodexUsageReport = {
	source: UsageSource;
	capturedAt: number;
	planType?: string;
	snapshots: NormalizedRateLimitSnapshot[];
};

export type NormalizedRateLimitSnapshot = {
	limitId: string;
	limitName?: string;
	primary?: NormalizedRateLimitWindow;
	secondary?: NormalizedRateLimitWindow;
	credits?: NormalizedCredits;
};

export type NormalizedRateLimitWindow = {
	usedPercent: number;
	windowMinutes?: number;
	resetsAt?: number;
};

export type NormalizedCredits = {
	hasCredits: boolean;
	unlimited: boolean;
	balance?: string;
};

type AppServerRateLimitResponse = {
	rateLimits?: unknown;
	rateLimitsByLimitId?: unknown;
};

type AppServerRateLimitSnapshot = {
	limitId?: unknown;
	limitName?: unknown;
	primary?: unknown;
	secondary?: unknown;
	credits?: unknown;
	planType?: unknown;
};

type AppServerWindowSnapshot = {
	usedPercent?: unknown;
	windowDurationMins?: unknown;
	resetsAt?: unknown;
};

type AppServerCreditsSnapshot = {
	hasCredits?: unknown;
	unlimited?: unknown;
	balance?: unknown;
};

type RpcResponse = {
	id?: unknown;
	result?: unknown;
	error?: { message?: unknown; code?: unknown };
};

type PendingRpc = {
	resolve: (value: unknown) => void;
	reject: (error: Error) => void;
};

type ServerRequestHandler = (method: string, params: unknown) => Promise<unknown> | unknown;

export default function codexUsage(pi: ExtensionAPI): void {
	let cache: CachedReport | undefined;
	let statuslineClearTimer: ReturnType<typeof setTimeout> | undefined;
	let statuslineRefreshTimer: ReturnType<typeof setTimeout> | undefined;
	let statuslineRequestId = 0;
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
		statuslineRequestId += 1;
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

		const requestId = statuslineRequestId + 1;
		statuslineRequestId = requestId;
		const cached = cache && Date.now() - cache.createdAt < CACHE_TTL_MS ? cache : undefined;
		if (cached && !force) {
			setUsageStatusline(ctx, cached.report, { autoRefresh: true, model });
			return;
		}

		usageStatusLines = ["checking Codex usage"];
		updateUsageWidget(ctx);
		const result = await queryUsage(ctx, { timeoutMs: DEFAULT_TIMEOUT_MS });
		if (requestId !== statuslineRequestId) return;
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

		cache = { createdAt: Date.now(), report: result.report };
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

			const cached = cache && Date.now() - cache.createdAt < CACHE_TTL_MS ? cache : undefined;
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

				cache = { createdAt: Date.now(), report: result.report };
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

function isOpenAICodexModel(model: Pick<PiModel, "provider"> | undefined): boolean {
	return model?.provider === CODEX_PROVIDER_ID;
}

async function queryUsage(
	ctx: ExtensionContext,
	options: Pick<QueryUsageOptions, "timeoutMs">,
): Promise<QueryUsageResult> {
	const errors: UsageQueryError[] = [];

	try {
		const report = await queryViaCodexAppServerWithPiAuth(ctx, options.timeoutMs);
		return { ok: true, report };
	} catch (cause) {
		errors.push({ source: "codex-app-server", message: `Pi auth: ${errorMessage(cause)}`, cause });
	}

	try {
		const report = await queryViaCodexAppServerCliAuth(options.timeoutMs);
		return { ok: true, report };
	} catch (cause) {
		errors.push({ source: "codex-app-server", message: `Codex CLI auth: ${errorMessage(cause)}`, cause });
	}

	return { ok: false, errors };
}

async function queryViaCodexAppServerWithPiAuth(ctx: ExtensionContext, timeoutMs: number): Promise<CodexUsageReport> {
	const client = new CodexAppServerClient(timeoutMs);
	try {
		const auth = await resolvePiCodexAuth(ctx);
		client.onServerRequest(async (method) => {
			if (method !== "account/chatgptAuthTokens/refresh") {
				throw new Error(`Unsupported Codex app-server request: ${method}`);
			}
			const refreshed = await resolvePiCodexAuth(ctx);
			return { accessToken: refreshed.accessToken, chatgptAccountId: refreshed.accountId };
		});
		await client.start();
		await client.request("initialize", {
			clientInfo: {
				name: "pi_codex_usage",
				title: "Pi Codex Usage",
				version: "0.1.0",
			},
			capabilities: {
				experimentalApi: true,
				optOutNotificationMethods: [],
			},
		});
		client.notify("initialized");
		await client.request("account/login/start", {
			type: "chatgptAuthTokens",
			accessToken: auth.accessToken,
			chatgptAccountId: auth.accountId,
		});
		const result = await client.request("account/rateLimits/read", {});
		return normalizeAppServerResponse(
			assertObject(result, "account/rateLimits/read result") as AppServerRateLimitResponse,
			Date.now(),
		);
	} finally {
		client.dispose();
	}
}

async function queryViaCodexAppServerCliAuth(timeoutMs: number): Promise<CodexUsageReport> {
	const client = new CodexAppServerClient(timeoutMs);
	try {
		await client.start();
		await client.request("initialize", {
			clientInfo: {
				name: "pi_codex_usage",
				title: "Pi Codex Usage",
				version: "0.1.0",
			},
		});
		client.notify("initialized");
		await assertChatGptAccount(client);
		const result = await client.request("account/rateLimits/read", {});
		return normalizeAppServerResponse(
			assertObject(result, "account/rateLimits/read result") as AppServerRateLimitResponse,
			Date.now(),
		);
	} finally {
		client.dispose();
	}
}

async function resolvePiCodexAuth(ctx: ExtensionContext): Promise<{ accessToken: string; accountId: string }> {
	const accessToken = await ctx.modelRegistry.getApiKeyForProvider(CODEX_PROVIDER_ID);
	if (!accessToken) {
		throw new Error("Pi is not logged in to openai-codex. Run Pi /login for OpenAI Codex.");
	}
	const accountId = extractChatGptAccountId(accessToken);
	if (!accountId) {
		throw new Error("Pi openai-codex token does not contain chatgpt_account_id.");
	}
	return { accessToken, accountId };
}

function extractChatGptAccountId(token: string): string | undefined {
	try {
		const [, payload] = token.split(".");
		if (!payload) return undefined;
		const json = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
		const auth = json["https://api.openai.com/auth"];
		if (!auth || typeof auth !== "object") return undefined;
		const accountId = (auth as { chatgpt_account_id?: unknown }).chatgpt_account_id;
		return typeof accountId === "string" && accountId.length > 0 ? accountId : undefined;
	} catch {
		return undefined;
	}
}

async function assertChatGptAccount(client: CodexAppServerClient): Promise<void> {
	const accountResult = assertObject(
		await client.request("account/read", { refreshToken: true }),
		"account/read result",
	);
	const account = accountResult.account;
	if (!account || typeof account !== "object" || Array.isArray(account)) {
		throw new Error("Codex CLI is not logged in. Run `codex login` with ChatGPT.");
	}
	const accountType = (account as { type?: unknown }).type;
	if (accountType === "apiKey") {
		throw new Error(
			"Codex CLI is logged in with an API key. ChatGPT subscription rate limits require ChatGPT login. Run `codex logout` then `codex login` with ChatGPT.",
		);
	}
	if (accountType !== "chatgpt" && accountType !== "chatgptAuthTokens") {
		throw new Error(
			`Unsupported Codex auth mode: ${String(accountType)}. Expected chatgpt or chatgptAuthTokens.`,
		);
	}
}

class CodexAppServerClient {
	private child?: ChildProcessWithoutNullStreams;
	private nextId = 1;
	private stderr = "";
	private readonly pending = new Map<number, PendingRpc>();
	private startPromise?: Promise<void>;
	private exitError?: Error;
	private serverRequestHandler?: ServerRequestHandler;
	private readonly timeoutMs: number;

	constructor(timeoutMs: number) {
		this.timeoutMs = timeoutMs;
	}

	onServerRequest(handler: ServerRequestHandler): void {
		this.serverRequestHandler = handler;
	}

	start(): Promise<void> {
		if (this.startPromise) return this.startPromise;

		this.startPromise = new Promise((resolve, reject) => {
			const codexBin = process.env[CODEX_BIN_ENV] || "codex";
			const child = spawn(codexBin, ["app-server", "--listen", "stdio://"], {
				stdio: ["pipe", "pipe", "pipe"],
			});
			this.child = child;

			const startupTimeout = setTimeout(() => {
				reject(
					new Error(
						`Timed out after ${Math.round(this.timeoutMs / 1000)}s starting codex app-server.`,
					),
				);
			}, this.timeoutMs);

			child.once("spawn", () => {
				clearTimeout(startupTimeout);
				resolve();
			});

			child.once("error", (error) => {
				clearTimeout(startupTimeout);
				reject(new Error(`Failed to start codex app-server (${codexBin}). Set ${CODEX_BIN_ENV} if codex is not on PATH: ${error.message}`));
				this.rejectAll(error);
			});

			child.once("exit", (code, signal) => {
				const suffix = this.stderr ? ` stderr: ${redactErrorBody(this.stderr)}` : "";
				this.exitError = new Error(
					`codex app-server exited before completing the request (code ${code ?? "unknown"}, signal ${signal ?? "none"}).${suffix}`,
				);
				this.rejectAll(this.exitError);
			});

			child.stderr.setEncoding("utf8");
			child.stderr.on("data", (chunk) => {
				this.stderr = truncateEnd(this.stderr + String(chunk), MAX_ERROR_BODY_CHARS);
			});

			const lines = createInterface({ input: child.stdout });
			lines.on("line", (line) => {
				void this.handleLine(line);
			});
		});

		return this.startPromise;
	}

	request(method: string, params: unknown): Promise<unknown> {
		const child = this.child;
		if (!child?.stdin.writable) {
			throw new Error("codex app-server is not running.");
		}
		if (this.exitError) throw this.exitError;

		const id = this.nextId++;
		const payload = params === undefined ? { method, id } : { method, id, params };
		const response = new Promise<unknown>((resolve, reject) => {
			const timeout = setTimeout(() => {
				this.pending.delete(id);
				reject(
					new Error(`Timed out after ${Math.round(this.timeoutMs / 1000)}s waiting for ${method}.`),
				);
			}, this.timeoutMs);

			this.pending.set(id, {
				resolve: (value) => {
					clearTimeout(timeout);
					resolve(value);
				},
				reject: (error) => {
					clearTimeout(timeout);
					reject(error);
				},
			});
		});

		this.write(payload);
		return response;
	}

	notify(method: string, params: unknown = {}): void {
		const child = this.child;
		if (!child?.stdin.writable) return;
		this.write({ method, params });
	}

	dispose(): void {
		for (const [id, pending] of this.pending) {
			pending.reject(new Error(`codex app-server request ${id} cancelled.`));
		}
		this.pending.clear();

		const child = this.child;
		if (!child) return;
		child.stdin.end();
		if (!child.killed) child.kill();
		this.child = undefined;
	}

	private async handleLine(line: string): Promise<void> {
		let parsed: RpcResponse & { method?: unknown; params?: unknown };
		try {
			parsed = JSON.parse(line) as RpcResponse;
		} catch {
			return;
		}

		if (typeof parsed.id !== "number") return;
		if (typeof parsed.method === "string" && parsed.result === undefined && parsed.error === undefined) {
			try {
				const result = this.serverRequestHandler ? await this.serverRequestHandler(parsed.method, parsed.params) : {};
				this.write({ id: parsed.id, result });
			} catch (error) {
				this.write({ id: parsed.id, error: { message: errorMessage(error) } });
			}
			return;
		}
		const pending = this.pending.get(parsed.id);
		if (!pending) return;
		this.pending.delete(parsed.id);

		if (parsed.error) {
			const message =
				typeof parsed.error.message === "string" ? parsed.error.message : "unknown error";
			pending.reject(new Error(`codex app-server request failed: ${message}`));
			return;
		}

		pending.resolve(parsed.result);
	}

	private write(value: unknown): void {
		const child = this.child;
		if (!child?.stdin.writable) return;
		child.stdin.write(`${JSON.stringify(value)}\n`);
	}

	private rejectAll(error: Error): void {
		for (const pending of this.pending.values()) pending.reject(error);
		this.pending.clear();
	}
}

export function normalizeAppServerResponse(
	response: AppServerRateLimitResponse,
	capturedAt: number,
): CodexUsageReport {
	const snapshots: NormalizedRateLimitSnapshot[] = [];
	const addSnapshot = (raw: unknown, fallbackId: string) => {
		const snapshot = normalizeAppServerSnapshot(raw, fallbackId);
		if (!snapshot) return;
		const existingIndex = snapshots.findIndex((item) => item.limitId === snapshot.limitId);
		if (existingIndex >= 0)
			snapshots[existingIndex] = mergeSnapshot(snapshots[existingIndex], snapshot);
		else snapshots.push(snapshot);
	};

	addSnapshot(response.rateLimits, "codex");
	if (response.rateLimitsByLimitId && typeof response.rateLimitsByLimitId === "object") {
		for (const [limitId, raw] of Object.entries(response.rateLimitsByLimitId)) {
			addSnapshot(raw, limitId);
		}
	}

	if (snapshots.length === 0) {
		throw new Error("codex app-server returned no displayable rate-limit windows.");
	}

	const planType = asAppServerPlanType(response.rateLimits);
	return { source: "codex-app-server", capturedAt, planType, snapshots };
}

function asAppServerPlanType(raw: unknown): string | undefined {
	if (raw === null || raw === undefined) return undefined;
	const snapshot = assertObject(
		raw,
		"app-server rate-limit snapshot",
	) as AppServerRateLimitSnapshot;
	return asString(snapshot.planType);
}

function normalizeAppServerSnapshot(
	raw: unknown,
	fallbackId: string,
): NormalizedRateLimitSnapshot | undefined {
	if (raw === null || raw === undefined) return undefined;
	const snapshot = assertObject(
		raw,
		"app-server rate-limit snapshot",
	) as AppServerRateLimitSnapshot;
	const limitId = asString(snapshot.limitId) ?? fallbackId;
	const limitName = asString(snapshot.limitName);
	const primary = normalizeAppServerWindow(snapshot.primary);
	const secondary = normalizeAppServerWindow(snapshot.secondary);
	const credits = normalizeAppServerCredits(snapshot.credits);
	if (!primary && !secondary && !credits) return undefined;
	return { limitId, limitName, primary, secondary, credits };
}

function normalizeAppServerWindow(value: unknown): NormalizedRateLimitWindow | undefined {
	if (value === null || value === undefined) return undefined;
	const window = assertObject(value, "app-server rate-limit window") as AppServerWindowSnapshot;
	const usedPercent = asNumber(window.usedPercent);
	if (usedPercent === undefined) return undefined;
	return {
		usedPercent,
		windowMinutes: asNumber(window.windowDurationMins),
		resetsAt: asNumber(window.resetsAt),
	};
}

function normalizeAppServerCredits(value: unknown): NormalizedCredits | undefined {
	if (value === null || value === undefined) return undefined;
	const credits = assertObject(value, "app-server credits") as AppServerCreditsSnapshot;
	const hasCredits = asBoolean(credits.hasCredits);
	const unlimited = asBoolean(credits.unlimited);
	if (hasCredits === undefined || unlimited === undefined) return undefined;
	return { hasCredits, unlimited, balance: asString(credits.balance) };
}

function mergeSnapshot(
	left: NormalizedRateLimitSnapshot,
	right: NormalizedRateLimitSnapshot,
): NormalizedRateLimitSnapshot {
	return {
		limitId: right.limitId || left.limitId,
		limitName: right.limitName ?? left.limitName,
		primary: right.primary ?? left.primary,
		secondary: right.secondary ?? left.secondary,
		credits: right.credits ?? left.credits,
	};
}

export function formatCodexUsageReport(report: CodexUsageReport, _cacheAgeMs?: number): string {
	const lines = [
		"Codex 使用状況",
		`更新時刻: ${formatCapturedAt(report.capturedAt)}`,
		`詳細: ${USAGE_SETTINGS_URL}`,
		"",
	];

	for (const snapshot of report.snapshots) {
		const label = snapshot.limitName ?? snapshot.limitId;
		if (!isPrimaryCodexSnapshot(snapshot)) {
			lines.push(`${label}:`);
		}
		if (snapshot.primary) lines.push(formatWindowLine("5時間制限:", snapshot.primary, true));
		if (snapshot.secondary) lines.push(formatWindowLine("週制限:", snapshot.secondary, true));
		if (!snapshot.primary && !snapshot.secondary) {
			lines.push("このアカウントの制限情報は表示できません。");
		}
	}

	return lines.join("\n");
}

export function formatCodexUsageStatusline(
	report: CodexUsageReport,
	model?: CodexUsageModel,
): string {
	return formatCodexUsageFooterLines(report, model).join(" ");
}

export function formatCodexUsageFooterLines(
	report: CodexUsageReport,
	model?: CodexUsageModel,
): string[] {
	const snapshot = selectSnapshotForModel(report, model);
	if (!snapshot) return ["usage unavailable"];
	const lines: string[] = [];
	if (snapshot.primary) lines.push(formatCompactWindow("5h", snapshot.primary));
	if (snapshot.secondary) lines.push(formatCompactWindow("wk", snapshot.secondary));
	if (lines.length === 0 && snapshot.credits) lines.push(formatCredits(snapshot.credits));
	return lines.length > 0 ? lines : ["Limits unavailable for this account"];
}

function selectSnapshotForModel(
	report: CodexUsageReport,
	model: CodexUsageModel | undefined,
): NormalizedRateLimitSnapshot | undefined {
	const codexSnapshot = report.snapshots.find(isPrimaryCodexSnapshot);
	if (!model || !isOpenAICodexModel(model)) return codexSnapshot ?? report.snapshots[0];

	const modelKeys = normalizedModelUsageKeys(model);
	const exactMatch = report.snapshots.find((snapshot) =>
		!isPrimaryCodexSnapshot(snapshot) &&
		normalizedSnapshotUsageKeys(snapshot).some((key) => modelKeys.has(key)),
	);
	if (exactMatch) return exactMatch;

	const variants = codexModelVariantKeys(modelKeys);
	for (const variant of variants) {
		const matches = report.snapshots.filter(
			(snapshot) =>
				!isPrimaryCodexSnapshot(snapshot) &&
				normalizedSnapshotUsageKeys(snapshot).some((key) => normalizedKeyHasToken(key, variant)),
		);
		if (matches.length === 1) return matches[0];
	}

	return codexSnapshot ?? report.snapshots[0];
}

function normalizedModelUsageKeys(model: CodexUsageModel): Set<string> {
	const keys = new Set<string>();
	addNormalizedUsageKey(keys, model.id);
	addNormalizedUsageKey(keys, model.name);

	for (const key of [...keys]) {
		const codexIndex = key.indexOf("codex");
		if (codexIndex >= 0) keys.add(key.slice(codexIndex));
	}

	return keys;
}

function normalizedSnapshotUsageKeys(snapshot: NormalizedRateLimitSnapshot): string[] {
	return [normalizedUsageKey(snapshot.limitId), normalizedUsageKey(snapshot.limitName)].filter(
		(key): key is string => key !== undefined,
	);
}

function addNormalizedUsageKey(keys: Set<string>, value: string | undefined): void {
	const key = normalizedUsageKey(value);
	if (key) keys.add(key);
}

function normalizedUsageKey(value: string | undefined): string | undefined {
	const key = value
		?.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return key || undefined;
}

function codexModelVariantKeys(modelKeys: Set<string>): string[] {
	const variants = new Set<string>();
	for (const key of modelKeys) {
		const match = key.match(/(?:^|-)codex-(.+)$/);
		if (match?.[1]) variants.add(match[1]);
	}
	return [...variants];
}

function normalizedKeyHasToken(key: string, token: string): boolean {
	return (
		key === token ||
		key.startsWith(`${token}-`) ||
		key.endsWith(`-${token}`) ||
		key.includes(`-${token}-`)
	);
}

function formatStatuslinePrefix(snapshot: NormalizedRateLimitSnapshot): string {
	if (isPrimaryCodexSnapshot(snapshot)) return "codex";
	const label = snapshot.limitName ?? snapshot.limitId;
	return `codex ${compactLimitLabel(label)}`;
}

function compactLimitLabel(label: string): string {
	const normalized = label.replace(/[_-]+/g, " ").trim();
	const codexVariant = normalized.match(/\bcodex\s+(.+)$/i)?.[1]?.trim();
	const compact = codexVariant || normalized;
	return compact.toLowerCase().replace(/\s+/g, " ");
}

function formatRemainingPercent(window: NormalizedRateLimitWindow): string {
	return `${(100 - clampPercent(window.usedPercent)).toFixed(0)}%`;
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

function isPrimaryCodexSnapshot(snapshot: NormalizedRateLimitSnapshot): boolean {
	return (
		normalizedUsageKey(snapshot.limitId) === "codex" ||
		normalizedUsageKey(snapshot.limitName) === "codex"
	);
}

function formatWindowLine(label: string, window: NormalizedRateLimitWindow, includeReset = false): string {
	const remaining = 100 - clampPercent(window.usedPercent);
	const reset = includeReset && window.resetsAt ? `  更新 ${formatResetDateTime(window.resetsAt)}` : "";
	return `${label.padEnd(LIMIT_VALUE_COLUMN)}${progressBar(remaining)} ${remaining.toFixed(0).padStart(3)}%${reset}`;
}

function formatWindow(window: NormalizedRateLimitWindow, includeReset = false): string {
	const remaining = 100 - clampPercent(window.usedPercent);
	const reset = includeReset && window.resetsAt ? `  更新 ${formatResetDateTime(window.resetsAt)}` : "";
	return `${progressBar(remaining)} ${remaining.toFixed(0).padStart(3)}%${reset}`;
}

function formatCompactWindow(label: string, window: NormalizedRateLimitWindow): string {
	const remaining = 100 - clampPercent(window.usedPercent);
	return `${label} ${progressBar(remaining)} ${remaining.toFixed(0).padStart(3)}%`;
}

function progressBar(percentRemaining: number): string {
	const filled = Math.round((clampPercent(percentRemaining) / 100) * BAR_SEGMENTS);
	return `[${"█".repeat(filled)}${"░".repeat(BAR_SEGMENTS - filled)}]`;
}

function formatCredits(credits: NormalizedCredits): string {
	if (!credits.hasCredits) return "no credits";
	if (credits.unlimited) return "unlimited credits";
	const balance = credits.balance?.trim();
	if (!balance) return "credits available";
	return `${formatNumber(Number(balance), balance)} credits`;
}

function formatReset(epochSeconds: number): string {
	const reset = new Date(epochSeconds * 1000);
	if (Number.isNaN(reset.getTime())) return "at an unknown time";

	const now = new Date();
	const time = `${reset.getHours().toString().padStart(2, "0")}:${reset
		.getMinutes()
		.toString()
		.padStart(2, "0")}`;
	if (reset.toDateString() === now.toDateString()) return time;
	const day = reset.getDate().toString();
	const month = reset.toLocaleDateString(undefined, { month: "short" });
	return `${time} on ${day} ${month}`;
}

function formatCapturedAt(epochMs: number): string {
	return formatDateTime(new Date(epochMs));
}

function formatResetDateTime(epochSeconds: number): string {
	return formatDateTime(new Date(epochSeconds * 1000));
}

function formatDateTime(date: Date): string {
	if (Number.isNaN(date.getTime())) return "不明";
	return date.toLocaleString("ja-JP", {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
}

function formatQueryErrors(errors: UsageQueryError[]): string {
	const lines = ["Unable to read Codex usage."];
	for (const error of errors) {
		lines.push(`- Codex app-server: ${error.message}`);
	}
	lines.push("");
	lines.push(
		"Tip: install Codex CLI and run codex login, then retry /codex-status.",
	);
	return lines.join("\n");
}

function formatNumber(value: number, fallback: string): string {
	if (!Number.isFinite(value)) return fallback;
	return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

function clampPercent(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.min(100, Math.max(0, value));
}

function assertObject(value: unknown, description: string): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`${description} was not an object.`);
	}
	return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim()) {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : undefined;
	}
	return undefined;
}

function asBoolean(value: unknown): boolean | undefined {
	return typeof value === "boolean" ? value : undefined;
}


function redactErrorBody(body: string): string {
	return truncateEnd(
		body
			.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer <redacted>")
			.replace(/"access_token"\s*:\s*"[^"]+"/gi, '"access_token":"<redacted>"')
			.trim(),
		MAX_ERROR_BODY_CHARS,
	);
}

function truncateEnd(value: string, maxChars: number): string {
	if (value.length <= maxChars) return value;
	return `${value.slice(0, maxChars - 1)}…`;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
