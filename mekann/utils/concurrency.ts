/**
 * Bounded-concurrency array mapping.
 *
 * Pure, dependency-free helper shared by callers that parallelise independent
 * network calls (e.g. per-issue GitHub API requests). Kept here — not inlined
 * — so the two invariants callers rely on are unit-testable in isolation:
 *   1. Results are returned in input order regardless of completion order.
 *   2. Never more than `concurrency` mapper invocations are in flight at once.
 */

/**
 * Map over `items` with a cap on in-flight invocations, returning results in
 * the same order as `items`.
 *
 * A plain `Promise.all` fires every mapper at once; for a large list of
 * independent network calls that can sit on or exceed a server's
 * concurrent-request ceiling. GitHub's secondary rate limit, for example, caps
 * concurrent requests at ~100 (shared across REST/GraphQL, independent of
 * authentication), and the primary limit is 5,000/hour. Capping concurrency
 * (e.g. 10) keeps a full 100-item list well under the secondary limit while
 * still collapsing N serial round-trips into ⌈N/concurrency⌉ batches.
 *
 * @param items       Source array (order is preserved in the output).
 * @param concurrency Max mapper invocations in flight at once. Clamped to ≥1.
 * @param mapper      Async transform; receives the item and its source index.
 * @returns           Results in the same order as `items`.
 */
export async function mapWithConcurrency<T, R>(
	items: readonly T[],
	concurrency: number,
	mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
	const limit = Number.isFinite(concurrency) && concurrency >= 1 ? Math.floor(concurrency) : 1;
	const results: R[] = new Array(items.length);
	for (let start = 0; start < items.length; start += limit) {
		const slice = items.slice(start, start + limit);
		const mapped = await Promise.all(slice.map((item, offset) => mapper(item, start + offset)));
		for (let j = 0; j < mapped.length; j++) results[start + j] = mapped[j];
	}
	return results;
}
