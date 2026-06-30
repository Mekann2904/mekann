/**
 * runner/artifacts.test.ts — 成果物ディレクトリと manifest の focused test。
 * {@link "./artifacts.js"} を直接 import して単体検証する。
 *
 * 特に manifest.json の body 不変量 (stdout/stderr/output/parsedMetrics を含まない)
 * を直接検証する — これは秘密情報・巨大ログの manifest への漏洩を防ぐ重要な性質。
 */
import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ChecksResult, RunResult } from "./types.js";
import {
	createRunArtifactDir,
	getRunArtifactDir,
	loadRunFromArtifact,
	writeChecksArtifacts,
	writeRunArtifacts,
} from "./artifacts.js";

function makeResult(overrides: Partial<RunResult> = {}): RunResult {
	return {
		command: "echo run",
		exitCode: 0,
		durationSeconds: 1.5,
		timedOut: false,
		passed: true,
		output: "OUTPUT-BODY-MARKER",
		parsedMetrics: { latency_ms: 42 },
		checks: { passed: null, timedOut: false, output: "", stdout: "", stderr: "", durationSeconds: 0 },
		stdout: "STDOUT-BODY-MARKER",
		stderr: "STDERR-BODY-MARKER",
		signal: null,
		externalRunId: null,
		externalArtifactDir: null,
		externalSummaryPath: null,
		externalViewlogPath: null,
		externalMetricsPath: null,
		logFilesWritten: false,
		streamError: null,
		...overrides,
	};
}

describe("artifacts manifest", () => {
	it("getRunArtifactDir nests under .pi/autoresearch/<session>/runs/<piRunId>", () => {
		const dir = getRunArtifactDir("/cwd", "sess", "run-1");
		expect(dir).toBe(path.join("/cwd", ".pi", "autoresearch", "sess", "runs", "run-1"));
	});

	it("createRunArtifactDir throws if the run dir already exists", () => {
		const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "runner-art-dup-"));
		const piRunId = "pi-1";
		createRunArtifactDir(cwd, "sess", piRunId, "cmd", Date.now());
		expect(() => createRunArtifactDir(cwd, "sess", piRunId, "cmd", Date.now())).toThrow(/already exists/);
	});

	it("writeRunArtifacts never embeds log bodies in manifest.json", () => {
		const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "runner-art-leak-"));
		const piRunId = "pi-leak";
		const startedAt = 1_700_000_000_000;
		const runDir = createRunArtifactDir(cwd, "sess", piRunId, "echo run", startedAt);
		writeRunArtifacts(runDir, makeResult(), piRunId, startedAt, startedAt + 1500, 3);

		const manifest = JSON.parse(fs.readFileSync(path.join(runDir, "manifest.json"), "utf8"));
		// Bodies must NOT leak into the manifest metadata.
		expect(JSON.stringify(manifest)).not.toContain("STDOUT-BODY-MARKER");
		expect(JSON.stringify(manifest)).not.toContain("STDERR-BODY-MARKER");
		expect(JSON.stringify(manifest)).not.toContain("OUTPUT-BODY-MARKER");
		// Metadata fields ARE present.
		expect(manifest.command).toBe("echo run");
		expect(manifest.piRunId).toBe(piRunId);
		expect(manifest.runSeq).toBe(3);
		expect(manifest.exitCode).toBe(0);
	});

	it("stdout.log/stderr.log contain the (redacted) bodies, metrics.json contains parsedMetrics", () => {
		const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "runner-art-files-"));
		const piRunId = "pi-files";
		const t = Date.now();
		const runDir = createRunArtifactDir(cwd, "sess", piRunId, "echo run", t);
		writeRunArtifacts(runDir, makeResult(), piRunId, t, t + 1);

		expect(fs.readFileSync(path.join(runDir, "stdout.log"), "utf8")).toContain("STDOUT-BODY-MARKER");
		expect(fs.readFileSync(path.join(runDir, "stderr.log"), "utf8")).toContain("STDERR-BODY-MARKER");
		const metrics = JSON.parse(fs.readFileSync(path.join(runDir, "metrics.json"), "utf8"));
		expect(metrics).toEqual({ latency_ms: 42 });
	});

	it("writeChecksArtifacts marks the manifest complete with a body-free checks summary", () => {
		const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "runner-art-checks-"));
		const piRunId = "pi-checks";
		const t = Date.now();
		const runDir = createRunArtifactDir(cwd, "sess", piRunId, "echo run", t);
		writeRunArtifacts(runDir, makeResult({ logFilesWritten: true }), piRunId, t, t + 1);

		const checks: ChecksResult = {
			passed: true,
			timedOut: false,
			output: "CHECKS-OUTPUT-MARKER",
			stdout: "CHECKS-STDOUT-MARKER",
			stderr: "",
			durationSeconds: 2,
		};
		writeChecksArtifacts(runDir, checks);

		const manifest = JSON.parse(fs.readFileSync(path.join(runDir, "manifest.json"), "utf8"));
		expect(manifest.artifactComplete).toBe(true);
		expect(manifest.checks).toBeDefined();
		expect(manifest.checks.passed).toBe(true);
		// checks summary is metadata only — bodies stay in checks-result.json.
		expect(JSON.stringify(manifest)).not.toContain("CHECKS-OUTPUT-MARKER");
		expect(JSON.stringify(manifest)).not.toContain("CHECKS-STDOUT-MARKER");
		expect(fs.readFileSync(path.join(runDir, "checks-result.json"), "utf8")).toContain("CHECKS-OUTPUT-MARKER");
	});

	it("loadRunFromArtifact round-trips metadata and reads checks/metrics from their own files", () => {
		const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "runner-art-load-"));
		const piRunId = "pi-load";
		const startedAt = 1_700_000_001_000;
		const runDir = createRunArtifactDir(cwd, "sess", piRunId, "echo run", startedAt);
		writeRunArtifacts(runDir, makeResult(), piRunId, startedAt, startedAt + 1500, 7);
		writeChecksArtifacts(runDir, { passed: false, timedOut: true, output: "o", stdout: "so", stderr: "se", durationSeconds: 9 });

		const loaded = loadRunFromArtifact(cwd, "sess", piRunId);
		expect(loaded).not.toBeNull();
		expect(loaded!.runSeq).toBe(7);
		expect(loaded!.result.command).toBe("echo run");
		expect(loaded!.result.parsedMetrics).toEqual({ latency_ms: 42 });
		expect(loaded!.result.checks.passed).toBe(false);
		expect(loaded!.result.checks.timedOut).toBe(true);
	});

	it("loadRunFromArtifact returns null when the manifest is missing", () => {
		const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "runner-art-missing-"));
		expect(loadRunFromArtifact(cwd, "sess", "nope")).toBeNull();
	});
});
