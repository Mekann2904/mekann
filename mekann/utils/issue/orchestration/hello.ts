/**
 * orchestration/hello.ts — env-marker hello-verify handshake (ADR-0028 IC-246).
 *
 * The orchestration Work-Pi detection relies on `MEKANN_ORCHESTRATION_PARENT` /
 * `MEKANN_ORCHESTRATION_CHILD` env markers propagated by
 * {@link ../../terminal/pi-session.ts} via `--env`. If a launch wrapper drops
 * the export (missing `export`, `set -e` abort, etc.) the markers vanish and
 * the child silently mis-detects as a manual session, so
 * {@link ./lifecycle.ts}'s continuation never fires.
 *
 * This module realises the ADR's "hello verify" as a defence-in-depth
 * filesystem handshake that is independent of env propagation:
 *
 * 1. The launcher ({@link ../../terminal/pi-session.ts}) writes an *expected*
 *    manifest into the child worktree right before launching it.
 * 2. The child reads the manifest at session start. If a manifest says it was
 *    launched as an orchestration child but the env markers are absent, the
 *    orchestration extension surfaces a warning instead of staying silent.
 *
 * Because the manifest lives in the worktree (not the env), it survives a
 * broken `--env` path. It is the launcher that writes it, so the launcher's own
 * intent ("I started an orchestration child") is the ground truth the child
 * checks against. The `--env` propagation remains the primary path; this is a
 * secondary check, not a replacement.
 */

import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** Worktree-relative directory + file holding the expected-child manifest. */
const HELLO_DIR = [".mekann", "orchestration"];
const HELLO_FILE = "hello.json";

/**
 * How long a manifest is considered "fresh". A manifest older than this is
 * ignored, so a file left behind by a session that crashed before it could
 * consume it cannot trip a much later manual `/issue` in the same worktree.
 */
export const HELLO_STALE_MS = 10 * 60 * 1000; // 10 minutes

export interface ExpectedHello {
	parent: number;
	child: number;
	/** Epoch ms when the launcher wrote the manifest. */
	launchedAt: number;
}

/** Result of reading the manifest: a fresh expected record, or nothing. */
export type HelloRead =
	| { expected: false }
	| ({ expected: true } & ExpectedHello);

function helloPath(cwd: string): string {
	return join(cwd, ...HELLO_DIR, HELLO_FILE);
}

function isValid(raw: unknown): raw is ExpectedHello {
	return (
		typeof raw === "object" &&
		raw !== null &&
		typeof (raw as ExpectedHello).parent === "number" &&
		typeof (raw as ExpectedHello).child === "number" &&
		typeof (raw as ExpectedHello).launchedAt === "number"
	);
}

/**
 * Write the expected-child manifest into `cwd` (the child worktree). Called by
 * the launcher immediately before launching the child, so the child is
 * guaranteed to find it at session start.
 */
export async function writeExpectedHello(
	cwd: string,
	hello: { parent: number; child: number },
	now: number = Date.now(),
): Promise<void> {
	const dir = join(cwd, ...HELLO_DIR);
	await mkdir(dir, { recursive: true });
	const payload: ExpectedHello = { parent: hello.parent, child: hello.child, launchedAt: now };
	await writeFile(helloPath(cwd), JSON.stringify(payload), "utf8");
}

/**
 * Read the expected-child manifest for `cwd`.
 *
 * Returns `{ expected: false }` when there is no manifest, the JSON is
 * malformed, or the manifest is stale (older than `staleMs`). Only a fresh,
 * well-formed manifest is reported as expected.
 */
export async function readExpectedHello(
	cwd: string,
	now: number = Date.now(),
	staleMs: number = HELLO_STALE_MS,
): Promise<HelloRead> {
	try {
		const raw = await readFile(helloPath(cwd), "utf8");
		const parsed = JSON.parse(raw) as unknown;
		if (!isValid(parsed)) return { expected: false };
		if (now - parsed.launchedAt > staleMs) return { expected: false };
		return { expected: true, ...parsed };
	} catch {
		return { expected: false };
	}
}

/**
 * Remove the manifest. Called once the child has successfully verified its
 * markers, so the file cannot trip a later manual session in the same worktree.
 * No-op when the file is already gone.
 */
export async function consumeExpectedHello(cwd: string): Promise<void> {
	try {
		await unlink(helloPath(cwd));
	} catch {
		// Already absent; nothing to consume.
	}
}
