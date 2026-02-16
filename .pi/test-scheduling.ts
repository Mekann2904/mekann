// File: .pi/test-scheduling.ts
import {
  inferPriority,
  comparePriority,
  PriorityTaskQueue,
  type PriorityQueueEntry,
} from "./lib/priority-scheduler.js";

import {
  TaskDependencyGraph,
} from "./lib/task-dependencies.js";

import {
  getDynamicParallelLimit,
  registerInstance,
  unregisterInstance,
  getCoordinatorStatus,
} from "./lib/cross-instance-coordinator.js";

import {
  getPredictiveAnalysis,
  analyze429Probability,
  record429,
  recordSuccess,
  initAdaptiveController,
  getAdaptiveState,
  formatAdaptiveSummary,
} from "./lib/adaptive-rate-controller.js";

let testsPassed = 0;
let testsFailed = 0;

function test(name: string, fn: () => boolean): void {
  try {
    const result = fn();
    if (result) {
      console.log("OK " + name);
      testsPassed++;
    } else {
      console.log("FAIL " + name);
      testsFailed++;
    }
  } catch (error) {
    console.log("FAIL " + name + " - error: " + error);
    testsFailed++;
  }
}

function section(title: string): void {
  console.log("\n" + title);
  console.log("=".repeat(title.length));
}

function testPriorityScheduler(): void {
  section("Phase 1: Priority Scheduler");
  test("inferPriority critical for question", () => inferPriority("question") === "critical");
  test("inferPriority high for subagent_run", () => inferPriority("subagent_run") === "high");
  test("inferPriority normal for read", () => inferPriority("read") === "normal");
  
  test("comparePriority orders critical before normal", () => {
    const c: PriorityQueueEntry = { id: "1", toolName: "t", priority: "critical", enqueuedAtMs: 1000, virtualStartTime: 0, virtualFinishTime: 0, skipCount: 0 };
    const n: PriorityQueueEntry = { id: "2", toolName: "t", priority: "normal", enqueuedAtMs: 0, virtualStartTime: 0, virtualFinishTime: 0, skipCount: 0 };
    return comparePriority(c, n) < 0;
  });

  test("PriorityTaskQueue dequeues in priority order", () => {
    const q = new PriorityTaskQueue();
    q.enqueue({ id: "low", toolName: "bg", priority: "low", enqueuedAtMs: Date.now() });
    q.enqueue({ id: "crit", toolName: "q", priority: "critical", enqueuedAtMs: Date.now() });
    q.enqueue({ id: "norm", toolName: "r", priority: "normal", enqueuedAtMs: Date.now() });
    return q.dequeue()?.priority === "critical" && q.dequeue()?.priority === "normal" && q.dequeue()?.priority === "low";
  });
}

function testDependencyGraph(): void {
  section("Phase 2: Dependency Graph");
  
  test("adds tasks without deps", () => {
    const g = new TaskDependencyGraph();
    g.addTask("t1", { name: "T1" });
    return g.hasTask("t1") && g.getTask("t1")?.status === "ready";
  });

  test("respects dependencies", () => {
    const g = new TaskDependencyGraph();
    g.addTask("p", { name: "Parent" });
    g.addTask("c", { name: "Child", dependencies: ["p"] });
    return g.getTask("c")?.status === "pending";
  });

  test("marks ready when deps complete", () => {
    const g = new TaskDependencyGraph();
    g.addTask("p", { name: "P" });
    g.addTask("c", { name: "C", dependencies: ["p"] });
    g.markRunning("p");
    g.markCompleted("p");
    return g.getReadyTasks().some(t => t.id === "c");
  });

  test("propagates failures", () => {
    const g = new TaskDependencyGraph();
    g.addTask("p", { name: "P" });
    g.addTask("c", { name: "C", dependencies: ["p"] });
    g.markRunning("p");
    g.markFailed("p", new Error("e"));
    return g.getTask("c")?.status === "failed";
  });
}

function testWorkStealing(): void {
  section("Phase 3: Work-Stealing");
  
  test("registers/unregisters", () => {
    registerInstance("test-001");
    const ok = getCoordinatorStatus().registered;
    unregisterInstance();
    return ok;
  });

  test("dynamic limit works", () => {
    registerInstance("test-002");
    const limit = getDynamicParallelLimit(0);
    unregisterInstance();
    return limit >= 1;
  });
}

function testPredictiveRateControl(): void {
  section("Phase 4: Predictive Rate Control");
  
  test("initializes and has correct structure", () => {
    initAdaptiveController();
    const state = getAdaptiveState();
    return state.version >= 1 && typeof state.predictiveEnabled === "boolean";
  });

  test("429 prob is 0 without history", () => {
    return analyze429Probability("unknown", "unknown") === 0;
  });

  test("predictive analysis works", () => {
    const a = getPredictiveAnalysis("p", "m");
    return typeof a.predicted429Probability === "number" && typeof a.recommendedConcurrency === "number";
  });

  test("format summary works", () => {
    return formatAdaptiveSummary().includes("Adaptive Rate Controller");
  });
}

function testIntegration(): void {
  section("Integration");
  
  test("priority + dependency graph", () => {
    const g = new TaskDependencyGraph();
    const q = new PriorityTaskQueue();
    g.addTask("fetch", { name: "Fetch", priority: "high" });
    g.addTask("parse", { name: "Parse", dependencies: ["fetch"], priority: "normal" });
    
    for (const t of g.getReadyTasks()) {
      q.enqueue({ id: t.id, toolName: t.name ?? t.id, priority: t.priority ?? "normal", enqueuedAtMs: Date.now() });
    }
    return q.dequeue()?.id === "fetch";
  });
}

function main(): void {
  console.log("Task Scheduling Optimization Tests\n");
  testPriorityScheduler();
  testDependencyGraph();
  testWorkStealing();
  testPredictiveRateControl();
  testIntegration();
  console.log("\n" + "=".repeat(50));
  console.log("Results: " + testsPassed + " passed, " + testsFailed + " failed");
  if (testsFailed > 0) process.exit(1);
}

main();
