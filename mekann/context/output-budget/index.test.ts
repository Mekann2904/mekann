import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import outputBudget from "./index.js";

let cwd: string | undefined;

afterEach(async () => {
	if (cwd) await rm(cwd, { recursive: true, force: true });
	cwd = undefined;
});

describe("output-budget normalization recording", () => {
	it("records original command, normalized command, and result byte metrics only when enabled", async () => {
		cwd = await mkdtemp(join(tmpdir(), "mekann-output-budget-"));
		await mkdir(join(cwd, ".pi"), { recursive: true });
		await writeFile(join(cwd, ".pi", "mekann.json"), JSON.stringify({
			version: 1,
			features: { "output-budget": { recordNormalization: true } },
		}, null, 2));

		const handlers: Record<string, Function> = {};
		outputBudget({ on: (name: string, handler: Function) => { handlers[name] = handler; } } as any);

		const call = { toolName: "bash", toolCallId: "tc_rec_1", input: { command: "rg needle src" } };
		await handlers.tool_call(call, { cwd });
		expect(call.input.command).toBe("rg -n -H -0 --no-heading needle src");

		const raw = "src/a.ts\u000010:needle one\nsrc/b.ts\u000020:needle two\n";
		const result = await handlers.tool_result({ toolName: "bash", toolCallId: "tc_rec_1", content: [{ type: "text", text: raw }], isError: false }, { cwd });
		expect(result).toBeUndefined();

		const log = await readFile(join(cwd, ".mekann", "output-budget", "normalization.jsonl"), "utf8");
		const record = JSON.parse(log.trim());
		expect(record).toMatchObject({
			version: 1,
			toolCallId: "tc_rec_1",
			kind: "grep",
			originalCommand: "rg needle src",
			normalizedCommand: "rg -n -H -0 --no-heading needle src",
			changed: true,
			result: { originalBytes: Buffer.byteLength(raw), compacted: false, isError: false },
		});
		expect(record.result.compactBytes).toBeUndefined();
		expect(log).not.toContain("needle one");
	});
});
