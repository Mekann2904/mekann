/**
 * context-ledger — post-compaction working-memory restore.
 *
 * After pi compacts the conversation tail, the link between the summarized
 * conversation and the structured decisions/tasks/artifact refs recorded in
 * the ledger is lost. This module restores that working memory by injecting
 * the current ledger snapshot as a **dynamic** prompt fragment on the first
 * turn following a compaction, so the agent does not have to call
 * `summarize_session_context` manually.
 *
 * Lifecycle (wired from `index.ts`):
 *   - `session_compact`  → `arm()`        (a compaction just completed)
 *   - `session_start`    → `reset()`      (fresh session, nothing to restore)
 *   - `context` event    → `consumeIfDelivered(messages)`
 *
 * The fragment is contributed through the prompt-core provider registry, so
 * cache-friendly-prompt routes it into the "Dynamic turn context" block
 * (rebuilt after a compaction, when the prior dynamic marker is gone).
 *
 * Consumption is one-shot per compaction: once the fragment is observed in a
 * freshly-built dynamic block, the controller disarms. It re-arms on the next
 * compaction. This keeps the snapshot out of the cache prefix
 * (`cacheIntent: "avoid_cache"`) and avoids re-injecting it every turn.
 */

import type {
	PromptFragment,
	PromptProviderContext,
} from "../../core/prompt-core/index.js";

// ─── Fragment identity ─────────────────────────────────────────

/** Unique fragment id. Distinct from model-optimizer's hint fragment id. */
export const POST_COMPACTION_RESTORE_FRAGMENT_ID =
	"context-ledger:post-compaction-restore";

/**
 * Priority for the restore fragment.
 *
 * Sits between the goal runtime-state fragment (700) and the autoresearch
 * active-context fragment (750) so it does not collide with any existing
 * dynamic runtime-state priority. model-optimizer's short hint lives at 180
 * (a different fragment), so the two coexist without conflict.
 */
export const POST_COMPACTION_RESTORE_PRIORITY = 720;

/**
 * Byte budget for the injected snapshot. Mirrors the default used by the
 * `summarize_session_context` tool and the `restore` command so the restore
 * path is symmetric with the manual one.
 */
export const POST_COMPACTION_RESTORE_MAX_BYTES = 4096;

// ─── Fragment builder ──────────────────────────────────────────

/**
 * Build the dynamic restore fragment from a snapshot XML string.
 *
 * Exported for unit testing. Returns a fragment with `stability: "dynamic"`
 * and `cacheIntent: "avoid_cache"` so cache-friendly-prompt places it in the
 * volatile dynamic block instead of the cached stable prefix.
 */
export function buildRestoreFragment(xml: string): PromptFragment {
	return {
		id: POST_COMPACTION_RESTORE_FRAGMENT_ID,
		source: "context-ledger",
		kind: "current_context",
		stability: "dynamic",
		scope: "turn",
		priority: POST_COMPACTION_RESTORE_PRIORITY,
		version: "v1",
		cacheIntent: "avoid_cache",
		content: `<!-- mekann post-compaction working-memory restore -->\n${xml}`,
	};
}

// ─── Message inspection helpers ────────────────────────────────

/**
 * Extract plain text from a pi message `content` value (string or content
 * part array). Symmetric with cache-friendly-prompt's internal `contentText`.
 */
export function extractMessageText(content: unknown): string {
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		return content
			.map((part) => {
				if (typeof part === "string") return part;
				if (part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string") {
					return (part as { text: string }).text;
				}
				return "";
			})
			.join("");
	}
	return "";
}

/**
 * Detect whether the context event `messages` carry a freshly-built
 * cache-friendly dynamic block that contains our restore fragment.
 *
 * cache-friendly-prompt appends the dynamic block as the **last** message
 * (customType `cache-friendly-dynamic-context`) only when it rebuilds the
 * block (i.e. the prior dynamic marker was absent — the post-compaction
 * case). Checking the last message avoids matching a stale block left over
 * from a previous compaction cycle.
 */
export function messageDeliveredRestore(messages: unknown[]): boolean {
	const last = messages[messages.length - 1];
	if (!last || typeof last !== "object") return false;
	const msg = last as { customType?: unknown; content?: unknown };
	return (
		msg.customType === "cache-friendly-dynamic-context" &&
		extractMessageText(msg.content).includes(POST_COMPACTION_RESTORE_FRAGMENT_ID)
	);
}

// ─── Controller ────────────────────────────────────────────────

export interface RestoreControllerDeps {
	/** Whether the restore feature toggle is enabled. */
	isEnabled: () => boolean;
	/** Read the snapshot XML for a cwd (reuses the summarize/restore path). */
	readSnapshotXml: (cwd: string) => Promise<string>;
}

/**
 * Stateful controller for post-compaction restore.
 *
 * Encapsulates the arm/reset/consume lifecycle and the fragment contribution
 * so it can be unit-tested without a pi instance. `index.ts` wires the pi
 * events to the controller methods and registers a thin prompt provider that
 * delegates to `getFragments`.
 */
export class PostCompactionRestoreController {
	private armed = false;

	constructor(private readonly deps: RestoreControllerDeps) {}

	/** A compaction completed: offer the snapshot on the next prompt render. */
	arm(): void {
		this.armed = true;
	}

	/** Fresh session / shutdown: clear any pending restore. */
	reset(): void {
		this.armed = false;
	}

	/** Whether a restore is currently armed. */
	isArmed(): boolean {
		return this.armed;
	}

	/**
	 * Disarm once the restore fragment has been delivered into a freshly-built
	 * dynamic block this turn. Stays armed otherwise (e.g. when cache-friendly
	 * skipped because a prior dynamic block survived compaction), so the
	 * restore retries on a subsequent rebuild.
	 */
	consumeIfDelivered(messages: unknown[]): void {
		if (this.armed && messageDeliveredRestore(messages)) {
			this.armed = false;
		}
	}

	/** Contribute the restore fragment while armed and there is data to show. */
	async getFragments(ctx: PromptProviderContext): Promise<PromptFragment[]> {
		if (!this.armed) return [];
		if (!this.deps.isEnabled()) return [];
		const xml = await this.deps.readSnapshotXml(ctx.cwd ?? process.cwd());
		// Skip an empty ledger: buildSnapshot yields a bare wrapper with no
		// <event> elements when there is nothing active to restore.
		if (!xml.includes("<event ")) return [];
		return [buildRestoreFragment(xml)];
	}
}
