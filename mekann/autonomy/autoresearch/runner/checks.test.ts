/**
 * runner/checks.test.ts — runChecks (autoresearch.checks.sh 実行) の focused test。
 * {@link "./checks.js"} を直接 import して単体検証する。
 */
import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { runChecks } from "./checks.js";

describe("runChecks", () => {
	it("returns { passed: null } when autoresearch.checks.sh does not exist", async () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "runner-checks-none-"));
		const result = await runChecks(dir);
		expect(result.passed).toBeNull();
		expect(result.timedOut).toBe(false);
		expect(result.output).toBe("");
		expect(result.durationSeconds).toBe(0);
	});

	it("runs the checks script and reports pass when it exits 0", async () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "runner-checks-pass-"));
		fs.writeFileSync(path.join(dir, "autoresearch.checks.sh"), "#!/bin/bash\necho ok\n", "utf8");
		const result = await runChecks(dir);
		expect(result.passed).toBe(true);
		expect(result.stdout).toContain("ok");
	});

	it("reports failure when the checks script exits non-zero", async () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "runner-checks-fail-"));
		fs.writeFileSync(path.join(dir, "autoresearch.checks.sh"), "#!/bin/bash\necho boom\nexit 3\n", "utf8");
		const result = await runChecks(dir);
		expect(result.passed).toBe(false);
		expect(result.exitCode ?? result.output).toBeTruthy();
	});
});
