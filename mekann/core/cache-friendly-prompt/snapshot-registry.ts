/**
 * snapshot-registry.ts — State registry for cache-friendly-prompt request
 * snapshots. Owns the correlation policy: requestId → providerModel FIFO →
 * runKey fallback → cwd fallback.
 *
 * This module concentrates mutable state so the hook Adapter in index.ts
 * stays thin and correlation bugs have locality here.
 */

import type { PromptRequestSnapshotState } from "./request-snapshot.js";
import type { CacheFriendlyRequestRole } from "../prompt-core/index.js";

export type RoleOnlyMemo = {
	requestRole: CacheFriendlyRequestRole;
	requestRoleSource: string;
};

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

const MAX_RUN_STATES = 128;
const MAX_PROVIDER_MODEL_QUEUE = 32;
const MAX_ACTUAL_USAGE_KEYS = 512;

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export class PromptRequestSnapshotRegistry {
	private readonly stateByRun = new Map<string, PromptRequestSnapshotState>();
	private readonly stateByRequestId = new Map<string, PromptRequestSnapshotState>();
	private readonly stateQueuesByProviderModel = new Map<string, PromptRequestSnapshotState[]>();
	private readonly actualUsageKeys = new Set<string>();
	/**
	 * Role resolved at the agent-start hook even when fragment re-injection was
	 * skipped (inherited cache-friendly fragments). Keyed by runKey so provider /
	 * message hooks can recover the role when no full snapshot was registered.
	 */
	private readonly roleOnlyByRun = new Map<string, RoleOnlyMemo>();

	// ── Run + request-id state ────────────────────────────────────

	rememberRunState(key: string, state: PromptRequestSnapshotState): void {
		const previous = this.stateByRun.get(key);
		if (previous?.requestId && previous.requestId !== state.requestId) {
			this.stateByRequestId.delete(previous.requestId);
		}
		this.stateByRun.delete(key);
		this.stateByRun.set(key, state);
		if (state.requestId) {
			this.stateByRequestId.set(state.requestId, state);
		}
		while (this.stateByRun.size > MAX_RUN_STATES) {
			const oldest = this.stateByRun.keys().next().value;
			if (oldest === undefined) break;
			const oldState = this.stateByRun.get(oldest);
			this.stateByRun.delete(oldest);
			if (oldState?.requestId) {
				this.stateByRequestId.delete(oldState.requestId);
			}
		}
	}

	getByRunKey(key: string): PromptRequestSnapshotState | undefined {
		return this.stateByRun.get(key);
	}

	getByRequestId(requestId: string): PromptRequestSnapshotState | undefined {
		return this.stateByRequestId.get(requestId);
	}

	// ── Role-only memo (early-return path) ─────────────────────

	/**
	 * Remember a resolved role for a run even when no full snapshot was
	 * registered (e.g. the agent-start hook skipped fragment injection because
	 * the incoming prompt already carried cache-friendly fragments).
	 */
	rememberRoleOnly(key: string, memo: RoleOnlyMemo): void {
		this.roleOnlyByRun.delete(key);
		this.roleOnlyByRun.set(key, memo);
		this.trimToCapacity(this.roleOnlyByRun, MAX_RUN_STATES);
	}

	getRoleOnly(key: string): RoleOnlyMemo | undefined {
		return this.roleOnlyByRun.get(key);
	}

	// ── Provider-model FIFO queue ─────────────────────────────────

	rememberProviderModelState(
		runKey: string,
		provider: string | undefined,
		model: string | undefined,
		state: PromptRequestSnapshotState,
	): void {
		const key = this.providerModelQueueKey(runKey, provider, model);
		const queue = this.stateQueuesByProviderModel.get(key) ?? [];
		queue.push(state);
		while (queue.length > MAX_PROVIDER_MODEL_QUEUE) queue.shift();
		this.stateQueuesByProviderModel.set(key, queue);
	}

	takeProviderModelState(
		runKey: string,
		provider?: string,
		model?: string,
	): PromptRequestSnapshotState | undefined {
		const key = this.providerModelQueueKey(runKey, provider, model);
		const queue = this.stateQueuesByProviderModel.get(key);
		const state = queue?.shift();
		if (queue && queue.length === 0) {
			this.stateQueuesByProviderModel.delete(key);
		}
		return state;
	}

	// ── Actual usage dedup ────────────────────────────────────────

	rememberActualUsageKey(key: string): boolean {
		if (this.actualUsageKeys.has(key)) return false;
		this.actualUsageKeys.add(key);
		this.trimToCapacity(this.actualUsageKeys, MAX_ACTUAL_USAGE_KEYS);
		return true;
	}

	// ── Correlation lookup (central policy) ───────────────────────

	/**
	 * Returns [state, correlationConfidence] following the priority:
	 * 1. requestId_matched
	 * 2. providerModel_fifo
	 * 3. runKey_latest
	 * 4. missing
	 */
	lookupForProviderRequest(opts: {
		requestId?: string;
		runKey: string;
		cwd?: string;
		provider?: string;
		model?: string;
	}): {
		state: PromptRequestSnapshotState | null;
		correlationConfidence:
			| "requestId_matched"
			| "providerModel_fifo"
			| "runKey_latest"
			| "missing";
		roleHint?: RoleOnlyMemo;
	} {
		// 1. requestId exact match
		if (opts.requestId) {
			const matched = this.stateByRequestId.get(opts.requestId);
			if (matched) {
				return {
					state: matched,
					correlationConfidence: "requestId_matched",
				};
			}
		}

		// 2. runKey fallback
		const byRun = this.stateByRun.get(opts.runKey) ?? (opts.cwd ? this.stateByRun.get(opts.cwd) : undefined) ?? null;

		return {
			state: byRun,
			correlationConfidence: byRun ? "runKey_latest" : "missing",
			roleHint: byRun ? undefined : this.roleHintFor(opts.runKey, opts.cwd),
		};
	}

	/**
	 * Returns [state, correlationConfidence] for actual usage logging.
	 * Uses requestId → providerModel FIFO → runKey → cwd fallback.
	 */
	lookupForActualUsage(opts: {
		requestId?: string;
		runKey: string;
		cwd?: string;
		provider?: string;
		model?: string;
	}): {
		state: PromptRequestSnapshotState | null;
		correlationConfidence:
			| "requestId_matched"
			| "providerModel_fifo"
			| "runKey_latest"
			| "missing";
		roleHint?: RoleOnlyMemo;
	} {
		// 1. requestId exact match
		let requestMatchedState: PromptRequestSnapshotState | undefined;
		if (opts.requestId) {
			requestMatchedState = this.stateByRequestId.get(opts.requestId);
			if (requestMatchedState) {
				return {
					state: requestMatchedState,
					correlationConfidence: "requestId_matched",
				};
			}
		}

		// 2. Provider-model FIFO
		const fifoState = requestMatchedState
			? undefined
			: this.takeProviderModelState(opts.runKey, opts.provider, opts.model);
		if (fifoState) {
			return {
				state: fifoState,
				correlationConfidence: "providerModel_fifo",
			};
		}

		// 3. runKey → cwd fallback
		const byRun = this.stateByRun.get(opts.runKey) ?? (opts.cwd ? this.stateByRun.get(opts.cwd) : undefined) ?? null;

		return {
			state: byRun,
			correlationConfidence: byRun ? "runKey_latest" : "missing",
			roleHint: byRun ? undefined : this.roleHintFor(opts.runKey, opts.cwd),
		};
	}

	// ── Helpers ───────────────────────────────────────────────────

	private roleHintFor(runKey: string, cwd?: string): RoleOnlyMemo | undefined {
		return this.roleOnlyByRun.get(runKey) ?? (cwd ? this.roleOnlyByRun.get(cwd) : undefined);
	}

	/**
	 * Drop the oldest insertions from a FIFO collection until it fits `max`.
	 * Shared by the role-only memo map and the actual-usage dedup set, which
	 * both implement plain insert-order eviction.
	 */
	private trimToCapacity<K>(
		collection: { size: number; keys(): IterableIterator<K>; delete(key: K): void },
		max: number,
	): void {
		while (collection.size > max) {
			const oldest = collection.keys().next().value;
			if (oldest === undefined) break;
			collection.delete(oldest);
		}
	}

	private providerModelQueueKey(
		runKey: string,
		provider?: string,
		model?: string,
	): string {
		return `${runKey}:${provider ?? "unknown"}:${model ?? "unknown"}`;
	}
}
