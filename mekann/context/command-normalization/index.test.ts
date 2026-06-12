import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import commandNormalization from "./index.js";
import { featureBooleanValue, isFeatureEnabled } from "../../settings/enabled.js";

let cwd: string | undefined;

afterEach(async () => {
	if (cwd) await rm(cwd, { recursive: true, force: true });
	cwd = undefined;
});

describe("command-normalization settings compatibility", () => {
	it("honors deprecated output-budget settings as aliases", async () => {
		cwd = await mkdtemp(join(tmpdir(), "mekann-command-normalization-alias-"));
		await mkdir(join(cwd, ".pi"), { recursive: true });
		await writeFile(join(cwd, ".pi", "mekann.json"), JSON.stringify({
			version: 1,
			features: { "output-budget": { enabled: false, bashEnabled: false, recordNormalization: true } },
		}, null, 2));

		expect(isFeatureEnabled("command-normalization", cwd)).toBe(false);
		expect(featureBooleanValue("command-normalization", "bashEnabled", true, cwd)).toBe(false);
		expect(featureBooleanValue("command-normalization", "recordNormalization", false, cwd)).toBe(true);
	});

	it("lets command-normalization settings override deprecated output-budget aliases", async () => {
		cwd = await mkdtemp(join(tmpdir(), "mekann-command-normalization-alias-"));
		await mkdir(join(cwd, ".pi"), { recursive: true });
		await writeFile(join(cwd, ".pi", "mekann.json"), JSON.stringify({
			version: 1,
			features: {
				"output-budget": { enabled: false, bashEnabled: false },
				"command-normalization": { enabled: true, bashEnabled: true },
			},
		}, null, 2));

		expect(isFeatureEnabled("command-normalization", cwd)).toBe(true);
		expect(featureBooleanValue("command-normalization", "bashEnabled", false, cwd)).toBe(true);
	});
});

describe("command-normalization recording", () => {
	it("records original command, normalized command, and result byte metrics only when enabled", async () => {
		cwd = await mkdtemp(join(tmpdir(), "mekann-command-normalization-"));
		await mkdir(join(cwd, ".pi"), { recursive: true });
		await writeFile(join(cwd, ".pi", "mekann.json"), JSON.stringify({
			version: 1,
			features: { "command-normalization": { recordNormalization: true } },
		}, null, 2));

		const handlers: Record<string, Function> = {};
		commandNormalization({ on: (name: string, handler: Function) => { handlers[name] = handler; } } as any);

		const call = { toolName: "bash", toolCallId: "tc_rec_1", input: { command: "rg needle src" } };
		await handlers.tool_call(call, { cwd });
		expect(call.input.command).toBe("rg -n -H -0 --no-heading needle src");

		const raw = "src/a.ts\u000010:needle one\nsrc/b.ts\u000020:needle two\n";
		const result = await handlers.tool_result({ toolName: "bash", toolCallId: "tc_rec_1", content: [{ type: "text", text: raw }], isError: false }, { cwd });
		expect(result).toBeUndefined();

		const log = await readFile(join(cwd, ".mekann", "command-normalization", "normalization.jsonl"), "utf8");
		const record = JSON.parse(log.trim());
		expect(record).toMatchObject({
			version: 1,
			toolCallId: "tc_rec_1",
			kind: "grep",
			originalCommand: "rg needle src",
			normalizedCommand: "rg -n -H -0 --no-heading needle src",
			changed: true,
			result: { outputBytes: Buffer.byteLength(raw), isError: false },
		});
		expect(record.result).not.toHaveProperty("compacted");
		expect(record.result).not.toHaveProperty("compactBytes");
		expect(log).not.toContain("needle one");
	});
});
