/**
 * sandbox パッケージの依存関係（package.json）の構成テスト。
 */

import { describe, it, expect } from "vitest";

describe("package.json dependencies", () => {
	it("peerDependencies に @earendil-works/pi-coding-agent が含まれる", async () => {
		const pkg = await import("../package.json", { assert: { type: "json" } });
		expect(pkg.default.peerDependencies).toBeDefined();
		expect(pkg.default.peerDependencies["@earendil-works/pi-coding-agent"]).toBeDefined();
	});

	it("devDependencies に typescript が含まれる", async () => {
		const pkg = await import("../package.json", { assert: { type: "json" } });
		expect(pkg.default.devDependencies.typescript).toBeDefined();
	});

	it("devDependencies に @types/node が含まれる", async () => {
		const pkg = await import("../package.json", { assert: { type: "json" } });
		expect(pkg.default.devDependencies["@types/node"]).toBeDefined();
	});
});

