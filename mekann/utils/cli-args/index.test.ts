import { describe, it, expect } from "vitest";
import { parseFlags, stripQuotes, tokenizeArgs } from "./index.js";

describe("cli-args / tokenizeArgs", () => {
	it("returns [] for empty/whitespace input", () => {
		expect(tokenizeArgs("")).toEqual([]);
		expect(tokenizeArgs("   ")).toEqual([]);
	});

	it("splits on whitespace", () => {
		expect(tokenizeArgs("show og_a_1")).toEqual(["show", "og_a_1"]);
	});

	it("strips matching single quotes", () => {
		expect(tokenizeArgs("show 'og_a_1'")).toEqual(["show", "og_a_1"]);
	});

	it("strips matching double quotes", () => {
		expect(tokenizeArgs('show "og a 1"')).toEqual(["show", "og a 1"]);
	});

	it("keeps quotes that are not surrounding the whole token", () => {
		// A quoted segment embedded in a larger token stays as one token.
		expect(tokenizeArgs("a'b'c")).toEqual(["a'b'c"]);
	});

	it("collapses repeated whitespace", () => {
		expect(tokenizeArgs("a    b\tc")).toEqual(["a", "b", "c"]);
	});
});

describe("cli-args / stripQuotes", () => {
	it("strips single quotes", () => {
		expect(stripQuotes("'abc'")).toBe("abc");
	});

	it("strips double quotes", () => {
		expect(stripQuotes('"abc"')).toBe("abc");
	});

	it("leaves unquoted text unchanged", () => {
		expect(stripQuotes("abc")).toBe("abc");
	});

	it("does not strip mismatched quotes", () => {
		expect(stripQuotes("'abc")).toBe("'abc");
	});
});

describe("cli-args / parseFlags — long flags", () => {
	it("parses --flag value (space form)", () => {
		const { positionals, flags } = parseFlags(["--id", "og_a_1"]);
		expect(flags.get("id")).toEqual(["og_a_1"]);
		expect(positionals).toEqual([]);
	});

	it("parses --flag=value (equals form)", () => {
		const { positionals, flags } = parseFlags(["--id=og_a_1"]);
		expect(flags.get("id")).toEqual(["og_a_1"]);
		expect(positionals).toEqual([]);
	});

	it("does not consume a value that looks like a flag", () => {
		const { flags } = parseFlags(["--id", "--verbose"]);
		expect(flags.get("id")).toEqual([""]);
		expect(flags.get("verbose")).toEqual([""]);
	});

	it("collects positional tokens", () => {
		const { positionals, flags } = parseFlags(["build", "the", "feature"]);
		expect(positionals).toEqual(["build", "the", "feature"]);
		expect(flags.size).toBe(0);
	});

	it("keeps flag values that contain dashes when inline", () => {
		const { flags } = parseFlags(["--id=--weird--"]);
		expect(flags.get("id")).toEqual(["--weird--"]);
	});
});

describe("cli-args / parseFlags — short flags", () => {
	it("parses -f value (space form)", () => {
		const { positionals, flags } = parseFlags(["-b", "100", "obj"], { aliases: { b: "budget" } });
		expect(flags.get("budget")).toEqual(["100"]);
		expect(positionals).toEqual(["obj"]);
	});

	it("parses -f=value (equals form)", () => {
		const { flags } = parseFlags(["-b=100"], { aliases: { b: "budget" } });
		expect(flags.get("budget")).toEqual(["100"]);
	});

	it("parses a boolean cluster when no known filter is set", () => {
		const { flags } = parseFlags(["-abc"]);
		expect(flags.get("a")).toEqual([""]);
		expect(flags.get("b")).toEqual([""]);
		expect(flags.get("c")).toEqual([""]);
	});

	it("treats a bare dash as a positional value", () => {
		const { positionals } = parseFlags(["-"]);
		expect(positionals).toEqual(["-"]);
	});
});

describe("cli-args / parseFlags — terminator", () => {
	it("treats everything after -- as positional", () => {
		const { positionals, flags } = parseFlags(["--budget", "100", "--", "--budget", "stuff"], {
			aliases: { b: "budget" },
		});
		expect(flags.get("budget")).toEqual(["100"]);
		expect(positionals).toEqual(["--budget", "stuff"]);
	});
});

describe("cli-args / parseFlags — known filter", () => {
	it("only extracts known flags and preserves unknown dash tokens as positional", () => {
		const { positionals, flags } = parseFlags(["improve", "--verbose", "output"], { known: ["budget"] });
		expect(flags.has("budget")).toBe(false);
		expect(positionals).toEqual(["improve", "--verbose", "output"]);
	});

	it("still consumes a value for a known short flag via alias", () => {
		const { positionals, flags } = parseFlags(["-b", "100", "do", "it"], {
			aliases: { b: "budget" },
			known: ["budget"],
		});
		expect(flags.get("budget")).toEqual(["100"]);
		expect(positionals).toEqual(["do", "it"]);
	});

	it("preserves an unknown short cluster as positional when known is set", () => {
		const { positionals } = parseFlags(["-abc"], { known: ["budget"] });
		expect(positionals).toEqual(["-abc"]);
	});
});

describe("cli-args / parseFlags — repeats", () => {
	it("keeps multiple values for a repeated flag in order", () => {
		const { flags } = parseFlags(["--id", "a", "--id", "b"]);
		expect(flags.get("id")).toEqual(["a", "b"]);
	});
});
