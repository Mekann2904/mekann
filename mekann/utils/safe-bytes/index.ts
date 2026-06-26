/**
 * Robust UTF-8 byte-length measurement that never collapses to 0 when a value
 * cannot be serialized.
 *
 * Aggregate counters (tool-schema totals, message breakdowns) previously used a
 * per-module `byteLen` that returned 0 on `JSON.stringify` failure (circular
 * references, BigInt). A 0 result makes legitimately large schemas/messages
 * look empty in dashboards and budget plans, so this helper falls back to the
 * byte length of `String(value)` instead.
 *
 * @param value     Value to measure.
 * @param serialize Serializer used for non-string values. Defaults to
 *                  `JSON.stringify`; pass `canonicalizeJson` for stable key
 *                  ordering so the same logical value always reports the same
 *                  byte length.
 */
export function safeByteLen(
	value: unknown,
	serialize: (value: unknown) => string = JSON.stringify,
): number {
	if (typeof value === "string") return Buffer.byteLength(value, "utf8");
	let serialized: string;
	try {
		serialized = serialize(value);
	} catch {
		// Circular references, BigInt, etc. — measure the best-effort string form
		// rather than reporting 0, which would hide the value in aggregates.
		serialized = String(value);
	}
	return Buffer.byteLength(serialized, "utf8");
}
