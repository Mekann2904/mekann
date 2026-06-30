import * as crypto from "node:crypto";

/**
 * # IDs and tokens are unique across parallel processes (ADR-0029)
 *
 * Mekann runs several pi processes in the same cwd (CONTEXT.md "context
 * isolation"). IDs that combine only a timestamp and a process-local counter
 * therefore collide the moment two processes start in the same millisecond:
 * both emit `<prefix>_<same-ms>_0` and silently overwrite each other's
 * artifacts / candidates / reservations. Tokens built from `Math.random()`
 * have the additional problem of being predictable, so a hostile extension
 * could forge a sandbox-override token and pop another mode's profile.
 *
 * This module is the single source for collision-resistant, unpredictable
 * identifiers. Every ID/token generator in the codebase should go through it
 * so the "unique across parallel processes" guarantee lives in exactly one
 * place (issue #144).
 *
 * The shape mirrors the context-ledger's proven "safe side" form
 * (`ctx_<time>_<counter>_<rand>`, ADR-0006): the timestamp + counter preserve
 * in-process ordering and readability, and the cryptographic random suffix
 * removes the cross-process collision.
 */

/**
 * Cryptographic hex suffix that makes an otherwise process-local ID unique
 * across concurrent processes. `bytes = 3` (24 bits, ~16M values) matches the
 * ledger; combined with the per-process counter and timestamp the practical
 * collision probability across parallel processes is negligible.
 */
export function randomIdSuffix(bytes = 3): string {
	return crypto.randomBytes(bytes).toString("hex");
}

/**
 * Build a collision-resistant sequential identifier of the form
 *   `<prefix>_<time-base36>_<counter-base36>` (+ `_<random>` when supplied).
 *
 * Omitting `random` yields the legacy 2-segment form so existing
 * `createXxxId(time, counter)` call sites (and their format assertions) stay
 * unchanged. Callers that need cross-process uniqueness pass a `random`
 * suffix — typically from {@link randomIdSuffix} — via the matching
 * `nextXxxId` helper.
 */
export function createSequentialId(prefix: string, createdAt: number, counter: number, random = ""): string {
	const suffix = random ? `_${random}` : "";
	return `${prefix}_${createdAt.toString(36)}_${counter.toString(36)}${suffix}`;
}

/**
 * Opaque, cryptographically unguessable token for sandbox/mode profile
 * overrides, spawn-slot reservations, and similar capability-bearing handles.
 * Use wherever a value must be both unique and impossible to predict or forge.
 */
export function randomToken(bytes = 16): string {
	return crypto.randomBytes(bytes).toString("hex");
}
