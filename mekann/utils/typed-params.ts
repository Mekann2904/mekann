/**
 * Type-safe parameter decoder for pi tool handlers.
 *
 * Problem this solves
 * -------------------
 * pi validates tool-call arguments against the TypeBox schema *before*
 * invoking `execute()`, so `params` is already schema-valid at runtime. The
 * real problem is *static*: with no typed boundary, handlers reach into params
 * via an explicit `any` cast on params (e.g. reading `.foo` off `any`). That
 * silently hides schema↔handler field drift —
 * a renamed, mistyped, or removed field just returns `undefined` instead of
 * surfacing as a compile error (see issue #141: 117 explicit `any` casts across
 * non-test sources, strict mode effectively bypassed).
 *
 * What `parseParams` does
 * -----------------------
 * `parseParams(schema, params)` provides a single typed boundary that:
 *   - narrows `unknown` → `Static<typeof schema>` so every field access in the
 *     handler is compile-checked, and
 *   - runs the TypeBox decode pipeline (Convert → Clean → Default → Decode) so
 *     the value matches the schema even when called from unit tests or other
 *     direct callers that did not go through pi's validation.
 *
 * Usage
 * -----
 * ```ts
 * const myToolParams = Type.Object({ query: Type.String(), limit: Type.Optional(Type.Number()) });
 * type MyToolParams = Static<typeof myToolParams>;
 *
 * pi.registerTool({
 *   parameters: myToolParams,
 *   async execute(_id, params, _signal, _onUpdate, _ctx) {
 *     const p = parseParams(myToolParams, params); // typed, no explicit any
 *     return runSearch(p.query, p.limit);
 *   },
 * });
 * ```
 *
 * Because pi already validates, `parseParams` is effectively the identity in
 * production: Convert is a no-op on correctly-typed values, Clean strips
 * nothing, and Decode passes. It only throws on input that is invalid *after*
 * Convert/Default — i.e. genuinely malformed direct/test calls. It never
 * silently widens to `any`, so schema/handler drift becomes a compile-time
 * error.
 */

import type { Static, TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

/**
 * Decode a tool-call `params` value against its TypeBox schema.
 *
 * Pipeline: Convert (coerce primitives, e.g. `"7"` → `7` for `Type.Number()`,
 * matching the legacy `Number(...)`/`Boolean(...)` guards) → Clean (drop keys
 * absent from the schema so handlers can't read phantom fields) → Default
 * (apply schema defaults) → Decode (validate + run decode functions).
 *
 * @param schema The TypeBox schema used in `registerTool({ parameters })`.
 * @param params The `params` received by the tool's `execute()` (typed
 *   `Static<typeof schema>` by pi, but `unknown` to this helper so it can be
 *   reused from tests/direct callers).
 * @returns The cleaned/decoded value typed as `Static<typeof schema>`.
 * @throws `TransformDecodeCheckError` / `ValueError` if `params` cannot be
 *   decoded to satisfy `schema` after coercion.
 */
export function parseParams<S extends TSchema>(schema: S, params: unknown): Static<S> {
	const coerced = Value.Convert(schema, params);
	const cleaned = Value.Clean(schema, coerced);
	return Value.Decode(schema, Value.Default(schema, cleaned));
}

/**
 * Derive the handler parameter type from a TypeBox schema.
 *
 * Use this to share one source of truth between a schema and a handler's
 * signature, so the two cannot drift:
 *
 * ```ts
 * const myToolParams = Type.Object({ query: Type.String() });
 * function run(p: SchemaParams<typeof myToolParams>) { return p.query; }
 * ```
 */
export type SchemaParams<S extends TSchema> = Static<S>;
