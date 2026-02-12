// File: .pi/lib/storage-lock.ts
// Description: Provides synchronous file lock and atomic write helpers for extension storage files.
// Why: Prevents concurrent storage writes from clobbering records during parallel agent executions.
// Related: .pi/extensions/subagents.ts, .pi/extensions/agent-teams.ts, .pi/extensions/plan.ts

import { randomBytes } from "node:crypto";
import {
  closeSync,
  openSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";

export interface FileLockOptions {
  maxWaitMs?: number;
  pollMs?: number;
  staleMs?: number;
}

const DEFAULT_LOCK_OPTIONS: Required<FileLockOptions> = {
  maxWaitMs: 4_000,
  pollMs: 25,
  staleMs: 30_000,
};

function sleepSync(ms: number): void {
  if (ms <= 0) return;
  if (
    typeof SharedArrayBuffer === "undefined" ||
    typeof Atomics === "undefined" ||
    typeof Atomics.wait !== "function"
  ) {
    const waitUntil = Date.now() + ms;
    while (Date.now() < waitUntil) {
      // Busy-wait fallback for runtimes without Atomics.wait.
    }
    return;
  }

  try {
    const sab = new SharedArrayBuffer(4);
    const view = new Int32Array(sab);
    Atomics.wait(view, 0, 0, ms);
  } catch {
    const waitUntil = Date.now() + ms;
    while (Date.now() < waitUntil) {
      // Busy-wait fallback when SharedArrayBuffer creation fails.
    }
  }
}

function isNodeErrno(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === code
  );
}

function tryAcquireLock(lockFile: string): boolean {
  let fd: number | undefined;
  try {
    fd = openSync(lockFile, "wx", 0o600);
    writeFileSync(fd, `${process.pid}:${Date.now()}\n`, "utf-8");
    return true;
  } catch (error) {
    if (isNodeErrno(error, "EEXIST")) {
      return false;
    }
    throw error;
  } finally {
    if (typeof fd === "number") {
      try {
        closeSync(fd);
      } catch {
        // noop
      }
    }
  }
}

function clearStaleLock(lockFile: string, staleMs: number): void {
  try {
    const ageMs = Date.now() - statSync(lockFile).mtimeMs;
    if (ageMs > staleMs) {
      unlinkSync(lockFile);
    }
  } catch {
    // noop
  }
}

export function withFileLock<T>(
  targetFile: string,
  fn: () => T,
  options?: FileLockOptions,
): T {
  const lockFile = `${targetFile}.lock`;
  const config = {
    ...DEFAULT_LOCK_OPTIONS,
    ...(options || {}),
  };
  const maxWaitMs = Math.max(0, Math.trunc(config.maxWaitMs));
  const pollMs = Math.max(1, Math.trunc(config.pollMs));
  const staleMs = Math.max(1_000, Math.trunc(config.staleMs));
  const startedAtMs = Date.now();
  let acquired = false;

  while (!acquired && Date.now() - startedAtMs <= maxWaitMs) {
    acquired = tryAcquireLock(lockFile);
    if (acquired) break;
    clearStaleLock(lockFile, staleMs);
    sleepSync(pollMs);
  }

  if (!acquired) {
    throw new Error(`file lock timeout: ${lockFile}`);
  }

  try {
    return fn();
  } finally {
    try {
      unlinkSync(lockFile);
    } catch {
      // noop
    }
  }
}

export function atomicWriteTextFile(filePath: string, content: string): void {
  const tmpFile = `${filePath}.tmp-${process.pid}-${randomBytes(3).toString("hex")}`;
  writeFileSync(tmpFile, content, "utf-8");
  try {
    renameSync(tmpFile, filePath);
  } catch (error) {
    try {
      unlinkSync(tmpFile);
    } catch {
      // noop
    }
    throw error;
  }
}
