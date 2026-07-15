import { describe, expect, it, vi } from "vitest";
import type { MutationPolicyRunner } from "./mutation-policy.js";
import { bindApprovedMutation, describeMutation, formatMutationIntent, MUTATING_ACTIONS, resolveMutationIntent } from "./mutation-policy.js";

function runner(overrides: Partial<MutationPolicyRunner> = {}): MutationPolicyRunner {
	return {
		git: overrides.git ?? (async (args) => ({ stdout: args[0] === "branch" ? "issue-7\n" : "git@github.com:my-fork/repo.git\n", stderr: "" })),
		gh: overrides.gh ?? (async () => ({ stdout: JSON.stringify({ nameWithOwner: "upstream/repo", url: "https://github.com/upstream/repo" }), stderr: "" })),
		withTempFile: overrides.withTempFile ?? (async (content, use) => use(`/tmp/${content.length}.txt`)),
	};
}

describe("mutation policy", () => {
	it("derives the complete mutating action set from the policy table", () => {
		expect([...MUTATING_ACTIONS]).toEqual([
			"commit", "push", "create_pr", "update_pr", "ready", "comment", "issue_comment", "promote_to_ready_for_agent", "demote_to_ready_for_human",
		]);
	});

	it("describes remote and force mode", () => {
		const description = describeMutation({ action: "push", remote: "upstream", force_with_lease: true });
		expect(description).toContain("remote=upstream");
		expect(description).toContain("force-with-lease=true");
	});

	it("resolves a push from its concrete remote", async () => {
		const intent = await resolveMutationIntent({ action: "push", remote: "origin" }, "/repo", runner());
		expect(intent).toMatchObject({ repository: "my-fork/repo", remoteUrl: "git@github.com:my-fork/repo.git", branch: "issue-7" });
		expect(formatMutationIntent(intent)).toContain("Repository: my-fork/repo");
	});

	it("uses an explicit upstream PR URL instead of the fork remote", async () => {
		const gh = vi.fn(async () => { throw new Error("explicit URL must not require lookup"); });
		const intent = await resolveMutationIntent({ action: "ready", pr: "https://github.com/upstream/repo/pull/7" }, "/repo", runner({ gh }));
		expect(intent).toMatchObject({ repository: "upstream/repo", targetUrl: "https://github.com/upstream/repo/pull/7" });
		expect(gh).not.toHaveBeenCalled();
	});

	it("does not require local git state for an explicit remote issue action", async () => {
		const git = vi.fn(async () => { throw new Error("git must not be queried"); });
		const intent = await resolveMutationIntent({ action: "issue_comment", issue: 42, body: "body" }, "/outside-git", runner({ git }));
		expect(intent).toMatchObject({ kind: "github", action: "issue_comment", repository: "upstream/repo" });
		expect("branch" in intent).toBe(false);
		expect(git).not.toHaveBeenCalled();
	});

	it("fails closed when an implicit GitHub target cannot be resolved", async () => {
		const gh = vi.fn(async () => { throw new Error("network failure"); });
		await expect(resolveMutationIntent({ action: "ready" }, "/repo", runner({ gh }))).rejects.toThrow("network failure");
	});

	it("binds approved GitHub execution to the confirmed repository and PR URL", async () => {
		const base = runner();
		const intent = await resolveMutationIntent({ action: "ready", pr: "https://github.com/upstream/repo/pull/7" }, "/repo", base);
		const bound = bindApprovedMutation(base, intent);
		expect(bound.params).toMatchObject({ action: "ready", pr: "https://github.com/upstream/repo/pull/7" });
		const gh = vi.spyOn(base, "gh");
		await bound.runner.gh(["pr", "ready", "https://github.com/upstream/repo/pull/7"], "/repo");
		expect(gh).toHaveBeenCalledWith(["--repo", "upstream/repo", "pr", "ready", "https://github.com/upstream/repo/pull/7"], "/repo");
	});

	it("binds push execution to the confirmed remote URL", async () => {
		const base = runner();
		const intent = await resolveMutationIntent({ action: "push" }, "/repo", base);
		const bound = bindApprovedMutation(base, intent);
		expect(bound.params).toMatchObject({ action: "push", remote: "git@github.com:my-fork/repo.git" });
	});
});
