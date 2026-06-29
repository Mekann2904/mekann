import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `gh api` calls resolve via promisify(execFile), so the mock must pass a single
// { stdout, stderr } value (NOT separate positional args) for the awaited
// destructure `const { stdout } = await execFileAsync(...)` to work.
const execFileMock = vi.fn((_cmd: string, _args: string[], _opts: unknown, cb: (err: Error | null, value?: unknown) => void) => {
	// Default: never resolves. Each test sets its own behaviour via
	// mockImplementation[Once]; counting is done with toHaveBeenCalledTimes.
});

vi.mock("node:child_process", () => ({ execFile: execFileMock }));

const { isTransientGhAuthError, getIssueDependencyStatus } = await import("./github.js");

// Fake only `setTimeout` so the transient-auth retry backoff doesn't burn real
// wall-clock time, while leaving microtasks (Promise resolution) untouched so
// the mocked execFile still resolves synchronously as before.
beforeEach(() => {
	vi.useFakeTimers({ toFake: ["setTimeout"] });
});

afterEach(() => {
	vi.useRealTimers();
	execFileMock.mockReset();
});

describe("isTransientGhAuthError", () => {
	// The observed real message from the failing autopilot was
	// `gh: Bad credentials (HTTP 401)`, caused by a sibling `gh` process racing
	// the OAuth token refresh (the refresh token rotates and invalidates peers).
	it.each([
		["gh: Bad credentials (HTTP 401)"],
		["HTTP 401: invalid token"],
		["Unauthorized"],
		["unauthorised"],
		[new Error("Bad credentials")],
		[{ message: "Bad credentials" }],
	])("returns true for %s", (value) => {
		expect(isTransientGhAuthError(value)).toBe(true);
	});

	it.each([
		["Not Found (HTTP 404)"],
		["rate limit exceeded (HTTP 403)"],
		["network timeout"],
		[new Error("ENOENT")],
		[undefined],
		[null],
		[""],
	])("returns false for %s", (value) => {
		expect(isTransientGhAuthError(value)).toBe(false);
	});
});

describe("getIssueDependencyStatus", () => {
	it("returns parsed dependencies on the first success", async () => {
		execFileMock.mockImplementationOnce((_c, _a, _o, cb) => {
			cb(null, {
				stdout: JSON.stringify([
					{ number: 42, title: "Blocker A", state: "open", html_url: "https://example/42" },
					{ number: 7, title: "Blocker B", state: "closed", html_url: "https://example/7" },
				]),
			});
		});

		const status = await getIssueDependencyStatus("owner/repo", 100);

		expect(execFileMock).toHaveBeenCalledTimes(1);
		expect(status.error).toBeUndefined();
		expect(status.blockedBy.map((d) => d.number)).toEqual([42, 7]);
		expect(status.openBlockers.map((d) => d.number)).toEqual([42]);
	});

	it("retries on a transient 401 (OAuth-refresh race) and succeeds", async () => {
		// First attempt: the refresh-token race invalidates our token mid-flight.
		execFileMock.mockImplementationOnce((_c, _a, _o, cb) => cb(new Error("gh: Bad credentials (HTTP 401)")));
		// Second attempt: a sibling gh completed the refresh; our call now works.
		execFileMock.mockImplementationOnce((_c, _a, _o, cb) => cb(null, { stdout: "[]" }));

		const pending = getIssueDependencyStatus("owner/repo", 166);
		// Advance the first-retry backoff delay (TRANSIENT_AUTH_BASE_DELAY_MS).
		await vi.advanceTimersByTimeAsync(1500);
		const status = await pending;

		// A transient auth error must NOT surface as a hard failure: it absorbs
		// into a retry so one candidate's race doesn't drop the whole snapshot.
		expect(execFileMock).toHaveBeenCalledTimes(2);
		expect(status.error).toBeUndefined();
		expect(status.blockedBy).toEqual([]);
	});

	it("does NOT retry a non-auth failure (e.g. 404) and reports the error", async () => {
		execFileMock.mockImplementation((_c, _a, _o, cb) => cb(new Error("gh: Not Found (HTTP 404)")));

		const status = await getIssueDependencyStatus("owner/repo", 171);

		// A genuine endpoint/permission problem must not be papered over: the
		// safe-side behaviour (report error, let the caller gate on it) is kept.
		expect(execFileMock).toHaveBeenCalledTimes(1);
		expect(status.error).toMatch(/Failed to read issue dependencies/);
		expect(status.blockedBy).toEqual([]);
	});

	it("exhausts the transient-auth retry budget and then reports the error", async () => {
		execFileMock.mockImplementation((_c, _a, _o, cb) => cb(new Error("gh: Bad credentials (HTTP 401)")));

		const pending = getIssueDependencyStatus("owner/repo", 166);
		// First retry delay (1500ms) then second retry delay (3000ms) both elapse.
		await vi.advanceTimersByTimeAsync(1500);
		await vi.advanceTimersByTimeAsync(3000);
		const status = await pending;

		// Tried the initial call + the two bounded retries, then gave up safely.
		expect(execFileMock).toHaveBeenCalledTimes(3);
		expect(status.error).toMatch(/Bad credentials/);
		expect(status.blockedBy).toEqual([]);
	});
});
