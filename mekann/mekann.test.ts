import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const MEKANN = path.join(ROOT, "mekann");

function read(rel: string): string {
	return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("mekann integrated extension", () => {
	it("root package exposes only the integrated mekann extension", () => {
		const pkg = JSON.parse(read("package.json"));
		expect(pkg.pi.extensions).toEqual(["./mekann"]);
		expect(pkg.pi.skills).toContain("./mekann/skills");
	});

	it("has suite entrypoints", () => {
		for (const rel of ["index.ts", "core/index.ts", "safety/index.ts", "autonomy/index.ts", "utils/index.ts"]) {
			expect(fs.existsSync(path.join(MEKANN, rel))).toBe(true);
		}
	});

	it("loads suites in the intended top-level order", () => {
		const source = read("mekann/index.ts");
		const calls = [...source.matchAll(/await (core|safety|autonomy|utils)\(pi\);/g)].map((m) => m[1]);
		expect(calls).toEqual(["core", "safety", "autonomy", "utils"]);
	});

	it("loads sandbox before plan-mode inside safety", () => {
		const source = read("mekann/safety/index.ts");
		expect(source.indexOf("sandbox(pi);")).toBeLessThan(source.indexOf("planMode(pi);"));
	});

	it("keeps autonomy modules in goal, subagent, autoresearch order", () => {
		const source = read("mekann/autonomy/index.ts");
		const calls = [...source.matchAll(/await (goal|subagent|autoresearch)\(pi\);/g)].map((m) => m[1]);
		expect(calls).toEqual(["goal", "subagent", "autoresearch"]);
	});
});
