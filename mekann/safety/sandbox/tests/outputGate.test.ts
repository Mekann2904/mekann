import { describe, expect, it } from "vitest";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { gateTextForLlm, readManifest } from "../../../context/output-gate/store.js";

describe("sandbox output-gate integration helper", () => {
	it("can gate full sandboxed bash output before legacy truncation", async () => {
		const cwd = await fsp.mkdtemp(path.join(os.tmpdir(), "sandbox-og-"));
		const large = Array.from({ length: 200 }, (_, i) => `line ${i} needle`).join("\n");
		const gated = await gateTextForLlm({
			cwd,
			toolName: "bash",
			text: large,
			source: { kind: "sandboxed_bash", command: "printf large" },
			maxInlineBytes: 100,
			previewBytes: 80,
		});
		expect(gated.gated).toBe(true);
		expect(gated.text).toContain("[output-gate]");
		const manifest = await readManifest(cwd);
		expect(manifest[0].source).toEqual({ kind: "sandboxed_bash", command: "printf large" });
	});
});
