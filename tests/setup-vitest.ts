// path: tests/setup-vitest.ts
// what: Vitest全体の共通クリーンアップとデフォルトモック定義
// why: テスト実行時のランタイム隔離と、残留するタイマー/インスタンス状態の確実な解放のため
// related: vitest.config.ts, .pi/lib/cross-instance-coordinator.ts, .pi/extensions/agent-runtime.ts

import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { afterAll, afterEach, vi } from "vitest";

const VITEST_HOME = join(process.cwd(), ".tmp", "vitest-home");
const VITEST_RUNTIME_DIR = join(VITEST_HOME, ".pi", "runtime");

process.env.HOME = VITEST_HOME;
process.env.PI_RUNTIME_DIR = VITEST_RUNTIME_DIR;
mkdirSync(VITEST_RUNTIME_DIR, { recursive: true });

// デフォルトモック設定はテストファイル個別で行う
// グローバルセットアップでは環境変数とクリーンアップのみを担当

const BASE_OBJECT_PROTOTYPE_KEYS = new Set(
  Object.keys(Object.prototype),
);
const BASE_OBJECT_DEFINE_PROPERTY = Object.defineProperty;
const BASE_ARRAY_ITERATOR_DESCRIPTOR = Object.getOwnPropertyDescriptor(
  Array.prototype,
  Symbol.iterator,
);

function restoreGlobalPrototypeSafety(): void {
  // vitest上で漏れたスパイ/スタブを毎テストで強制解除する
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();

  // Object.prototypeへの列挙可能プロパティ汚染を除去
  const currentEnumerableKeys = Object.keys(Object.prototype);
  for (const key of currentEnumerableKeys) {
    if (!BASE_OBJECT_PROTOTYPE_KEYS.has(key)) {
      delete (Object.prototype as Record<string, unknown>)[key];
    }
  }

  // definePropertyが差し替えられると依存ライブラリの__exportが壊れるため復元
  if (Object.defineProperty !== BASE_OBJECT_DEFINE_PROPERTY) {
    Object.defineProperty = BASE_OBJECT_DEFINE_PROPERTY;
  }

  // Arrayのイテレータが壊れるとspread構文が全体で失敗するため復元
  if (BASE_ARRAY_ITERATOR_DESCRIPTOR) {
    Object.defineProperty(
      Array.prototype,
      Symbol.iterator,
      BASE_ARRAY_ITERATOR_DESCRIPTOR,
    );
  }
}

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
  restoreGlobalPrototypeSafety();
});

afterAll(async () => {
  await cleanupVitestRuntime();
  restoreGlobalPrototypeSafety();
});
