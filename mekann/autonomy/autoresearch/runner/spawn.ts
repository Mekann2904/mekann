/**
 * autoresearch/runner/spawn.ts — プロセス spawn と出力切り詰め。
 *
 * 長時間・高コストな評価 run を安全に扱う実行層:
 *   - プロセスグループ単位の kill (timeout / abort)
 *   - streaming stdout/stderr 保存 (秘密情報は redactText でマスク)
 *   - runCommand (shell) / runArgvCommand (argv, contract mode)
 * checks 実行 (runChecks) は {@link "./checks.js"}。成果物書き出しは {@link "./artifacts.js"}。
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { truncateTail as truncateTailShared } from "../../../utils/truncate-utils/index.js";
import { redactText } from "./secrets.js";
import type { RunResult } from "./types.js";
import {
	createStreamingParseState,
	finalizeParsedRunOutput,
	parseStreamingChunk,
} from "../runOutputParser.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OUTPUT_MAX_LINES = 10;
const OUTPUT_MAX_BYTES = 4 * 1024; // 4KB
const CAPTURE_MAX_BYTES = 1024 * 1024; // 1MB

// ---------------------------------------------------------------------------
// Truncation
// ---------------------------------------------------------------------------

/** 末尾を残して切り詰め。行数 → バイト数の順で適用。 */
export function truncateTail(text: string, maxLines: number, maxBytes: number): string {
	return truncateTailShared(text, { maxLines, maxBytes }).content;
}

// ---------------------------------------------------------------------------
// Command execution
// ---------------------------------------------------------------------------
// Shared spawn helpers (extracted from runCommand / runArgvCommand)
// ---------------------------------------------------------------------------

interface SpawnParams {
	spawnArgs: Parameters<typeof spawn>;
	commandLabel: string;
}

/** Setup streaming log files for stdout/stderr. Returns nulls when logDir is unset. */
interface LogStreamState {
	stdoutStream: fs.WriteStream | null;
	stderrStream: fs.WriteStream | null;
	logFilesWritten: boolean;
	streamError: string | null;
}

function setupLogStreams(logDir: string | undefined): LogStreamState {
	const state: LogStreamState = {
		stdoutStream: null,
		stderrStream: null,
		logFilesWritten: false,
		streamError: null,
	};

	if (logDir) {
		try {
			if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
			state.stdoutStream = fs.createWriteStream(path.join(logDir, "stdout.log"), { flags: "w" });
			state.stderrStream = fs.createWriteStream(path.join(logDir, "stderr.log"), { flags: "w" });
			state.logFilesWritten = true;
		} catch (error) {
			state.logFilesWritten = false;
			state.streamError = error instanceof Error ? error.message : String(error);
		}
	}

	const markStreamError = (error: Error) => {
		state.streamError = error.message;
		state.logFilesWritten = false;
	};
	state.stdoutStream?.on("error", markStreamError);
	state.stderrStream?.on("error", markStreamError);

	return state;
}

/** Shared spawn execution used by both runCommand and runArgvCommand. */
function runSpawn(params: SpawnParams, timeoutMs: number, signal: AbortSignal | undefined, logDir: string | undefined): Promise<RunResult> {
	return new Promise<RunResult>((resolve) => {
		const t0 = Date.now();
		let resolved = false;
		let timedOut = false;
		let killSignal: string | null = null;

		const logStreams = setupLogStreams(logDir);
		const child = spawn(...params.spawnArgs);

		let stdout = "";
		let stderr = "";
		const sp = createStreamingParseState();

		child.stdout!.on("data", (chunk: Buffer) => {
			const str = chunk.toString("utf8");
			if (Buffer.byteLength(stdout, "utf8") < CAPTURE_MAX_BYTES) stdout += str;
			if (logStreams.stdoutStream) logStreams.stdoutStream.write(redactText(str));
			parseStreamingChunk(sp, str, "stdoutBuf");
		});

		child.stderr!.on("data", (chunk: Buffer) => {
			const str = chunk.toString("utf8");
			if (Buffer.byteLength(stderr, "utf8") < CAPTURE_MAX_BYTES) stderr += str;
			if (logStreams.stderrStream) logStreams.stderrStream.write(redactText(str));
			parseStreamingChunk(sp, str, "stderrBuf");
		});

		function killGroup(sig: string): void {
			killSignal = sig;
			try { if (child.pid) process.kill(-child.pid, sig as NodeJS.Signals); } catch { /* already exited */ }
		}

		let graceTimer: NodeJS.Timeout | null = null;
		const timer = setTimeout(() => {
			timedOut = true;
			killGroup("SIGTERM");
			graceTimer = setTimeout(() => killGroup("SIGKILL"), 5_000);
		}, timeoutMs);

		const abortHandler = () => killGroup("SIGTERM");
		signal?.addEventListener("abort", abortHandler, { once: true });

		function finish(code: number | null, sig: string | null) {
			if (resolved) return;
			resolved = true;
			clearTimeout(timer);
			if (graceTimer) clearTimeout(graceTimer);
			signal?.removeEventListener("abort", abortHandler);

			const durationSeconds = (Date.now() - t0) / 1000;
			const combined = stdout + (stderr ? "\n" + stderr : "");
			const { parsedMetrics: parsed, externalInfo } = finalizeParsedRunOutput(sp, stdout, stderr);

			const result: RunResult = {
				command: params.commandLabel,
				exitCode: code, durationSeconds, timedOut,
				passed: code === 0 && !timedOut,
				output: truncateTail(combined, OUTPUT_MAX_LINES, OUTPUT_MAX_BYTES),
				parsedMetrics: Object.keys(parsed).length > 0 ? parsed : null,
				checks: { passed: null, timedOut: false, output: "", stdout: "", stderr: "", durationSeconds: 0 },
				stdout, stderr, signal: sig, logFilesWritten: logStreams.logFilesWritten, streamError: logStreams.streamError,
				...externalInfo,
			};

			const flushes: Promise<void>[] = [];
			if (logStreams.stdoutStream && !logStreams.stdoutStream.destroyed) {
				flushes.push(new Promise<void>(r => { logStreams.stdoutStream!.end(() => r()); }));
			}
			if (logStreams.stderrStream && !logStreams.stderrStream.destroyed) {
				flushes.push(new Promise<void>(r => { logStreams.stderrStream!.end(() => r()); }));
			}

			if (flushes.length > 0) {
				Promise.all(flushes).then(() => resolve(result));
			} else {
				resolve(result);
			}
		}

		child.on("close", (code, sig) => finish(code, sig ?? killSignal));
		child.on("error", (err) => {
			stderr += `\n${err.message}`;
			finish(null, null);
		});
	});
}

// ---------------------------------------------------------------------------
// Command execution
// ---------------------------------------------------------------------------

/**
 * シェルコマンドを spawn で実行し、結果を返す。
 *
 * @param logDir 指定すると stdout.log / stderr.log に streaming 保存する。
 *               プロセスクラッシュ時も部分ログが残る。
 */
export async function runCommand(
	command: string,
	cwd: string,
	timeoutMs: number,
	signal?: AbortSignal,
	logDir?: string,
): Promise<RunResult> {
	return runSpawn(
		{
			spawnArgs: ["bash", ["-c", command], { cwd, stdio: ["ignore", "pipe", "pipe"], detached: true }],
			commandLabel: command,
		},
		timeoutMs,
		signal,
		logDir,
	);
}

// ---------------------------------------------------------------------------
// Argv-based command execution (contract mode)
// ---------------------------------------------------------------------------

export interface ArgvCommand {
	argv: string[];
	cwd: string;
	env?: {
		allow?: string[];
		set?: Record<string, string>;
	};
}

/**
 * Execute a command using argv array (no shell interpolation).
 * Uses spawn(file, args, { cwd, env }) directly.
 */
export async function runArgvCommand(
	cmd: ArgvCommand,
	timeoutMs: number,
	signal?: AbortSignal,
	logDir?: string,
): Promise<RunResult> {
	// Build env: if allow list specified, start empty; otherwise inherit process.env
	const spawnEnv: Record<string, string | undefined> = cmd.env?.allow
		? {}
		: { ...process.env };
	if (cmd.env?.allow) {
		for (const key of cmd.env.allow) {
			if (process.env[key] !== undefined) spawnEnv[key] = process.env[key];
		}
	}
	if (cmd.env?.set) {
		Object.assign(spawnEnv, cmd.env.set);
	}

	return runSpawn(
		{
			spawnArgs: [cmd.argv[0], cmd.argv.slice(1), { cwd: cmd.cwd, env: spawnEnv, stdio: ["ignore", "pipe", "pipe"], detached: true }],
			commandLabel: cmd.argv.join(" "),
		},
		timeoutMs,
		signal,
		logDir,
	);
}
