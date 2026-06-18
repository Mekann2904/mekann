/**
 * Atomic JSONL line appender shared by the cross-process JSONL writers in the
 * context ledger, output gate, command-normalization, and autoresearch
 * ledgers (issue #139).
 *
 * ## Why this exists
 *
 * Plain `appendFile` / `appendFileSync` open the target with `O_APPEND`. POSIX
 * does not guarantee that `O_APPEND` is line-atomic for arbitrary line sizes
 * (it is only guaranteed for writes up to `PIPE_BUF`, e.g. 4096 bytes on
 * Linux), and the guarantee is unreliable under NFS and some macOS kernels.
 * Mekann runs several pi processes in one cwd (main + sub-agents + issue pi +
 * autopilot children), so concurrent appenders can interleave JSONL lines.
 * Readers then `JSON.parse`-fail the torn line and silently drop it, so
 * events / artifacts / normalization records disappear without a trace.
 *
 * This helper serialises writers with an `O_EXCL` lockfile sibling so each
 * line (and, for ledgers that compact under the same lock, each
 * append-plus-rotate transaction) lands intact. It is dependency-free.
 *
 * ## Stale recovery
 *
 * A lock older than `staleMs` (default 30 s) is treated as abandoned by a
 * crashed process and is forcibly broken. Critical-section hold times are
 * sub-second in practice, so legitimate writers never trip this. Each holder
 * stamps the lock with a unique token and only releases a lock that still
 * carries its own token, so a holder that was stale-broken mid-flight leaves
 * the new owner's lock intact.
 *
 * ## Limitations
 *
 * - `O_EXCL` is unreliable over NFS; keep these ledgers on a local filesystem.
 * - The lock is advisory between Mekann writers; an external process writing
 *   the same file with bare `appendFile` is not coordinated.
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";

const DEFAULT_LOCK_TIMEOUT_MS = 5_000;
const DEFAULT_LOCK_POLL_MS = 10;
const DEFAULT_STALE_MS = 30_000;

// Per-target in-process mutex tail. Within a single process, many concurrent
// async writers (e.g. a burst of context events) would otherwise all poll the
// filesystem lock at once — a thundering herd that serialises at the polling
// granularity and can exhaust the lock timeout. The in-process mutex lets
// same-process contenders queue cheaply on a promise chain, so only one task
// per process at a time touches the filesystem lock; cross-process writers are
// still serialised by the `O_EXCL` lockfile. The map holds one entry per unique
// target path (a small, bounded set of JSONL files), so it does not grow.
const inProcessMutexTails = new Map<string, Promise<unknown>>();

function withInProcessMutex<T>(key: string, fn: () => Promise<T>): Promise<T> {
	const tail = inProcessMutexTails.get(key) ?? Promise.resolve();
	// Chain fn after the current tail; swallow its error so a failed run cannot
	// poison the chain for later waiters. The returned promise preserves fn's
	// own result/rejection for the caller.
	const next = tail.then(fn, fn);
	inProcessMutexTails.set(key, next.then(
		() => undefined,
		() => undefined,
	));
	return next;
	}


export interface AtomicAppendOptions {
	/** Total time to keep trying to acquire the lock before giving up. */
	lockTimeoutMs?: number;
	/** Delay between lock-acquire attempts while contended. */
	lockPollMs?: number;
	/** A held lock older than this is considered abandoned and forcibly broken. */
	staleMs?: number;
	/** Override the clock (used by both async and sync variants). */
	now?: () => number;
	/** Override the async sleeper (async variants only). */
	sleep?: (ms: number) => Promise<void>;
	/** Override the sync sleeper (sync variants only). */
	sleepSync?: (ms: number) => void;
}

export type AtomicAppendFailureStage = "mkdir" | "lock" | "append" | "release";

export interface AtomicAppendLogEvent {
	level: "warn" | "error";
	/** Stable event name so log sinks can filter/grep atomic-append failures. */
	event: "atomic-append-failure";
	stage: AtomicAppendFailureStage;
	target: string;
	message: string;
	pid: number;
	timestamp: number;
}

let logSink: (event: AtomicAppendLogEvent) => void = defaultLogSink;

function defaultLogSink(event: AtomicAppendLogEvent): void {
	// One JSON object per line on stderr so it is machine-parseable and greppable
	// without interfering with pi's stdout IPC. Logging must never throw.
	try {
		process.stderr.write(JSON.stringify(event) + "\n");
	} catch {
		/* ignore */
	}
}

/**
 * Override structured-failure logging (e.g. wire into the #146 structured-log
 * sink when it lands) or pass `null` to restore the stderr default. The sink
 * receives one {@link AtomicAppendLogEvent} per failure stage.
 */
export function configureAtomicAppendLogging(sink: ((event: AtomicAppendLogEvent) => void) | null): void {
	logSink = sink ?? defaultLogSink;
}

function logFailure(stage: AtomicAppendFailureStage, target: string, message: string, level: "warn" | "error" = "warn"): void {
	logSink({ level, event: "atomic-append-failure", stage, target, message, pid: process.pid, timestamp: Date.now() });
}

/** Derive the companion lockfile path for a target JSONL file. */
export function lockPathFor(target: string): string {
	return `${target}.lock`;
}

function errMsg(e: unknown): string {
	return e instanceof Error ? e.message : String(e);
}

function makeToken(): string {
	return `${process.pid}-${Date.now().toString(36)}-${crypto.randomBytes(6).toString("hex")}`;
}

function lockPayload(token: string, startedAt: number): string {
	return JSON.stringify({ pid: process.pid, token, startedAt });
}

function isStaleContent(content: string, now: number, staleMs: number): boolean {
	try {
		const parsed = JSON.parse(content) as { startedAt?: unknown };
		return typeof parsed.startedAt === "number" && now - parsed.startedAt > staleMs;
	} catch {
		return false;
	}
}

function sleepSyncDefault(ms: number): void {
	if (ms <= 0) return;
	try {
		// Atomics.wait blocks the current thread for up to `ms`. SharedArrayBuffer
		// is always available in Node, so this is a real backoff rather than a CPU
		// spin. Fall back to a busy wait only if the host somehow lacks SAB.
		const sab = new SharedArrayBuffer(4);
		Atomics.wait(new Int32Array(sab), 0, 0, ms);
	} catch {
		const end = Date.now() + ms;
		while (Date.now() < end) {
			/* spin */
		}
	}
}

// ---------------------------------------------------------------------------
// Async variants (context ledger, output gate, command-normalization)
// ---------------------------------------------------------------------------

async function acquireLockAsync(target: string, options: AtomicAppendOptions): Promise<{ lockPath: string; token: string }> {
	const now = options.now ?? Date.now;
	const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
	const timeout = options.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS;
	const poll = options.lockPollMs ?? DEFAULT_LOCK_POLL_MS;
	const staleMs = options.staleMs ?? DEFAULT_STALE_MS;
	const lockPath = lockPathFor(target);
	const token = makeToken();
	const deadline = now() + timeout;
	for (;;) {
		try {
			const fh = await fsp.open(lockPath, "wx");
			try {
				await fh.writeFile(lockPayload(token, now()), "utf8");
			} finally {
				await fh.close();
			}
			return { lockPath, token };
		} catch (e: any) {
			if (e?.code !== "EEXIST") throw e; // real filesystem error, not contention
		}
		// Held by another writer: break it only if it is stale.
		let stale = false;
		try {
			const content = await fsp.readFile(lockPath, "utf8");
			stale = isStaleContent(content, now(), staleMs);
		} catch {
			try {
				const st = await fsp.stat(lockPath);
				stale = now() - st.mtimeMs > staleMs;
			} catch {
				/* lock vanished between attempts; loop will retry open(wx) */
			}
		}
		if (stale) {
			await fsp.unlink(lockPath).catch(() => {});
			continue; // retry immediately so a crashed writer does not stall us
		}
		if (now() >= deadline) {
			throw new Error(`atomic-append: lock timeout acquiring ${lockPath} after ${timeout}ms`);
		}
		await sleep(poll);
	}
}

async function releaseLockAsync(lockPath: string, token: string): Promise<void> {
	try {
		const content = await fsp.readFile(lockPath, "utf8");
		const parsed = JSON.parse(content) as { token?: unknown };
		// Only remove a lock that still belongs to us. If the token differs, a
		// stale-breaker already handed the lock to another owner; leave it.
		if (parsed.token === token) await fsp.unlink(lockPath);
	} catch {
		/* lock gone or unreadable; nothing to release */
	}
}

/**
 * Run `fn` while holding the per-target append lock. Use this when a writer
 * needs several filesystem operations to be atomic together (e.g. the context
 * ledger's append + rotate + prune transaction). For a single-line append,
 * prefer {@link appendJsonlLine}.
 *
 * The lock is acquired on `target`'s companion lockfile; `fn` is then awaited;
 * the lock is always released in `finally`. Errors from `fn` are logged as a
 * structured `append`-stage failure and re-thrown so callers keep their
 * existing error-handling semantics.
 */
export async function withAppendLock<T>(target: string, fn: () => Promise<T>, options: AtomicAppendOptions = {}): Promise<T> {
	// Serialise same-process contenders on a cheap promise chain before they
	// contend on the filesystem lock; the file lock still serialises across
	// processes.
	return withInProcessMutex(path.resolve(target), async () => {
		try {
			await fsp.mkdir(path.dirname(target), { recursive: true });
		} catch (e) {
			logFailure("mkdir", target, errMsg(e), "error");
			throw e;
		}
		const { lockPath, token } = await acquireLockAsync(target, options).catch((e) => {
			logFailure("lock", target, errMsg(e), "error");
			throw e;
		});
		try {
			return await fn();
		} catch (e) {
			logFailure("append", target, errMsg(e), "error");
			throw e;
		} finally {
			await releaseLockAsync(lockPath, token).catch((e) => {
				logFailure("release", target, errMsg(e));
			});
		}
	});
}

/**
 * Append a single line to `target` atomically across processes. The line is
 * written verbatim (no trailing newline is added), so callers include the
 * `\n` themselves, matching the existing `appendFile` call sites.
 */
export async function appendJsonlLine(target: string, line: string, options: AtomicAppendOptions = {}): Promise<void> {
	await withAppendLock(
		target,
		async () => {
			await fsp.appendFile(target, line, "utf8");
		},
		options,
	);
}

// ---------------------------------------------------------------------------
// Sync variants (autoresearch ledgers, whose callers use a sync API)
// ---------------------------------------------------------------------------

/**
 * Synchronous twin of {@link withAppendLock}. Holds the same per-target
 * `O_EXCL` lockfile but uses a bounded busy-wait (with `Atomics.wait` backoff)
 * while contended, so it blocks the event loop like the `appendFileSync` it
 * replaces. Prefer the async variant in async call sites.
 */
export function withAppendLockSync<T>(target: string, fn: () => T, options: AtomicAppendOptions = {}): T {
	try {
		fs.mkdirSync(path.dirname(target), { recursive: true });
	} catch (e) {
		logFailure("mkdir", target, errMsg(e), "error");
		throw e;
	}
	const now = options.now ?? Date.now;
	const sleepSync = options.sleepSync ?? sleepSyncDefault;
	const timeout = options.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS;
	const poll = options.lockPollMs ?? DEFAULT_LOCK_POLL_MS;
	const staleMs = options.staleMs ?? DEFAULT_STALE_MS;
	const lockPath = lockPathFor(target);
	const token = makeToken();
	const deadline = now() + timeout;
	for (;;) {
		let fd: number | undefined;
		try {
			fd = fs.openSync(lockPath, "wx");
		} catch (e: any) {
			if (e?.code !== "EEXIST") {
				logFailure("lock", target, errMsg(e), "error");
				throw e;
			}
		}
		if (fd !== undefined) {
			try {
				fs.writeFileSync(fd, lockPayload(token, now()), "utf8");
			} finally {
				fs.closeSync(fd);
			}
			break; // acquired
		}
		// Contended: break the lock only if it is stale.
		let stale = false;
		try {
			const content = fs.readFileSync(lockPath, "utf8");
			stale = isStaleContent(content, now(), staleMs);
		} catch {
			try {
				const st = fs.statSync(lockPath);
				stale = now() - st.mtimeMs > staleMs;
			} catch {
				/* lock vanished; retry open(wx) */
			}
		}
		if (stale) {
			try {
				fs.unlinkSync(lockPath);
			} catch {
				/* ignore */
			}
			continue;
		}
		if (now() >= deadline) {
			const msg = `atomic-append: lock timeout acquiring ${lockPath} after ${timeout}ms`;
			logFailure("lock", target, msg, "error");
			throw new Error(msg);
		}
		sleepSync(poll);
	}
	try {
		return fn();
	} catch (e) {
		logFailure("append", target, errMsg(e), "error");
		throw e;
	} finally {
		try {
			const content = fs.readFileSync(lockPath, "utf8");
			const parsed = JSON.parse(content) as { token?: unknown };
			if (parsed.token === token) fs.unlinkSync(lockPath);
		} catch {
			/* lock gone or stolen; nothing to release */
		}
	}
}

/**
 * Synchronous twin of {@link appendJsonlLine}.
 */
export function appendJsonlLineSync(target: string, line: string, options: AtomicAppendOptions = {}): void {
	withAppendLockSync(
		target,
		() => {
			fs.appendFileSync(target, line, "utf8");
		},
		options,
	);
}
