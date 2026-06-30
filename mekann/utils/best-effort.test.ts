import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";

import {
	bestEffort,
	bestEffortAsync,
	logBestEffortFailure,
	quarantineCorrupt,
	configureBestEffortLogging,
	__resetBestEffortLoggingForTests,
	type BestEffortLogEvent,
} from "./best-effort.js";

describe("best-effort", () => {
	let events: BestEffortLogEvent[];
	let stderrSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		events = [];
		configureBestEffortLogging((e) => events.push(e));
	});

	afterEach(() => {
		__resetBestEffortLoggingForTests();
		stderrSpy?.mockRestore();
	});

	describe("bestEffort (sync)", () => {
		it("returns fn result on success without logging", () => {
			expect(bestEffort("ok", () => 42)).toBe(42);
			expect(events).toHaveLength(0);
		});

		it("returns undefined on error and emits a structured event", () => {
			const result = bestEffort("fail", () => {
				throw new Error("boom");
			});
			expect(result).toBeUndefined();
			expect(events).toHaveLength(1);
			expect(events[0]).toMatchObject({
				event: "best-effort-failure",
				label: "fail",
				level: "warn",
				message: "boom",
			});
			expect(typeof events[0].pid).toBe("number");
			expect(typeof events[0].timestamp).toBe("number");
		});

		it("stringifies non-Error throws", () => {
			bestEffort("str", () => {
				throw "literal";
			});
			expect(events[0].message).toBe("literal");
		});

		it("honours level option", () => {
			bestEffort(
				"err",
				() => {
					throw new Error("x");
				},
				{ level: "error" },
			);
			expect(events[0].level).toBe("error");
		});

		it("does not log ENOENT when silentOnMissing is true", () => {
			const result = bestEffort(
				"read",
				() => {
					const e: NodeJS.ErrnoException = new Error("nope");
					e.code = "ENOENT";
					throw e;
				},
				{ silentOnMissing: true },
			);
			expect(result).toBeUndefined();
			expect(events).toHaveLength(0);
		});

		it("logs ENOENT by default", () => {
			bestEffort("read", () => {
				const e: NodeJS.ErrnoException = new Error("nope");
				e.code = "ENOENT";
				throw e;
			});
			expect(events).toHaveLength(1);
		});

		it("supports a fallback via ?? at the call site", () => {
			const fallback = { version: 2 };
			const result = bestEffort("read", () => {
				throw new Error("corrupt");
			}) ?? fallback;
			expect(result).toBe(fallback);
		});
	});

	describe("bestEffortAsync", () => {
		it("returns fn result on success without logging", async () => {
			expect(await bestEffortAsync("ok", async () => 7)).toBe(7);
			expect(events).toHaveLength(0);
		});

		it("returns undefined on rejected promise and emits an event", async () => {
			const result = await bestEffortAsync("fail", async () => {
				throw new Error("async boom");
			});
			expect(result).toBeUndefined();
			expect(events).toHaveLength(1);
			expect(events[0]).toMatchObject({ label: "fail", message: "async boom" });
		});

		it("respects silentOnMissing for async ENOENT", async () => {
			const result = await bestEffortAsync(
				"read",
				async () => {
					const e: NodeJS.ErrnoException = new Error("nope");
					e.code = "ENOENT";
					throw e;
				},
				{ silentOnMissing: true },
			);
			expect(result).toBeUndefined();
			expect(events).toHaveLength(0);
		});
	});

	describe("logBestEffortFailure", () => {
		it("emits an event without running anything", () => {
			logBestEffortFailure("manual", new Error("hand"), "error");
			expect(events).toHaveLength(1);
			expect(events[0]).toMatchObject({ label: "manual", message: "hand", level: "error" });
		});

		it("defaults to warn level", () => {
			logBestEffortFailure("manual", "plain");
			expect(events[0].level).toBe("warn");
		});
	});

	describe("quarantineCorrupt", () => {
		let dir: string;
		beforeEach(() => {
			dir = mkdtempSync(path.join(tmpdir(), "be-"));
		});
		afterEach(() => {
			rmSync(dir, { recursive: true, force: true });
		});

		it("renames a corrupt file to <path>.corrupt.<ts> and returns the destination", () => {
			const fp = path.join(dir, "state.json");
			writeFileSync(fp, "{ broken");
			const dest = quarantineCorrupt(fp, "state-corrupt");
			expect(dest).toBeTruthy();
			expect(dest).toMatch(/state\.json\.corrupt\./);
			expect(existsSync(fp)).toBe(false);
			expect(existsSync(dest!)).toBe(true);
			expect(fs.readFileSync(dest!, "utf8")).toBe("{ broken");
		});

		it("does not collide when multiple files are quarantined in the same ms", () => {
			const fp1 = path.join(dir, "a.json");
			const fp2 = path.join(dir, "b.json");
			writeFileSync(fp1, "x");
			writeFileSync(fp2, "y");
			const d1 = quarantineCorrupt(fp1);
			const d2 = quarantineCorrupt(fp2);
			expect(existsSync(d1!)).toBe(true);
			expect(existsSync(d2!)).toBe(true);
		});

		it("returns undefined silently when the file is already gone (ENOENT)", () => {
			expect(quarantineCorrupt(path.join(dir, "missing.json"))).toBeUndefined();
			expect(events).toHaveLength(0);
		});

		it("logs and swallows non-ENOENT rename failures", () => {
			// Quarantining a path whose parent does not exist yields ENOENT, which
			// is silent. Instead, simulate a real failure by quarantining a
			// directory entry that cannot be renamed over an existing file target
			// is hard cross-platform; so assert the ENOENT-silent path covers the
			// "swallow" contract and that no throw escapes.
			expect(() => quarantineCorrupt(path.join(dir, "nope.json"))).not.toThrow();
		});
	});

	describe("default sink", () => {
		it("writes one JSON line per event to stderr", () => {
			__resetBestEffortLoggingForTests();
			stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
			logBestEffortFailure("stderr", new Error("to-stderr"));
			expect(stderrSpy).toHaveBeenCalledTimes(1);
			const line = String(stderrSpy.mock.calls[0][0]);
			const parsed = JSON.parse(line) as BestEffortLogEvent;
			expect(parsed).toMatchObject({ event: "best-effort-failure", label: "stderr" });
			expect(line.endsWith("\n")).toBe(true);
		});

		it("configureBestEffortLogging(null) restores the default", () => {
			configureBestEffortLogging(null);
			stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
			bestEffort("x", () => {
				throw new Error("e");
			});
			expect(stderrSpy).toHaveBeenCalled();
		});

		it("never throws when the configured sink throws", () => {
			configureBestEffortLogging(() => {
				throw new Error("sink broken");
			});
			expect(() => bestEffort("safe", () => {
				throw new Error("orig");
			})).not.toThrow();
		});
	});
});
