/**
 * ENOENT Bug Reproduction Test
 *
 * ROOT CAUSE: Race condition between subagent_run and subagent_run_parallel
 * when both access the same storage simultaneously.
 *
 * SCENARIO:
 * 1. Parallel run starts with agents [researcher, architect]
 * 2. Single run starts with agent [implementer]
 * 3. Single run completes first, calls saveStorageWithPatterns
 * 4. saveStorageWithPatterns calls pruneRunArtifacts
 * 5. pruneRunArtifacts deletes files not in storage.runs
 * 6. Parallel run's files are deleted before it can save them
 * 7. ENOENT error when trying to access deleted files
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const TEST_DIR = join(tmpdir(), `enoent-repro-${Date.now()}`);
const RUNS_DIR = join(TEST_DIR, "runs");

interface RunRecord {
  runId: string;
  agentId: string;
  status: "completed" | "failed";
  outputFile: string;
}

// Simulate saveStorageWithPatterns behavior
function simulateSave(runs: RunRecord[], label: string) {
  console.log(`\n[${label}] Saving with ${runs.length} runs`);
  console.log(`[${label}] Run IDs: ${runs.map(r => r.runId).join(", ")}`);

  // Read current files
  const files = readdirSync(RUNS_DIR).filter(f => f.endsWith(".json"));
  console.log(`[${label}] Files on disk: ${files.join(", ")}`);

  // Simulate pruneRunArtifacts
  const keepFiles = new Set(runs.map(r => r.runId + ".json"));
  console.log(`[${label}] Files to keep: ${Array.from(keepFiles).join(", ")}`);

  for (const file of files) {
    if (!keepFiles.has(file)) {
      const filepath = join(RUNS_DIR, file);
      console.log(`[${label}] DELETING: ${file}`);
      try {
        unlinkSync(filepath);
      } catch (e) {
        console.log(`[${label}] Delete failed: ${(e as Error).message}`);
      }
    }
  }
}

// Simulate subagent_run (single agent)
async function simulateSingleRun(agentId: string, delayMs: number) {
  const runId = `${agentId}-${Date.now()}`;

  // Simulate agent execution
  await new Promise(r => setTimeout(r, delayMs));

  // Write output file
  const outputFile = join(RUNS_DIR, `${runId}.json`);
  console.log(`\n[single:${agentId}] Writing ${runId}.json`);
  writeFileSync(outputFile, JSON.stringify({ runId, agentId, status: "completed" }));

  // Simulate immediate save (THIS IS THE BUG!)
  const runRecord: RunRecord = { runId, agentId, status: "completed", outputFile };
  simulateSave([runRecord], `single:${agentId}`);

  return runRecord;
}

// Simulate subagent_run_parallel (multiple agents)
async function simulateParallelRun(agentIds: string[], delayMs: number) {
  const results: RunRecord[] = [];

  // Simulate parallel execution
  const promises = agentIds.map(async (agentId) => {
    const runId = `${agentId}-${Date.now()}`;

    // Simulate agent execution
    await new Promise(r => setTimeout(r, delayMs));

    // Write output file
    const outputFile = join(RUNS_DIR, `${runId}.json`);
    console.log(`\n[parallel:${agentId}] Writing ${runId}.json`);
    writeFileSync(outputFile, JSON.stringify({ runId, agentId, status: "completed" }));

    return { runId, agentId, status: "completed" as const, outputFile };
  });

  const records = await Promise.all(promises);
  results.push(...records);

  // Simulate batch save (after all complete)
  simulateSave(results, "parallel");

  return results;
}

async function testRaceCondition() {
  console.log("=== ENOENT Bug Reproduction Test ===\n");
  console.log(`Test directory: ${TEST_DIR}`);

  // Setup
  mkdirSync(RUNS_DIR, { recursive: true });

  // SCENARIO: Single run and parallel run execute simultaneously
  console.log("\n--- Starting concurrent runs ---");

  // Start both runs simultaneously
  const singleRunPromise = simulateSingleRun("implementer", 100);
  const parallelRunPromise = simulateParallelRun(["researcher", "architect"], 150);

  // Wait for both to complete
  const [singleResult, parallelResults] = await Promise.all([
    singleRunPromise,
    parallelRunPromise,
  ]);

  console.log("\n--- Checking final state ---");
  const finalFiles = readdirSync(RUNS_DIR).filter(f => f.endsWith(".json"));
  console.log(`Final files on disk: ${finalFiles.join(", ")}`);

  // Verify all files exist
  const allRuns = [singleResult, ...parallelResults];
  let missingCount = 0;

  for (const run of allRuns) {
    const filename = run.runId + ".json";
    const filepath = join(RUNS_DIR, filename);
    if (!existsSync(filepath)) {
      console.log(`\n*** ENOENT BUG DETECTED ***`);
      console.log(`Missing file: ${filename}`);
      console.log(`Expected at: ${filepath}`);
      console.log(`Agent: ${run.agentId}`);
      missingCount++;
    } else {
      console.log(`OK: ${filename} exists`);
    }
  }

  console.log(`\n=== Test Complete ===`);
  console.log(`Total runs: ${allRuns.length}`);
  console.log(`Missing files: ${missingCount}`);

  if (missingCount > 0) {
    console.log("\n*** BUG REPRODUCED ***");
    console.log("The single run's prune deleted the parallel run's files!");
  } else {
    console.log("\n*** Bug not reproduced in this run (timing dependent) ***");
    console.log("Try running multiple times - the bug is timing-sensitive");
  }
}

// Run the test
testRaceCondition().catch(console.error);
