/**
 * Tests for issue_workflow tool registration, argument validation, and
 * action dispatch (via a mock CommandRunner — no node-module mocking).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ISSUE_WORKFLOW_ACTIONS } from "./schemas.js";
import { validateActionArgs, executeAction, MUTATING_ACTIONS, type CommandRunner, type ExecOut } from "./actions.js";

// ── Mock CommandRunner ───────────────────────────────────────────────

type Call = { kind: "git" | "gh"; args: string[] };

function createMockRunner(opts: {
	git?: (args: string[]) => ExecOut;
	gh?: (args: string[]) => ExecOut;
}): { runner: CommandRunner; calls: Call[]; tempFiles: string[] } {
	const calls: Call[] = [];
	const tempFiles: string[] = [];
	const git = opts.git ?? (() => ({ stdout: "", stderr: "" }));
	const gh = opts.gh ?? (() => ({ stdout: "", stderr: "" }));
	const runner: CommandRunner = {
		async git(args) {
			calls.push({ kind: "git", args });
			return git(args);
		},
		async gh(args) {
			calls.push({ kind: "gh", args });
			return gh(args);
		},
		async withTempFile(content, use) {
			const fp = `/tmp/fake-${tempFiles.length}.txt`;
			tempFiles.push(fp);
			// Stash content so tests can assert message integrity.
			(runner as unknown as { __lastContent?: string }).__lastContent = content;
			return use(fp);
		},
	};
	return { runner, calls, tempFiles };
}

// ── validateActionArgs ───────────────────────────────────────────────

describe("schema/runtime drift", () => {
	it("every ISSUE_WORKFLOW_ACTIONS value validates as a known action", () => {
		// Catches drift between the explicit schema union and the runtime tuple.
		for (const action of ISSUE_WORKFLOW_ACTIONS) {
			const err = validateActionArgs({ action });
			expect(err === null || !/Unknown issue_workflow action/.test(err)).toBe(true);
		}
		expect(ISSUE_WORKFLOW_ACTIONS).toHaveLength(11);
	});
});

describe("validateActionArgs", () => {
	it("rejects a missing action", () => {
		expect(validateActionArgs({})).toMatch(/requires an 'action'/);
	});

	it("requires message for commit", () => {
		expect(validateActionArgs({ action: "commit" })).toMatch(/commit.*message/);
		expect(validateActionArgs({ action: "commit", message: "x" })).toBeNull();
	});

	it("requires title and body for create_pr", () => {
		expect(validateActionArgs({ action: "create_pr", title: "t" })).toMatch(/body/);
		expect(validateActionArgs({ action: "create_pr", body: "b" })).toMatch(/title/);
		expect(validateActionArgs({ action: "create_pr", title: "t", body: "b" })).toBeNull();
	});

	it("requires at least one of title/body for update_pr", () => {
		expect(validateActionArgs({ action: "update_pr" })).toMatch(/title.*body|body.*title/);
		expect(validateActionArgs({ action: "update_pr", title: "t" })).toBeNull();
		expect(validateActionArgs({ action: "update_pr", body: "b" })).toBeNull();
	});

	it("requires body for comment and issue_comment", () => {
		expect(validateActionArgs({ action: "comment" })).toMatch(/body/);
		expect(validateActionArgs({ action: "issue_comment" })).toMatch(/body/);
	});

	it("accepts read-only and push/ready with no extra fields", () => {
		for (const action of ["current_branch", "status", "diff", "view_pr", "push", "ready"] as const) {
			expect(validateActionArgs({ action })).toBeNull();
		}
	});

	it("rejects fields that do not belong to the selected action", () => {
		expect(validateActionArgs({ action: "status", message: "should not be here" })).toMatch(/does not accept field/);
		expect(validateActionArgs({ action: "push", title: "not a PR" })).toMatch(/does not accept field/);
		expect(validateActionArgs({ action: "create_pr", title: "t", body: "b", files: ["x.ts"] })).toMatch(/does not accept field/);
	});
});

// ── executeAction: mutating actions gated to issue worktree ──────────

describe("executeAction worktree gate", () => {
	it("blocks commit when not on an issue-<n> branch", async () => {
		const { runner } = createMockRunner({
			git: () => ({ stdout: "main\n", stderr: "" }),
		});
		const result = await executeAction({ action: "commit", message: "x" }, "/repo", runner);
		expect(result.isError).toBe(true);
		expect(result.text).toMatch(/only allowed inside an issue worktree/);
	});

	it("runs commit on an issue-<n> branch", async () => {
		const git = vi.fn((args: string[]): ExecOut => {
			if (args[0] === "branch" && args[1] === "--show-current") return { stdout: "issue-54\n", stderr: "" };
			if (args[0] === "commit") return { stdout: "[issue-54 abc] done", stderr: "" };
			return { stdout: "", stderr: "" };
		});
		const { runner } = createMockRunner({ git });
		const result = await executeAction({ action: "commit", message: "feat: x" }, "/repo", runner);
		expect(result.isError).toBe(false);
		expect(result.text).toContain("[issue-54 abc] done");
	});

	it("read-only status works outside an issue worktree", async () => {
		const { runner } = createMockRunner({
			git: () => ({ stdout: " M file.ts\n", stderr: "" }),
		});
		const result = await executeAction({ action: "status" }, "/repo", runner);
		expect(result.isError).toBe(false);
		expect(result.text).toContain("file.ts");
	});

	it("every non-status action is classified as mutating vs read-only consistently", () => {
		const mutating = ["commit", "push", "create_pr", "update_pr", "ready", "comment", "issue_comment"];
		const readonly = ["current_branch", "status", "diff", "view_pr"];
		for (const a of mutating) expect(MUTATING_ACTIONS.has(a as never)).toBe(true);
		for (const a of readonly) expect(MUTATING_ACTIONS.has(a as never)).toBe(false);
		expect(ISSUE_WORKFLOW_ACTIONS).toHaveLength(11);
	});
});

// ── executeAction: message integrity via temp file ──────────────────

describe("executeAction message safety", () => {
	it("passes commit message verbatim via temp file (-F), no shell quoting", async () => {
		const git = vi.fn((args: string[]): ExecOut => {
			if (args[0] === "branch" && args[1] === "--show-current") return { stdout: "issue-1\n", stderr: "" };
			if (args[0] === "commit") {
				// The commit args must use -F <tmpfile>, never -m with the raw message.
				expect(args).toContain("-F");
				expect(args).not.toContain("-m");
				return { stdout: "ok", stderr: "" };
			}
			return { stdout: "", stderr: "" };
		});
		const { runner } = createMockRunner({ git });
		const tricky = "feat: handle $VAR `code` and\n```ts\nconst x = 1;\n```\n";
		const result = await executeAction({ action: "commit", message: tricky }, "/repo", runner);
		expect(result.isError).toBe(false);
		expect((runner as unknown as { __lastContent?: string }).__lastContent).toBe(tricky);
	});

	it("stages files then commits when files are provided", async () => {
		const seen: string[][] = [];
		const git = vi.fn((args: string[]): ExecOut => {
			seen.push(args);
			if (args[0] === "branch" && args[1] === "--show-current") return { stdout: "issue-9\n", stderr: "" };
			return { stdout: "", stderr: "" };
		});
		const { runner } = createMockRunner({ git });
		await executeAction({ action: "commit", message: "m", files: ["a.ts", "b.ts"] }, "/repo", runner);
		const add = seen.find((a) => a[0] === "add");
		expect(add).toEqual(["add", "--", "a.ts", "b.ts"]);
		const commit = seen.find((a) => a[0] === "commit");
		expect(commit && commit.includes("--amend")).toBe(false);
	});

	it("uses --amend when amend is set", async () => {
		const seen: string[][] = [];
		const git = vi.fn((args: string[]): ExecOut => {
			seen.push(args);
			if (args[0] === "branch" && args[1] === "--show-current") return { stdout: "issue-9\n", stderr: "" };
			return { stdout: "", stderr: "" };
		});
		const { runner } = createMockRunner({ git });
		await executeAction({ action: "commit", message: "m", amend: true }, "/repo", runner);
		const commit = seen.find((a) => a[0] === "commit");
		expect(commit && commit.includes("--amend")).toBe(true);
	});
});

// ── executeAction: push ──────────────────────────────────────────────

describe("executeAction push", () => {
	it("pushes current branch to origin by default without force", async () => {
		const seen: string[][] = [];
		const git = vi.fn((args: string[]): ExecOut => {
			seen.push(args);
			if (args[0] === "branch" && args[1] === "--show-current") return { stdout: "issue-7\n", stderr: "" };
			if (args[0] === "push") return { stdout: "", stderr: "To github.com" };
			return { stdout: "", stderr: "" };
		});
		const { runner } = createMockRunner({ git });
		const result = await executeAction({ action: "push" }, "/repo", runner);
		expect(result.isError).toBe(false);
		const push = seen.find((a) => a[0] === "push");
		expect(push).toEqual(["push", "origin", "issue-7"]);
	});

	it("supports --force-with-lease and custom remote", async () => {
		const seen: string[][] = [];
		const git = vi.fn((args: string[]): ExecOut => {
			seen.push(args);
			if (args[0] === "branch" && args[1] === "--show-current") return { stdout: "issue-7\n", stderr: "" };
			return { stdout: "", stderr: "" };
		});
		const { runner } = createMockRunner({ git });
		await executeAction({ action: "push", remote: "upstream", force_with_lease: true }, "/repo", runner);
		const push = seen.find((a) => a[0] === "push");
		expect(push).toEqual(["push", "--force-with-lease", "upstream", "issue-7"]);
	});
});

// ── executeAction: create_pr ─────────────────────────────────────────

describe("executeAction create_pr", () => {
	it("passes body via --body-file and title verbatim", async () => {
		const seen: string[][] = [];
		const git = vi.fn((args: string[]): ExecOut => {
			seen.push(args);
			if (args[0] === "branch" && args[1] === "--show-current") return { stdout: "issue-1\n", stderr: "" };
			return { stdout: "", stderr: "" };
		});
		const gh = vi.fn((args: string[]): ExecOut => {
			seen.push(args);
			if (args[0] === "pr" && args[1] === "create") return { stdout: "https://github.com/o/r/pull/1\n", stderr: "" };
			return { stdout: "", stderr: "" };
		});
		const { runner } = createMockRunner({ git, gh });
		const body = "## Summary\ncontains `code` and $VAR\n";
		const result = await executeAction({ action: "create_pr", title: "feat: `x`", body }, "/repo/wt", runner);
		expect(result.isError).toBe(false);
		const create = seen.find((a) => a[0] === "pr" && a[1] === "create");
		expect(create).toBeDefined();
		expect(create && create.includes("--body-file")).toBe(true);
		expect(create && create.includes("--title") && create.includes("feat: `x`")).toBe(true);
		expect((runner as unknown as { __lastContent?: string }).__lastContent).toBe(body);
		expect(result.details.url).toBe("https://github.com/o/r/pull/1");
	});

	it("supports --base and --draft", async () => {
		const seen: string[][] = [];
		const git = vi.fn((args: string[]): ExecOut => {
			seen.push(args);
			if (args[0] === "branch" && args[1] === "--show-current") return { stdout: "issue-1\n", stderr: "" };
			return { stdout: "", stderr: "" };
		});
		const gh = vi.fn((args: string[]): ExecOut => {
			seen.push(args);
			return { stdout: "url\n", stderr: "" };
		});
		const { runner } = createMockRunner({ git, gh });
		await executeAction({ action: "create_pr", title: "t", body: "b", base: "develop", draft: true }, "/repo", runner);
		const create = seen.find((a) => a[0] === "pr" && a[1] === "create");
		expect(create && create.includes("--base") && create.includes("develop")).toBe(true);
		expect(create && create.includes("--draft")).toBe(true);
	});
});

// ── executeAction: issue_comment ─────────────────────────────────────

describe("executeAction issue_comment", () => {
	it("derives issue number from the issue worktree branch", async () => {
		const seen: string[][] = [];
		const git = vi.fn((args: string[]): ExecOut => {
			seen.push(args);
			if (args[0] === "branch" && args[1] === "--show-current") return { stdout: "issue-42\n", stderr: "" };
			return { stdout: "", stderr: "" };
		});
		const gh = vi.fn((args: string[]): ExecOut => {
			seen.push(args);
			return { stdout: "https://github.com/o/r/issues/42#issuecomment-1\n", stderr: "" };
		});
		const { runner } = createMockRunner({ git, gh });
		const result = await executeAction({ action: "issue_comment", body: "update" }, "/repo", runner);
		expect(result.isError).toBe(false);
		const comment = seen.find((a) => a[0] === "issue" && a[1] === "comment");
		expect(comment && comment[2]).toBe("42");
		expect(comment && comment.includes("--body-file")).toBe(true);
	});

	it("uses an explicit issue number when provided", async () => {
		const seen: string[][] = [];
		const git = vi.fn((args: string[]): ExecOut => {
			seen.push(args);
			if (args[0] === "branch" && args[1] === "--show-current") return { stdout: "issue-7\n", stderr: "" };
			return { stdout: "", stderr: "" };
		});
		const gh = vi.fn((args: string[]): ExecOut => {
			seen.push(args);
			return { stdout: "", stderr: "" };
		});
		const { runner } = createMockRunner({ git, gh });
		await executeAction({ action: "issue_comment", issue: 99, body: "x" }, "/repo", runner);
		const comment = seen.find((a) => a[0] === "issue" && a[1] === "comment");
		expect(comment && comment[2]).toBe("99");
	});

	it("is blocked by the worktree gate when not on an issue branch", async () => {
		const { runner } = createMockRunner({
			git: () => ({ stdout: "main\n", stderr: "" }),
		});
		const result = await executeAction({ action: "issue_comment", body: "x" }, "/repo", runner);
		expect(result.isError).toBe(true);
		expect(result.text).toMatch(/only allowed inside an issue worktree/);
	});
});

// ── executeAction: view_pr + error handling ──────────────────────────

describe("executeAction view_pr and errors", () => {
	it("formats mergeability status from gh", async () => {
		const gh = vi.fn((args: string[]): ExecOut => {
			if (args[0] === "pr" && args[1] === "view") {
				return {
					stdout: JSON.stringify({
						url: "https://github.com/o/r/pull/5",
						mergeStateStatus: "BLOCKED",
						mergeable: "CONFLICTING",
						baseRefName: "main",
						headRefName: "issue-5",
					}),
					stderr: "",
				};
			}
			return { stdout: "", stderr: "" };
		});
		const { runner } = createMockRunner({ gh });
		const result = await executeAction({ action: "view_pr", pr: "5" }, "/repo", runner);
		expect(result.isError).toBe(false);
		expect(result.text).toContain("mergeStateStatus=BLOCKED");
		expect(result.text).toContain("BLOCKED/needs attention");
		expect(result.details).toMatchObject({ verdict: "blocked" });
	});

	it("classifies UNKNOWN as pending (not blocked) per ADR-0022", async () => {
		const gh = vi.fn((args: string[]): ExecOut => {
			if (args[0] === "pr" && args[1] === "view") {
				return {
					stdout: JSON.stringify({
						url: "https://github.com/o/r/pull/5",
						mergeStateStatus: "UNKNOWN",
						mergeable: "UNKNOWN",
						baseRefName: "main",
						headRefName: "issue-5",
						statusCheckRollup: [],
					}),
					stderr: "",
				};
			}
			return { stdout: "", stderr: "" };
		});
		const { runner } = createMockRunner({ gh });
		const result = await executeAction({ action: "view_pr", pr: "5" }, "/repo", runner);
		expect(result.isError).toBe(false);
		expect(result.text).toContain("mergeStateStatus=UNKNOWN");
		expect(result.text).toContain("checks still running");
		expect(result.text).not.toContain("BLOCKED/needs attention");
		expect(result.details).toMatchObject({ verdict: "pending" });
	});

	it("classifies mergeable UNSTABLE as mergeableUnstable (not blocked) per ADR-0022", async () => {
		const gh = vi.fn((args: string[]): ExecOut => {
			if (args[0] === "pr" && args[1] === "view") {
				return {
					stdout: JSON.stringify({
						url: "https://github.com/o/r/pull/5",
						mergeStateStatus: "UNSTABLE",
						mergeable: "MERGEABLE",
						baseRefName: "main",
						headRefName: "issue-5",
						statusCheckRollup: [],
					}),
					stderr: "",
				};
			}
			return { stdout: "", stderr: "" };
		});
		const { runner } = createMockRunner({ gh });
		const result = await executeAction({ action: "view_pr", pr: "5" }, "/repo", runner);
		expect(result.isError).toBe(false);
		expect(result.text).toContain("mergeStateStatus=UNSTABLE");
		expect(result.text).toContain("mergeable (non-required checks unstable)");
		expect(result.text).not.toContain("BLOCKED/needs attention");
		expect(result.details).toMatchObject({ verdict: "mergeableUnstable" });
	});

	it("classifies UNSTABLE with in-flight checks as pending (not blocked)", async () => {
		const gh = vi.fn((args: string[]): ExecOut => {
			if (args[0] === "pr" && args[1] === "view") {
				return {
					stdout: JSON.stringify({
						url: "https://github.com/o/r/pull/5",
						mergeStateStatus: "UNSTABLE",
						mergeable: "MERGEABLE",
						baseRefName: "main",
						headRefName: "issue-5",
						statusCheckRollup: [{ __typename: "CheckRun", status: "IN_PROGRESS", conclusion: null }],
					}),
					stderr: "",
				};
			}
			return { stdout: "", stderr: "" };
		});
		const { runner } = createMockRunner({ gh });
		const result = await executeAction({ action: "view_pr", pr: "5" }, "/repo", runner);
		expect(result.isError).toBe(false);
		expect(result.text).toContain("checks still running");
		expect(result.text).not.toContain("BLOCKED/needs attention");
		expect(result.details).toMatchObject({ verdict: "pending" });
	});

	it("turns command failure into a structured error result", async () => {
		const { runner } = createMockRunner({
			git: () => {
				const e = new Error("fail") as Error & { stderr: string; stdout: string; code: number };
				e.stderr = "nothing to commit";
				e.stdout = "";
				e.code = 1;
				throw e;
			},
		});
		const result = await executeAction({ action: "commit", message: "m" }, "/repo", runner);
		// On issue branch, gate passes; commit then fails.
		expect(result.isError).toBe(true);
	});
});

// ── Tool registration (prepareArguments + execute wiring) ───────────

describe("issue_workflow tool registration", () => {
	it("does not register the tool outside an issue-work Pi session", async () => {
		const pi: { tools: Record<string, unknown>; registerTool: (t: unknown) => void } = {
			tools: {},
			registerTool: (t) => {
				const def = t as { name: string };
				pi.tools[def.name] = def;
			},
		};
		const prev = process.env.MEKANN_ISSUE_PI;
		delete process.env.MEKANN_ISSUE_PI;
		try {
			const { default: issueWorkflowExtension } = await import("./index.js");
			// isFeatureEnabled defaults to enabled when settings absent, so only the
			// issue-work-Pi marker gate prevents registration here.
			issueWorkflowExtension(pi as never);
			expect(pi.tools["issue_workflow"]).toBeUndefined();
		} finally {
			if (prev === undefined) delete process.env.MEKANN_ISSUE_PI;
			else process.env.MEKANN_ISSUE_PI = prev;
		}
	});

	it("does not register the tool in a subagent / review-fixer child Pi even with the marker", async () => {
		// A review-fixer / subagent child is launched with --copy-env, so it
		// inherits MEKANN_ISSUE_PI=1 from its Issue Work Pi parent. The child
		// must not run git/PR actions (Phase 3 is the parent's job), so the
		// PI_SUBAGENT_ROLE=child guard must take precedence over the marker.
		const pi: { tools: Record<string, unknown>; registerTool: (t: unknown) => void } = {
			tools: {},
			registerTool: (t) => {
				const def = t as { name: string };
				pi.tools[def.name] = def;
			},
		};
		const prevIssuePi = process.env.MEKANN_ISSUE_PI;
		const prevRole = process.env.PI_SUBAGENT_ROLE;
		process.env.MEKANN_ISSUE_PI = "1";
		process.env.PI_SUBAGENT_ROLE = "child";
		try {
			const { default: issueWorkflowExtension } = await import("./index.js");
			issueWorkflowExtension(pi as never);
			expect(pi.tools["issue_workflow"]).toBeUndefined();
		} finally {
			if (prevIssuePi === undefined) delete process.env.MEKANN_ISSUE_PI;
			else process.env.MEKANN_ISSUE_PI = prevIssuePi;
			if (prevRole === undefined) delete process.env.PI_SUBAGENT_ROLE;
			else process.env.PI_SUBAGENT_ROLE = prevRole;
		}
	});

	it("registers with name issue_workflow and validates in prepareArguments", async () => {
		const pi: { tools: Record<string, { prepareArguments: (a: unknown) => unknown }>; registerTool: (t: unknown) => void } = {
			tools: {},
			registerTool: (t) => {
				const def = t as { name: string; prepareArguments: (a: unknown) => unknown };
				pi.tools[def.name] = def;
			},
		};
		const prev = process.env.MEKANN_ISSUE_PI;
		process.env.MEKANN_ISSUE_PI = "1";
		try {
			const { default: issueWorkflowExtension } = await import("./index.js");
			// isFeatureEnabled defaults to enabled when settings absent.
			issueWorkflowExtension(pi as never);
		} finally {
			if (prev === undefined) delete process.env.MEKANN_ISSUE_PI;
			else process.env.MEKANN_ISSUE_PI = prev;
		}
		expect(pi.tools["issue_workflow"]).toBeDefined();
		expect(() => pi.tools["issue_workflow"].prepareArguments({ action: "commit" })).toThrow(/message/);
		expect(() => pi.tools["issue_workflow"].prepareArguments({})).toThrow(/action/);
		expect(pi.tools["issue_workflow"].prepareArguments({ action: "status" })).toEqual({ action: "status" });
	});
});
