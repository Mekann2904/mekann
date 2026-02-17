/**
 * Tests for Search Extension Constants
 */

import { describe, it, expect } from "vitest";
import {
	DEFAULT_EXCLUDES,
	DEFAULT_LIMIT,
	DEFAULT_CODE_SEARCH_LIMIT,
	DEFAULT_SYMBOL_LIMIT,
	DEFAULT_IGNORE_CASE,
	DEFAULT_MAX_DEPTH,
	INDEX_DIR_NAME,
	SYMBOL_INDEX_FILE,
	INDEX_META_FILE,
	INDEX_MANIFEST_FILE,
	SHARD_DIR_NAME,
	MAX_ENTRIES_PER_SHARD,
	DEFAULT_CLI_TIMEOUT,
	DEFAULT_MAX_OUTPUT_SIZE,
	type DefaultExclude,
} from "../../../.pi/extensions/search/utils/constants.js";

describe("DEFAULT_EXCLUDES", () => {
	it("should be an array of strings", () => {
		expect(Array.isArray(DEFAULT_EXCLUDES)).toBe(true);
		expect(DEFAULT_EXCLUDES.length).toBeGreaterThan(0);
		for (const item of DEFAULT_EXCLUDES) {
			expect(typeof item).toBe("string");
		}
	});

	it("should include common exclusion patterns", () => {
		expect(DEFAULT_EXCLUDES).toContain("node_modules");
		expect(DEFAULT_EXCLUDES).toContain(".git");
		expect(DEFAULT_EXCLUDES).toContain("dist");
		expect(DEFAULT_EXCLUDES).toContain("build");
	});

	it("should include framework-specific directories", () => {
		expect(DEFAULT_EXCLUDES).toContain(".next");
		expect(DEFAULT_EXCLUDES).toContain(".nuxt");
	});

	it("should include language-specific directories", () => {
		expect(DEFAULT_EXCLUDES).toContain("vendor");
		expect(DEFAULT_EXCLUDES).toContain("__pycache__");
	});

	it("should include minified file patterns", () => {
		expect(DEFAULT_EXCLUDES).toContain("*.min.js");
		expect(DEFAULT_EXCLUDES).toContain("*.min.css");
	});

	it("should include pi-specific directories", () => {
		expect(DEFAULT_EXCLUDES).toContain(".pi/search");
		expect(DEFAULT_EXCLUDES).toContain(".pi/analytics");
	});

	it("should be readonly (as const)", () => {
		// Type check: if this compiles, the array is properly typed as const
		const excludes: readonly DefaultExclude[] = DEFAULT_EXCLUDES;
		expect(excludes).toBeDefined();
	});
});

describe("DEFAULT_LIMIT", () => {
	it("should be a positive number", () => {
		expect(typeof DEFAULT_LIMIT).toBe("number");
		expect(DEFAULT_LIMIT).toBeGreaterThan(0);
	});

	it("should have a reasonable default value", () => {
		expect(DEFAULT_LIMIT).toBe(100);
	});
});

describe("DEFAULT_CODE_SEARCH_LIMIT", () => {
	it("should be a positive number", () => {
		expect(typeof DEFAULT_CODE_SEARCH_LIMIT).toBe("number");
		expect(DEFAULT_CODE_SEARCH_LIMIT).toBeGreaterThan(0);
	});

	it("should be less than or equal to DEFAULT_LIMIT", () => {
		expect(DEFAULT_CODE_SEARCH_LIMIT).toBeLessThanOrEqual(DEFAULT_LIMIT);
	});
});

describe("DEFAULT_SYMBOL_LIMIT", () => {
	it("should be a positive number", () => {
		expect(typeof DEFAULT_SYMBOL_LIMIT).toBe("number");
		expect(DEFAULT_SYMBOL_LIMIT).toBeGreaterThan(0);
	});
});

describe("DEFAULT_IGNORE_CASE", () => {
	it("should be a boolean", () => {
		expect(typeof DEFAULT_IGNORE_CASE).toBe("boolean");
	});

	it("should default to true for better usability", () => {
		expect(DEFAULT_IGNORE_CASE).toBe(true);
	});
});

describe("DEFAULT_MAX_DEPTH", () => {
	it("should be undefined (unlimited by default)", () => {
		expect(DEFAULT_MAX_DEPTH).toBeUndefined();
	});
});

describe("Index Configuration Constants", () => {
	it("INDEX_DIR_NAME should be a valid path", () => {
		expect(typeof INDEX_DIR_NAME).toBe("string");
		expect(INDEX_DIR_NAME).toBe(".pi/search");
	});

	it("SYMBOL_INDEX_FILE should have .jsonl extension", () => {
		expect(SYMBOL_INDEX_FILE).toBe("symbols.jsonl");
		expect(SYMBOL_INDEX_FILE.endsWith(".jsonl")).toBe(true);
	});

	it("INDEX_META_FILE should have .json extension", () => {
		expect(INDEX_META_FILE).toBe("index-meta.json");
		expect(INDEX_META_FILE.endsWith(".json")).toBe(true);
	});

	it("INDEX_MANIFEST_FILE should have .json extension", () => {
		expect(INDEX_MANIFEST_FILE).toBe("manifest.json");
		expect(INDEX_MANIFEST_FILE.endsWith(".json")).toBe(true);
	});

	it("SHARD_DIR_NAME should be a valid directory name", () => {
		expect(SHARD_DIR_NAME).toBe("symbols");
	});

	it("MAX_ENTRIES_PER_SHARD should be a positive number", () => {
		expect(typeof MAX_ENTRIES_PER_SHARD).toBe("number");
		expect(MAX_ENTRIES_PER_SHARD).toBeGreaterThan(0);
		expect(MAX_ENTRIES_PER_SHARD).toBe(10000);
	});
});

describe("CLI Configuration Constants", () => {
	it("DEFAULT_CLI_TIMEOUT should be a positive number in milliseconds", () => {
		expect(typeof DEFAULT_CLI_TIMEOUT).toBe("number");
		expect(DEFAULT_CLI_TIMEOUT).toBeGreaterThan(0);
		expect(DEFAULT_CLI_TIMEOUT).toBe(30000);
	});

	it("DEFAULT_MAX_OUTPUT_SIZE should be a positive number in bytes", () => {
		expect(typeof DEFAULT_MAX_OUTPUT_SIZE).toBe("number");
		expect(DEFAULT_MAX_OUTPUT_SIZE).toBeGreaterThan(0);
		expect(DEFAULT_MAX_OUTPUT_SIZE).toBe(10 * 1024 * 1024); // 10MB
	});
});

describe("Type exports", () => {
	it("DefaultExclude type should be compatible with DEFAULT_EXCLUDES items", () => {
		// This test verifies type compatibility at compile time
		const first: DefaultExclude = DEFAULT_EXCLUDES[0];
		expect(typeof first).toBe("string");
	});
});
