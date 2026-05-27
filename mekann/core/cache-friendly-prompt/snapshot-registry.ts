/**
 * snapshot-registry.ts — State registry for cache-friendly-prompt request
 * snapshots. Owns the correlation policy: requestId → providerModel FIFO →
 * runKey fallback → cwd fallback.
 *
 * This module concentrates mutable state so the hook Adapter in index.ts
 * stays thin and correlation bugs have locality here.
 */

import type { PromptRequestSnapshotState } from "./request-snapshot.js";

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
		while (this.actualUsageKeys.size > MAX_ACTUAL_USAGE_KEYS) {
			const oldest = this.actualUsageKeys.keys().next().value;
			if (oldest === undefined) break;
			this.actualUsageKeys.delete(oldest);
		}
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
		};
	}

	// ── Helpers ───────────────────────────────────────────────────

	private providerModelQueueKey(
		runKey: string,
		provider?: string,
		model?: string,
	): string {
		return `${runKey}:${provider ?? "unknown"}:${model ?? "unknown"}`;
	}
}
