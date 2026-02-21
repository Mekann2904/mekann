// path: tests/setup-vitest.ts
// what: Vitest全体の共通クリーンアップを定義する。
// why: テスト実行時のランタイム隔離と、残留するタイマー/インスタンス状態の確実な解放のため。
// related: vitest.config.ts, .pi/lib/cross-instance-coordinator.ts, .pi/extensions/agent-runtime.ts

import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { afterAll, afterEach } from "vitest";

const VITEST_HOME = join(process.cwd(), ".tmp", "vitest-home");
const VITEST_RUNTIME_DIR = join(VITEST_HOME, ".pi", "runtime");

process.env.HOME = VITEST_HOME;
process.env.PI_RUNTIME_DIR = VITEST_RUNTIME_DIR;
mkdirSync(VITEST_RUNTIME_DIR, { recursive: true });

async function cleanupVitestRuntime(): Promise<void> {
  const [coordinator, runtime, adaptive] = await Promise.all([
    import("../.pi/lib/cross-instance-coordinator"),
    import("../.pi/extensions/agent-runtime"),
    import("../.pi/lib/adaptive-rate-controller"),
  ]);

  try {
    coordinator.clearAllActiveModels();
  } catch {
    // noop
  }

  try {
    coordinator.unregisterInstance();
  } catch {
    // noop
  }

  try {
    runtime.stopRuntimeReservationSweeper();
  } catch {
    // noop
  }

  try {
    runtime.resetRuntimeTransientState();
  } catch {
    // noop
  }

  try {
    adaptive.shutdownAdaptiveController();
  } catch {
    // noop
  }

  try {
    coordinator.resetStealingStats();
  } catch {
    // noop
  }
}

afterEach(async () => {
  await cleanupVitestRuntime();
});

afterAll(async () => {
  await cleanupVitestRuntime();
});
