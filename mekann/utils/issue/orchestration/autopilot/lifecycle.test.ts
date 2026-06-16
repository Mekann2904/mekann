import { describe, expect, it, vi } from "vitest";
import { decideAutopilotStep, runAutopilotSupervisor, DEFAULT_AUTOPILOT_CONFIG, type AutopilotLoopHooks, type AutopilotSupervisorConfig } from "./lifecycle.js";
import type { AutopilotDeps, AutopilotChildBrief } from "./collector.js";
import type { AutopilotChildState } from "./state.js";

/* --------------------------------- fakes --------------------------------- */

interface FakeWorld {
	issues: AutopilotChildBrief[];
	prExists: Set<number>;
	active: Set<number>;
	worktrees: Set<number>;
	blockers: Map<number, number[]>;
	labelExists: boolean;
}

function brief(n: number): AutopilotChildBrief {
	return { number: n, title: `#${n}`, url: `https://example/${n}`, labels: ["ready-for-agent"] };
}

function makeWorld(issues: number[]): FakeWorld {
	return {
		issues: issues.map(brief),
		prExists: new Set(),
		active: new Set(),
		worktrees: new Set(),
		blockers: new Map(),
		labelExists: true,
	};
}

function fakeDeps(world: FakeWorld): AutopilotDeps {
	// `hasActiveWorkPi` is idempotent (reads the current pane set), matching real
	// Kitty behavior, so the snapshot poll and the wait loops see the same truth.
	return {
		async listReadyForAgentIssues() {
			return world.issues;
		},
		async getDependencyStatus(n) {
			return { openBlockers: world.blockers.get(n) ?? [] };
		},
		async getPrExists(n) {
			return world.prExists.has(n);
		},
		hasWorktree(n) {
			return world.worktrees.has(n);
		},
		async hasActiveWorkPi(n) {
			return world.active.has(n);
		},
		async labelExists() {
			return world.labelExists;
		},
	};
}

/**
 * Virtual-time simulator for pane lifecycle. `launch` makes a pane appear; after
 * `workDuration` of virtual time elapses (advanced by `sleep`/`tick`), the pane
 * closes and a PR is recorded — modelling a Work Pi that auto-closes post-PR.
 */
class AutopilotSim {
	clock = 0;
	private readonly launchedAt = new Map<number, number>();
	constructor(private readonly world: FakeWorld, private readonly workDuration = 1) {}

	launch(n: number): void {
		this.world.active.add(n);
		this.launchedAt.set(n, this.clock);
	}

	seedActive(n: number): void {
		// Pre-existing in-flight pane (already active before the supervisor looked).
		this.world.active.add(n);
		this.launchedAt.set(n, this.clock);
	}

	tick(ms: number): void {
		this.clock += ms;
		for (const [n, startedAt] of this.launchedAt) {
			if (this.world.active.has(n) && this.clock - startedAt >= this.workDuration) {
				this.world.active.delete(n);
				this.world.prExists.add(n);
			}
		}
	}
}

/** Hooks wired to the sim's virtual clock, with an iteration guard against runaway loops. */
function simHooks(sim: AutopilotSim, notify: AutopilotLoopHooks["notify"], opts: { maxIterations?: number; advanceMs?: number } = {}): AutopilotLoopHooks {
	const max = opts.maxIterations ?? 5000;
	const advance = opts.advanceMs ?? 1_000;
	let iterations = 0;
	return {
		async sleep() {
			iterations += 1;
			if (iterations > max) throw new Error(`test loop exceeded ${max} iterations (supervisor did not terminate)`);
			sim.tick(advance);
		},
		shouldStop: () => false,
		now: () => sim.clock,
		notify,
	};
}

const launchVia = (sim: AutopilotSim) => vi.fn(async (child: AutopilotChildState) => sim.launch(child.number));

/* ----------------------------- pure decision ----------------------------- */

function cand(n: number, overrides: Partial<AutopilotChildState> = {}): AutopilotChildState {
	return {
		number: n,
		title: `#${n}`,
		url: `https://example/${n}`,
		labels: ["ready-for-agent"],
		prExists: false,
		openBlockers: [],
		hasWorktree: false,
		hasActiveWorkPi: false,
		...overrides,
	};
}

describe("decideAutopilotStep (pure)", () => {
	it("returns no-candidates when the snapshot is empty", () => {
		expect(decideAutopilotStep([]).kind).toBe("no-candidates");
	});

	it("returns completed when every candidate is done", () => {
		const decision = decideAutopilotStep([cand(1, { prExists: true }), cand(2, { labels: ["ready-for-human"] })]);
		expect(decision.kind).toBe("completed");
	});

	it("returns startable with the lowest-numbered candidate", () => {
		const decision = decideAutopilotStep([cand(2), cand(1, { openBlockers: [9] })]);
		expect(decision.kind).toBe("startable");
		if (decision.kind !== "startable") return;
		expect(decision.child.number).toBe(2);
	});

	it("returns waiting when candidates are active/blocked but none startable", () => {
		const decision = decideAutopilotStep([cand(1, { hasActiveWorkPi: true }), cand(2, { openBlockers: [1] })]);
		expect(decision.kind).toBe("waiting");
	});
});

/* --------------------------- supervisor loop ---------------------------- */

describe("runAutopilotSupervisor", () => {
	it("completes after launching a candidate, waiting for it to close, and seeing its PR", async () => {
		const world = makeWorld([1]);
		const sim = new AutopilotSim(world);
		const launchWorkPi = launchVia(sim);
		const result = await runAutopilotSupervisor(fakeDeps(world), launchWorkPi, simHooks(sim, () => {}), DEFAULT_AUTOPILOT_CONFIG);
		expect(result.kind).toBe("completed");
		expect(launchWorkPi).toHaveBeenCalledTimes(1);
		expect(launchWorkPi).toHaveBeenCalledWith(expect.objectContaining({ number: 1 }));
	});

	it("processes multiple candidates sequentially until all have a PR", async () => {
		const world = makeWorld([1, 2]);
		const sim = new AutopilotSim(world);
		const launchWorkPi = launchVia(sim);
		const launched: number[] = [];
		launchWorkPi.mockImplementation(async (child) => {
			launched.push(child.number);
			sim.launch(child.number);
		});
		const result = await runAutopilotSupervisor(fakeDeps(world), launchWorkPi, simHooks(sim, () => {}), DEFAULT_AUTOPILOT_CONFIG);
		expect(result.kind).toBe("completed");
		expect(launched).toEqual([1, 2]);
	});

	it("stops with label guidance when there are no candidates and the label is missing", async () => {
		const world = makeWorld([]);
		world.labelExists = false;
		const sim = new AutopilotSim(world);
		const notifies: { msg: string; level: string }[] = [];
		const hooks = simHooks(sim, (msg, level) => notifies.push({ msg, level }));
		const launch = vi.fn();
		const result = await runAutopilotSupervisor(fakeDeps(world), launch, hooks, DEFAULT_AUTOPILOT_CONFIG);
		expect(result.kind).toBe("stopped-no-candidates");
		if (result.kind !== "stopped-no-candidates") return;
		expect(result.labelExists).toBe(false);
		expect(notifies.some((n) => n.level === "warning" && n.msg.includes("setup-matt-pocock-skills"))).toBe(true);
		expect(launch).not.toHaveBeenCalled();
	});

	it("stops cleanly when there are no candidates but the label exists", async () => {
		const world = makeWorld([]);
		const sim = new AutopilotSim(world);
		const result = await runAutopilotSupervisor(fakeDeps(world), vi.fn(), simHooks(sim, () => {}), DEFAULT_AUTOPILOT_CONFIG);
		expect(result.kind).toBe("stopped-no-candidates");
		if (result.kind !== "stopped-no-candidates") return;
		expect(result.labelExists).toBe(true);
	});

	it("completes immediately when every candidate already has a PR", async () => {
		const world = makeWorld([1, 2]);
		world.prExists = new Set([1, 2]);
		const sim = new AutopilotSim(world);
		const launch = vi.fn();
		const result = await runAutopilotSupervisor(fakeDeps(world), launch, simHooks(sim, () => {}), DEFAULT_AUTOPILOT_CONFIG);
		expect(result.kind).toBe("completed");
		expect(launch).not.toHaveBeenCalled();
	});

	it("waits while a candidate is active, then starts the next once it finishes", async () => {
		// #1 is already in-flight (active); #2 is startable but lower-priority? No —
		// #1 active → skipped, #2 startable → but we want to exercise the waiting
		// branch, so seed #1 active and make #2 blocked until #1 finishes.
		const world = makeWorld([1, 2]);
		world.blockers.set(2, [1]); // #2 blocked by #1 until #1's PR lands
		const sim = new AutopilotSim(world);
		sim.seedActive(1); // #1 already running before the supervisor starts
		// Model the dependency gate: #2 is blocked by #1 only while #1 has no PR.
		const deps = fakeDeps(world);
		deps.getDependencyStatus = async (n) => ({ openBlockers: n === 2 && !world.prExists.has(1) ? [1] : [] });
		const launchWorkPi = launchVia(sim);
		const launched: number[] = [];
		launchWorkPi.mockImplementation(async (child) => {
			launched.push(child.number);
			sim.launch(child.number);
		});
		const result = await runAutopilotSupervisor(deps, launchWorkPi, simHooks(sim, () => {}), DEFAULT_AUTOPILOT_CONFIG);
		expect(result.kind).toBe("completed");
		// #1 was never (re)launched (it finished on its own); only #2 was started.
		expect(launched).toEqual([2]);
	});

	it("stops after repeated launch no-shows (bounded relaunch guard)", async () => {
		const world = makeWorld([1]);
		const sim = new AutopilotSim(world);
		// Pane never appears: launcher does NOT call sim.launch, and virtual time
		// advances past the appear deadline each cycle.
		const launch = vi.fn(async () => {
			/* deliberately do not make the pane appear */
		});
		const config: AutopilotSupervisorConfig = { ...DEFAULT_AUTOPILOT_CONFIG, maxLaunchAttempts: 2 };
		const result = await runAutopilotSupervisor(fakeDeps(world), launch, simHooks(sim, () => {}, { advanceMs: 100_000 }), config);
		expect(result.kind).toBe("stopped");
		expect(launch).toHaveBeenCalledTimes(2);
	});

	it("stops when shouldStop becomes true", async () => {
		const world = makeWorld([1]);
		world.active.add(1); // active → waiting path (no launch, polls sleep)
		const sim = new AutopilotSim(world);
		let calls = 0;
		const hooks: AutopilotLoopHooks = {
			async sleep() {
				sim.tick(1_000);
			},
			shouldStop: () => calls++ > 0,
			now: () => sim.clock,
			notify: () => {},
		};
		const result = await runAutopilotSupervisor(fakeDeps(world), vi.fn(), hooks, DEFAULT_AUTOPILOT_CONFIG);
		expect(result.kind).toBe("stopped");
	});
});
