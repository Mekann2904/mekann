import { describe, expect, it, vi } from "vitest";

vi.mock("../../../context/tool-output/index.js", () => ({
	gateTextForLlm: vi.fn(async () => { throw new Error("output gate unavailable"); }),
	redactSecrets: vi.fn((text: string) => ({ text, redacted: false })),
}));

import { formatSandboxedBashOutputForLlm } from "../output.js";

describe("formatSandboxedBashOutputForLlm", () => {
	it("falls back to normal truncation when output-gate throws", async () => {
		const result = await formatSandboxedBashOutputForLlm({
			cwd: process.cwd(),
			command: "echo hello",
			output: "hello",
		});

		expect(result.shown.text).toBe("hello");
		expect(result.shown.truncated).toBe(false);
		expect(result.outputGate).toMatchObject({
			stored: false,
			bytes: 5,
			lines: 1,
			redacted: true,
			formattingError: "output gate unavailable",
		});
	});
});
