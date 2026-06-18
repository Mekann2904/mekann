import { describe, expect, it } from "vitest";
import { Type, type TSchema } from "@sinclair/typebox";

import { parseParams, type SchemaParams } from "./typed-params.js";

describe("parseParams", () => {
	it("narrows unknown input to the schema's static type", () => {
		const schema = Type.Object({
			query: Type.String(),
			limit: Type.Optional(Type.Number()),
		});

		const params: unknown = { query: "hello", limit: 5 };
		const decoded = parseParams(schema, params);

		// Compile-time: decoded is `{ query: string; limit?: number }`, not any.
		const q: string = decoded.query;
		const l: number | undefined = decoded.limit;
		expect(q).toBe("hello");
		expect(l).toBe(5);
	});

	it("coerces convertible values (string -> number) like the legacy Number(...) guards", () => {
		const schema = Type.Object({ maxResults: Type.Optional(Type.Number()) });
		// Simulate the kind of loosely-typed payload the old `(params as any).x`
		// + `Number(...)` pattern defended against.
		const decoded = parseParams(schema, { maxResults: "7" });
		expect(decoded.maxResults).toBe(7);
	});

	it("keeps absent optional fields as undefined", () => {
		const schema = Type.Object({ limit: Type.Optional(Type.Number()) });
		const decoded = parseParams(schema, {});
		expect(decoded.limit).toBeUndefined();
	});

	it("strips keys that are not in the schema (Clean)", () => {
		const schema = Type.Object({ query: Type.String() });
		const decoded = parseParams(schema, { query: "x", rogue: "drop me" });
		expect(decoded).toEqual({ query: "x" });
		expect((decoded as Record<string, unknown>).rogue).toBeUndefined();
	});

	it("throws on input that cannot satisfy the schema", () => {
		const schema = Type.Object({ query: Type.String(), n: Type.Optional(Type.Number()) });
		// Missing required field.
		expect(() => parseParams(schema, {})).toThrow();
		// Non-numeric string for a Number field (Convert leaves "abc" as-is, so
		// Decode rejects it).
		expect(() => parseParams(schema, { query: "x", n: "abc" })).toThrow();
	});

	it("preserves string-enum values", () => {
		const schema = Type.Object({
			direction: Type.Optional(Type.Union([Type.Literal("lower"), Type.Literal("higher")])),
		});
		const decoded = parseParams(schema, { direction: "higher" });
		expect(decoded.direction).toBe("higher");
	});
});

describe("SchemaParams", () => {
	it("derives the handler param type from a schema (compile-time check)", () => {
		const schema = Type.Object({ name: Type.String(), count: Type.Number() });
		// If this compiles, the type derivation works and is the single source of
		// truth shared with the schema — schema↔handler drift becomes a type error.
		type Params = SchemaParams<typeof schema>;
		const sample: Params = { name: "n", count: 1 };
		function consume(p: Params): string {
			return `${p.name}:${p.count}`;
		}
		expect(consume(sample)).toBe("n:1");
		// `schema` must still satisfy TSchema (keeps the helper's constraint honest).
		const _checkTSchema: TSchema = schema;
		void _checkTSchema;
	});
});
