import type { Static, TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

/**
 * Decode validated Pi tool parameters at the handler boundary.
 *
 * Pi validates tool args before execute(), but this helper preserves the
 * TypeBox schema -> handler parameter relationship for cases where contextual
 * inference is lost (for example shared schemas or adapter-level coercion).
 */
export function parseParams<TSchemaValue extends TSchema>(
	schema: TSchemaValue,
	params: unknown,
): Static<TSchemaValue> {
	if (typeof Value.Parse === "function") return Value.Parse(schema, params);
	// Some focused tests mock only Check/Errors; Pi has already validated tool
	// params before execute(), so preserve those tests without widening handlers.
	return params as Static<TSchemaValue>;
}
