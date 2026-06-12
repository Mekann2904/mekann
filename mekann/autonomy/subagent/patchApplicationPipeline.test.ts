import { describe, expect, it, vi, beforeEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PatchApplicationPipeline, type PatchApplicationDecision } from "./patchApplicationPipeline.js";
import type { GitPatchAdapter } from "./gitPatchAdapter.js";
import type { ValidationRunner } from "./validationRunner.js";
import type { SemanticConflictLogReader } from "./resultStoreAdapter.js";
import type {
	AgentMetadata,
	ApplyAgentResultsParams,
	PatchProposalResult,
	SemanticApplyLogEntry,
	StoredSubagentResult,
	SubagentResultV1,
	ValidationCommand,
	ValidationResult,
} from "./types.js";
import { SubagentResultStore } from "./resultStore.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAgent(overrides: Partial<AgentMetadata> = {}): AgentMetadata {
	return {
		agentId: "a1",
		sessionId: "s1",
		agentPath: "/root/task",
		status: "completed",
		createdAt: 1,
		updatedAt: 1,
		depth: 1,
		open: false,
		cancellationRequested: false,
		authority: {
			mode: "propose_patch",
			write_scope: ["src"],
			require_base_hash: false,
			max_patch_bytes: 50_000,
		},
		authorityEnforced: true,
		...overrides,
	};
}

function patch(overrides: Partial<PatchProposalResult> = {}): PatchProposalResult {
	return {
		schema: "subagent.result.v1",
		outcome: "patch",
		summary: "fix",
		patch: {
			format: "unified_diff",
			body: "diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-old\n+new\n",
		},
		base: { files: [] },
		scope: { allowed_paths: ["src"], touched_paths: ["src/a.ts"] },
		semantic: {
			reads: [],
			writes: [{ kind: "symbol", name: "X" }],
			assumptions: [],
			effects: [],
			public_surface_delta: [],
			risk: { level: "low" },
		},
		validation: { suggested: [] },
		...overrides,
	};
}

function patchWithBody(body: string, overrides: Partial<PatchProposalResult> = {}): PatchProposalResult {
	return patch({ patch: { format: "unified_diff", body }, ...overrides });
}

function mockGit(): GitPatchAdapter {
	return {
		check: vi.fn().mockResolvedValue(undefined),
		apply: vi.fn().mockResolvedValue(undefined),
		rollback: vi.fn().mockResolvedValue(undefined),
	};
}

function mockValidator(overrides: Partial<ValidationRunner> = {}): ValidationRunner {
	return {
		resolveRequiredChecks: vi
			.fn()
			.mockReturnValue({ ok: true, commands: [] as ValidationCommand[] }),
		dedupe: vi.fn((cmds: ValidationCommand[]) => cmds),
		isAllowed: vi.fn().mockReturnValue(true),
		run: vi.fn().mockResolvedValue({ ok: true, output: "" } as ValidationResult),
		runAll: vi.fn().mockResolvedValue([] as ValidationResult[]),
		...overrides,
	};
}

function mockSemanticLog(
	entries: SemanticApplyLogEntry[] = [],
): SemanticConflictLogReader {
	return { readSemanticLog: vi.fn().mockReturnValue(entries) };
}

function setup(overrides: {
	agent?: Partial<AgentMetadata>;
	git?: GitPatchAdapter;
	validator?: ValidationRunner;
	semanticLog?: SemanticConflictLogReader;
} = {}) {
	const dir = mkdtempSync(path.join(tmpdir(), "pipeline-"));
	const agent = makeAgent({ workspaceCwd: dir, ...overrides.agent });
	const store = new SubagentResultStore(dir);
	const git = overrides.git ?? mockGit();
	const validator = overrides.validator ?? mockValidator();
	const semanticLog = overrides.semanticLog ?? mockSemanticLog();
	const pipeline = new PatchApplicationPipeline({
		cwd: dir,
		patchRefRootDir: store.dir,
		git,
		validator,
		semanticLog,
	});
	const cleanup = () => {
		try { rmSync(dir, { recursive: true }); } catch { /* */ }
	};
	return { dir, store, pipeline, agent, git, validator, semanticLog, cleanup };
}

function saveAndLoad(
	store: SubagentResultStore,
	agent: AgentMetadata,
	result: SubagentResultV1,
): StoredSubagentResult {
	const stored = store.save(agent, result);
	// After save, patch body is written to disk and ref is set
	return store.load(stored.result_id);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PatchApplicationPipeline", () => {
	// 1. workspace mismatch → needs_review
	it("returns needs_review for workspace_cwd mismatch", async () => {
		const { pipeline, store, agent, cleanup } = setup();
		try {
			const otherDir = mkdtempSync(path.join(tmpdir(), "pipeline-other-"));
			try {
				const otherAgent = makeAgent({ workspaceCwd: otherDir });
				const stored = saveAndLoad(store, otherAgent, patch());
				const decision = await pipeline.apply({ stored, params: {} });
				expect(decision.kind).toBe("needs_review");
				if (decision.kind === "needs_review") {
					expect(decision.reason).toBe("workspace_cwd_mismatch");
					expect(decision.result_id).toBe(stored.result_id);
				}
			} finally { rmSync(otherDir, { recursive: true }); }
		} finally { cleanup(); }
	});

	// 2. no_change / observation → skipped
	it("returns skipped for no_change outcome", async () => {
		const { pipeline, store, agent, cleanup } = setup();
		try {
			const stored = saveAndLoad(store, agent, {
				schema: "subagent.result.v1",
				outcome: "no_change",
				summary: "nothing",
			} as any);
			const decision = await pipeline.apply({ stored, params: {} });
			expect(decision.kind).toBe("skipped");
			if (decision.kind === "skipped") expect(decision.reason).toBe("no_change");
		} finally { cleanup(); }
	});

	it("returns skipped for observation outcome", async () => {
		const { pipeline, store, agent, cleanup } = setup();
		try {
			const stored = saveAndLoad(store, agent, {
				schema: "subagent.result.v1",
				outcome: "observation",
				summary: "observed",
				findings: [],
			} as any);
			const decision = await pipeline.apply({ stored, params: {} });
			expect(decision.kind).toBe("skipped");
			if (decision.kind === "skipped") expect(decision.reason).toBe("observation");
		} finally { cleanup(); }
	});

	// 3. needs_decision → needs_review
	it("returns needs_review for needs_decision outcome", async () => {
		const { pipeline, store, agent, cleanup } = setup();
		try {
			const stored = saveAndLoad(store, agent, {
				schema: "subagent.result.v1",
				outcome: "needs_decision",
				question: "which approach?",
				options: ["a", "b"],
			} as any);
			const decision = await pipeline.apply({ stored, params: {} });
			expect(decision.kind).toBe("needs_review");
			if (decision.kind === "needs_review") expect(decision.reason).toBe("which approach?");
		} finally { cleanup(); }
	});

	// 4. blocked → rejected manual_reject
	it("returns rejected for blocked outcome", async () => {
		const { pipeline, store, agent, cleanup } = setup();
		try {
			const stored = saveAndLoad(store, agent, {
				schema: "subagent.result.v1",
				outcome: "blocked",
				reason: "can't proceed",
			} as any);
			const decision = await pipeline.apply({ stored, params: {} });
			expect(decision.kind).toBe("rejected");
			if (decision.kind === "rejected") expect(decision.reason).toBe("manual_reject");
		} finally { cleanup(); }
	});

	// 5. invalid patch ref → rejected invalid_patch_ref
	it("returns rejected for invalid patch ref", async () => {
		const { pipeline, store, agent, cleanup } = setup();
		try {
			const result = patch();
			// Don't save through store so no ref is written
			const stored = store.save(agent, result);
			// Manually clear the ref to simulate invalid
			const loaded = store.load(stored.result_id);
			(loaded.result as any).patch.ref = "/etc/passwd";
			const decision = await pipeline.apply({ stored: loaded, params: {} });
			expect(decision.kind).toBe("rejected");
			if (decision.kind === "rejected") expect(decision.reason).toBe("invalid_patch_ref");
		} finally { cleanup(); }
	});

	// 6. intake reject (patch_too_large)
	it("returns rejected for patch_too_large from intake", async () => {
		const { pipeline, store, agent, cleanup } = setup({
			agent: {
				authority: {
					mode: "propose_patch",
					write_scope: ["src"],
					require_base_hash: false,
					max_patch_bytes: 10,
				},
			},
		});
		try {
			const stored = saveAndLoad(store, agent, patch());
			const decision = await pipeline.apply({ stored, params: {} });
			expect(decision.kind).toBe("rejected");
			if (decision.kind === "rejected") expect(decision.reason).toBe("patch_too_large");
		} finally { cleanup(); }
	});

	// 7. intake review (authority_not_enforced)
	it("returns needs_review for authority_not_enforced from intake", async () => {
		const { pipeline, store, agent, cleanup } = setup({
			agent: { authorityEnforced: false },
		});
		try {
			const stored = saveAndLoad(store, agent, patch());
			const decision = await pipeline.apply({ stored, params: {} });
			expect(decision.kind).toBe("needs_review");
			if (decision.kind === "needs_review")
				expect(decision.reason).toContain("Authority was not enforced");
		} finally { cleanup(); }
	});

	// 8. empty write_scope
	it("returns needs_review when write_scope is empty", async () => {
		const { pipeline, store, agent, cleanup } = setup({
			agent: {
				authority: {
					mode: "propose_patch",
					write_scope: [],
					require_base_hash: false,
					max_patch_bytes: 50_000,
				},
			},
		});
		try {
			const stored = saveAndLoad(store, agent, patch());
			const decision = await pipeline.apply({ stored, params: {} });
			expect(decision.kind).toBe("needs_review");
			if (decision.kind === "needs_review")
				expect(decision.reason).toContain("write_scope is not specified");
		} finally { cleanup(); }
	});

	// 9. .husky paths
	it("returns needs_review for .husky paths", async () => {
		const { pipeline, store, agent, cleanup } = setup({
			agent: {
				authority: {
					mode: "propose_patch",
					write_scope: [".husky", "src"],
					require_base_hash: false,
					max_patch_bytes: 50_000,
				},
			},
		});
		try {
			const body = "diff --git a/.husky/pre-commit b/.husky/pre-commit\n--- a/.husky/pre-commit\n+++ b/.husky/pre-commit\n@@ -1 +1 @@\n-old\n+new\n";
			const stored = saveAndLoad(
				store,
				agent,
				patchWithBody(body, {
					scope: { allowed_paths: [".husky", "src"], touched_paths: [".husky/pre-commit"] },
				}),
			);
			const decision = await pipeline.apply({ stored, params: {} });
			expect(decision.kind).toBe("needs_review");
			if (decision.kind === "needs_review")
				expect(decision.reason).toContain("execution_sensitive_path");
		} finally { cleanup(); }
	});

	// 10. semantic require_regeneration
	it("returns rejected for require_regeneration from semantic conflict", async () => {
		const logEntry: SemanticApplyLogEntry = {
			result_id: "sar_old_1",
			agent_path: "/root/old",
			applied_at: Date.now(),
			reads: [],
			writes: [{ kind: "symbol", name: "X" }],
			assumptions: [],
			effects: [],
			public_surface_delta: [],
			validation_result: { ok: true },
		};
		const { pipeline, store, agent, cleanup } = setup({
			semanticLog: mockSemanticLog([logEntry]),
		});
		try {
			// Incoming reads X, existing writes X → require_regeneration
			const stored = saveAndLoad(
				store,
				agent,
				patch({
					semantic: {
						reads: [{ kind: "symbol", name: "X" }],
						writes: [],
						assumptions: [],
						effects: [],
						public_surface_delta: [],
						risk: { level: "low" },
					},
				}),
			);
			const decision = await pipeline.apply({ stored, params: {} });
			expect(decision.kind).toBe("rejected");
			if (decision.kind === "rejected") expect(decision.reason).toBe("require_regeneration");
		} finally { cleanup(); }
	});

	// 11. semantic require_review (write-write conflict)
	it("returns needs_review for write-write semantic conflict", async () => {
		const logEntry: SemanticApplyLogEntry = {
			result_id: "sar_old_1",
			agent_path: "/root/old",
			applied_at: Date.now(),
			reads: [],
			writes: [{ kind: "symbol", name: "X" }],
			assumptions: [],
			effects: [],
			public_surface_delta: [],
			validation_result: { ok: true },
		};
		const { pipeline, store, agent, cleanup } = setup({
			semanticLog: mockSemanticLog([logEntry]),
		});
		try {
			// Incoming also writes X → write-write conflict
			const stored = saveAndLoad(store, agent, patch());
			const decision = await pipeline.apply({ stored, params: {} });
			expect(decision.kind).toBe("needs_review");
			if (decision.kind === "needs_review")
				expect(decision.reason).toContain("write the same semantic target");
		} finally { cleanup(); }
	});

	// 12. high risk without allow_high_risk
	it("returns needs_review for high risk without allow_high_risk", async () => {
		const { pipeline, store, agent, cleanup } = setup();
		try {
			const stored = saveAndLoad(
				store,
				agent,
				patch({
					semantic: {
						reads: [],
						writes: [{ kind: "symbol", name: "X" }],
						assumptions: [],
						effects: [],
						public_surface_delta: [],
						risk: { level: "high" },
					},
				}),
			);
			const decision = await pipeline.apply({ stored, params: {} });
			expect(decision.kind).toBe("needs_review");
			if (decision.kind === "needs_review")
				expect(decision.reason).toContain("High semantic risk");
		} finally { cleanup(); }
	});

	// 13. required check missing mapping
	it("returns needs_review when required check has no command mapping", async () => {
		const { pipeline, store, agent, cleanup } = setup({
			validator: mockValidator({
				resolveRequiredChecks: vi.fn().mockReturnValue({
					ok: false,
					missing: [{ kind: "unit_test", target: "specific-test" }],
				}),
			}),
		});
		try {
			const stored = saveAndLoad(
				store,
				agent,
				patch({
					validation: {
						suggested: [],
						required: [{ kind: "unit_test", target: "specific-test" }],
					},
				}),
			);
			const decision = await pipeline.apply({ stored, params: {} });
			expect(decision.kind).toBe("needs_review");
			if (decision.kind === "needs_review")
				expect(decision.reason).toContain("no command mapping");
		} finally { cleanup(); }
	});

	// 14. validation command not allowed
	it("returns rejected for disallowed validation command", async () => {
		const { pipeline, store, agent, cleanup } = setup({
			validator: mockValidator({
				isAllowed: vi.fn().mockReturnValue(false),
			}),
		});
		try {
			const stored = saveAndLoad(
				store,
				agent,
				patch({
					validation: { suggested: [{ kind: "npm_script", script: "test" }] },
				}),
			);
			const decision = await pipeline.apply({ stored, params: {} });
			expect(decision.kind).toBe("rejected");
			if (decision.kind === "rejected")
				expect(decision.reason).toBe("validation_command_not_allowed");
		} finally { cleanup(); }
	});

	// 15. git check failure
	it("returns rejected when git check fails", async () => {
		const git = mockGit();
		(git.check as any).mockRejectedValue(new Error("patch does not apply"));
		const { pipeline, store, agent, cleanup } = setup({ git });
		try {
			const stored = saveAndLoad(store, agent, patch());
			const decision = await pipeline.apply({ stored, params: {} });
			expect(decision.kind).toBe("rejected");
			if (decision.kind === "rejected") expect(decision.reason).toBe("patch_check_failed");
		} finally { cleanup(); }
	});

	// 16. git apply failure
	it("returns rejected when git apply fails", async () => {
		const git = mockGit();
		(git.apply as any).mockRejectedValue(new Error("apply failed"));
		const { pipeline, store, agent, cleanup } = setup({ git });
		try {
			const stored = saveAndLoad(store, agent, patch());
			const decision = await pipeline.apply({ stored, params: {} });
			expect(decision.kind).toBe("rejected");
			if (decision.kind === "rejected") expect(decision.reason).toBe("patch_check_failed");
		} finally { cleanup(); }
	});

	// 17. validation failure triggers rollback when enabled
	it("rolls back patch on validation failure when rollback_on_failure is enabled", async () => {
		const git = mockGit();
		const validator = mockValidator({
			runAll: vi.fn().mockResolvedValue([{ ok: false, error: "test failed" } as ValidationResult]),
		});
		const { pipeline, store, agent, cleanup } = setup({ git, validator });
		try {
			const stored = saveAndLoad(
				store,
				agent,
				patch({
					validation: { suggested: [{ kind: "npm_script", script: "test" }] },
				}),
			);
			const decision = await pipeline.apply({
				stored,
				params: { rollback_on_failure: true },
			});
			expect(decision.kind).toBe("rejected");
			if (decision.kind === "rejected") expect(decision.reason).toBe("validation_failed");
			expect(git.rollback).toHaveBeenCalledTimes(1);
		} finally { cleanup(); }
	});

	// 18. no rollback when rollback_on_failure === false
	it("does not rollback when rollback_on_failure is false", async () => {
		const git = mockGit();
		const validator = mockValidator({
			runAll: vi.fn().mockResolvedValue([{ ok: false, error: "test failed" } as ValidationResult]),
		});
		const { pipeline, store, agent, cleanup } = setup({ git, validator });
		try {
			const stored = saveAndLoad(
				store,
				agent,
				patch({
					validation: { suggested: [{ kind: "npm_script", script: "test" }] },
				}),
			);
			const decision = await pipeline.apply({
				stored,
				params: { rollback_on_failure: false },
			});
			expect(decision.kind).toBe("rejected");
			expect(git.rollback).not.toHaveBeenCalled();
		} finally { cleanup(); }
	});

	// 19. exception after apply triggers review with rollback metadata
	it("returns needs_review with rollback metadata on exception after patch applied", async () => {
		const git = mockGit();
		const validator = mockValidator();
		// Throw after apply succeeds
		(validator.dedupe as any).mockImplementation(() => {
			throw new Error("unexpected crash");
		});
		const { pipeline, store, agent, cleanup } = setup({ git, validator });
		try {
			const stored = saveAndLoad(store, agent, patch());
			const decision = await pipeline.apply({ stored, params: {} });
			expect(decision.kind).toBe("needs_review");
			if (decision.kind === "needs_review") {
				expect(decision.reason).toBe("apply_engine_exception");
				expect((decision.details as any).patch_applied).toBe(false);
			}
		} finally { cleanup(); }
	});

	// 20. success — returns applied with record and semantic log
	it("returns applied with record and semantic log on success", async () => {
		const { pipeline, store, agent, cleanup } = setup();
		try {
			const stored = saveAndLoad(store, agent, patch());
			const decision = await pipeline.apply({ stored, params: {} });
			expect(decision.kind).toBe("applied");
			if (decision.kind === "applied") {
				expect(decision.record.result_id).toBe(stored.result_id);
				expect(decision.record.agent_path).toBe("/root/task");
				expect(decision.record.applied_at).toBeGreaterThan(0);
				expect(decision.record.patch_ref).toBeDefined();
				expect(decision.semanticLog.result_id).toBe(stored.result_id);
				expect(decision.semanticLog.writes).toEqual([{ kind: "symbol", name: "X" }]);
			}
		} finally { cleanup(); }
	});

	// 21. exception after patch applied triggers rollback
	it("attempts rollback when exception occurs after patch is applied", async () => {
		const git = mockGit();
		const validator = mockValidator();
		// Make runAll throw after apply succeeds
		(validator.runAll as any).mockImplementation(() => {
			throw new Error("validation crashed");
		});
		const { pipeline, store, agent, cleanup } = setup({ git, validator });
		try {
			const stored = saveAndLoad(
				store,
				agent,
				patch({
					validation: { suggested: [{ kind: "npm_script", script: "test" }] },
				}),
			);
			const decision = await pipeline.apply({ stored, params: {} });
			expect(decision.kind).toBe("needs_review");
			if (decision.kind === "needs_review") {
				expect(decision.reason).toBe("apply_engine_exception_after_patch_applied");
				expect((decision.details as any).patch_applied).toBe(true);
				expect((decision.details as any).rollback_attempted).toBe(true);
			}
			expect(git.rollback).toHaveBeenCalledTimes(1);
		} finally { cleanup(); }
	});
});
