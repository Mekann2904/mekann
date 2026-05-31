import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { createInterface } from "node:readline";

const CODEX_BIN_ENV = "CODEX_BIN";
const MAX_ERROR_BODY_CHARS = 600;

type RpcResponse = {
	id?: unknown;
	result?: unknown;
	error?: { message?: unknown; code?: unknown };
};

type PendingRpc = {
	resolve: (value: unknown) => void;
	reject: (error: Error) => void;
};

export type ServerRequestHandler = (method: string, params: unknown) => Promise<unknown> | unknown;

export class CodexAppServerClient {
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
