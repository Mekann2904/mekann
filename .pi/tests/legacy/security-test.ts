/**
 * Security tests for the agentic search modules.
 */

import {
  TrajectoryTracker,
  DEFAULT_MAX_TRAJECTORY_STEPS,
} from "../lib/semantic-repetition.js";

async function runTests(): Promise<void> {
  console.log("\n=== Security Tests ===\n");
  
  let passed = 0;
  let failed = 0;

  // Test 1: Default maxSteps
  console.log("Test 1: TrajectoryTracker - default maxSteps is 100");
  try {
    if (DEFAULT_MAX_TRAJECTORY_STEPS !== 100) {
      throw new Error(`Expected 100, got ${DEFAULT_MAX_TRAJECTORY_STEPS}`);
    }
    console.log("  ✓ Passed");
    passed++;
  } catch (err: any) {
    console.log(`  ✗ Failed: ${err.message}`);
    failed++;
  }

  // Test 2: Respects maxSteps limit
  console.log("Test 2: TrajectoryTracker - respects maxSteps limit");
  try {
    const maxSteps = 5;
    const tracker = new TrajectoryTracker(maxSteps);
    
    for (let i = 0; i < 10; i++) {
      await tracker.recordStep(`Output ${i}`);
    }
    
    if (tracker.stepCount !== maxSteps) {
      throw new Error(`Expected ${maxSteps} steps, got ${tracker.stepCount}`);
    }
    console.log("  ✓ Passed");
    passed++;
  } catch (err: any) {
    console.log(`  ✗ Failed: ${err.message}`);
    failed++;
  }

  // Test 3: Custom maxSteps of 1
  console.log("Test 3: TrajectoryTracker - custom maxSteps of 1 works");
  try {
    const tracker = new TrajectoryTracker(1);
    await tracker.recordStep("First");
    await tracker.recordStep("Second");
    
    if (tracker.stepCount !== 1) {
      throw new Error(`Expected 1 step, got ${tracker.stepCount}`);
    }
    console.log("  ✓ Passed");
    passed++;
  } catch (err: any) {
    console.log(`  ✗ Failed: ${err.message}`);
    failed++;
  }

  // Test 4: Memory is bounded
  console.log("Test 4: TrajectoryTracker - memory is bounded");
  try {
    const maxSteps = 10;
    const tracker = new TrajectoryTracker(maxSteps);
    
    for (let i = 0; i < 100; i++) {
      await tracker.recordStep(`Output ${i}`);
    }
    
    if (tracker.stepCount > maxSteps) {
      throw new Error(`Memory leak: ${tracker.stepCount} steps exceeds limit of ${maxSteps}`);
    }
    
    const summary = tracker.getSummary();
    if (summary.totalSteps !== maxSteps) {
      throw new Error(`Summary totalSteps should be ${maxSteps}, got ${summary.totalSteps}`);
    }
    console.log(`  ✓ Passed (kept ${tracker.stepCount} steps after 100 additions)`);
    passed++;
  } catch (err: any) {
    console.log(`  ✗ Failed: ${err.message}`);
    failed++;
  }

  // Test 5: Summary reflects recent steps
  console.log("Test 5: TrajectoryTracker - summary reflects recent steps");
  try {
    const tracker = new TrajectoryTracker(5);
    
    for (let i = 0; i < 10; i++) {
      await tracker.recordStep(`Step ${i}`);
    }
    
    const summary = tracker.getSummary();
    if (summary.totalSteps !== 5) {
      throw new Error(`Expected 5 steps in summary, got ${summary.totalSteps}`);
    }
    console.log("  ✓ Passed");
    passed++;
  } catch (err: any) {
    console.log(`  ✗ Failed: ${err.message}`);
    failed++;
  }

  console.log("\n========================================");
  console.log(`Security Tests: ${passed} passed, ${failed} failed`);
  console.log("========================================\n");
  
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
