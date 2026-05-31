import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { createInterface } from "node:readline";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { resolveCodexAccountSession } from "../codex-shared/index.js";

const CODEX_PROVIDER_ID = "openai-codex";
const CODEX_BIN_ENV = "CODEX_BIN";
const MAX_ERROR_BODY_CHARS = 600;

type UsageSource = "codex-app-server";

export type UsageQueryResult =
	| { ok: true; report: CodexUsageReport }
	| { ok: false; errors: UsageQueryError[] };

export type UsageQueryError = {
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

export type CachedCodexUsageReport = {
	createdAt: number;
	report: CodexUsageReport;
};

export class CodexUsageState {
	private cache: CachedCodexUsageReport | undefined;
	private requestId = 0;

	constructor(private readonly cacheTtlMs: number) {}

	getCachedReport(): CachedCodexUsageReport | undefined {
		return this.cache;
	}

	getFreshCachedReport(now = Date.now()): CachedCodexUsageReport | undefined {
		return this.cache && now - this.cache.createdAt < this.cacheTtlMs ? this.cache : undefined;
	}

	storeReport(report: CodexUsageReport, now = Date.now()): CachedCodexUsageReport {
		this.cache = { createdAt: now, report };
		return this.cache;
	}

	nextRequestId(): number {
		this.requestId += 1;
		return this.requestId;
	}

	invalidateRequests(): void {
		this.requestId += 1;
	}

	isCurrentRequest(requestId: number): boolean {
		return requestId === this.requestId;
	}
}

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

export async function queryUsage(
	ctx: ExtensionContext,
	options: { timeoutMs: number },
): Promise<UsageQueryResult> {
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
	return resolveCodexAccountSession(
		() => ctx.modelRegistry.getApiKeyForProvider(CODEX_PROVIDER_ID),
		{
			missingTokenMessage: "Pi is not logged in to openai-codex. Run Pi /login for OpenAI Codex.",
			missingAccountIdMessage: "Pi openai-codex token does not contain chatgpt_account_id.",
		},
	);
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
