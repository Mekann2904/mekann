import { describe, expect, it } from "vitest";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { recordToolOutputArtifact } from "../recording.js";
import { readEvents } from "./store.js";

async function tmp(): Promise<string> {
	return fsp.mkdtemp(path.join(os.tmpdir(), "context-recording-"));
}

describe("context recording", () => {
	it("records a tool output artifact as a context event", async () => {
		const cwd = await tmp();

		await recordToolOutputArtifact({
			cwd,
			toolName: "bash",
			artifactId: "og_test_1",
			originalBytes: 1234,
			originalLines: 56,
			sessionId: "sess_1",
			turnId: "turn_1",
			toolCallId: "tool_1",
			branchId: "branch_1",
		});

		const events = await readEvents(cwd);
		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({
			kind: "tool_result",
			priority: 3,
			title: "bash output stored",
			summary: "Large bash output stored as og_test_1 (1234 bytes, 56 lines)",
			evidenceLevel: "tool_reported",
			sessionId: "sess_1",
			turnId: "turn_1",
			toolCallId: "tool_1",
		});
		expect(events[0].refs).toEqual([{ type: "artifact", value: "og_test_1", role: "output" }]);
		expect(events[0].scope?.branchId).toBe("branch_1");
	});

	it("records error artifacts with higher priority", async () => {
		const cwd = await tmp();

		await recordToolOutputArtifact({
			cwd,
			toolName: "bash",
			artifactId: "og_test_2",
			originalBytes: 10,
			originalLines: 1,
			isError: true,
		});

		const events = await readEvents(cwd);
		expect(events[0].priority).toBe(1);
	});

	it("does not throw when recording fails", async () => {
		await expect(recordToolOutputArtifact({
			cwd: "/dev/null/not-a-directory",
			toolName: "bash",
			artifactId: "og_test_3",
			originalBytes: 10,
			originalLines: 1,
		})).resolves.toBeUndefined();
	});
});
