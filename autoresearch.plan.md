# Autoresearch Plan

## User Query

Mekann拡張機能のpi起動時間を高速化する。主指標はtotal_ms（lower）。ベンチマークコマンドは `npx tsx benchmark-startup.ts`。静的importフェーズ（2924ms/97.5%）がボトルネックであり、遅延読み込み・動的import・依存グラフ軽量化で改善を図る。

## Interpreted Objective

Mekann拡張機能のpi起動時間を高速化する。主指標はtotal_ms（lower）。ベンチマークコマンドは `npx tsx benchmark-startup.ts`。静的importフェーズ（2924ms/97.5%）がボトル...

## Baseline

- Import: 2924 ms (97.5%)
- Factory: 14 ms
- SessionStart: 62 ms
- Total: 3000 ms

## Root Cause Analysis

Static import chain at `mekann/index.ts` eagerly loads ALL submodules:
- `mekann/autonomy/` (16716 lines) — autoresearch, subagent, goal
- `mekann/utils/` (7360 lines) — dashboard, codex, zip-repo
- `mekann/safety/` (2221 lines) — sandbox, modes
- `mekann/context/` (3767 lines) — ledger, tracker, cacheable-context

Even feature-flagged modules (autoresearch, subagent, goal, sandbox, etc.)
are imported statically before the flag check runs.

## Hypothesis

Converting top-level static imports to dynamic `import()` inside each suite
function will defer module loading until first use, reducing import time
dramatically. Feature-flagged modules that are disabled won't be loaded at all.

## Strategy

1. Convert `mekann/index.ts` to use dynamic imports per suite
2. Convert each suite index (core, safety, autonomy, utils, context) to lazy-load submodules
3. Ensure feature-flag checks happen BEFORE import
4. Verify benchmark improvement at each step

## Non-goals

- Modifying the benchmark script itself
- Changing behavior or API surface
- Removing features

## Scope

- Source: `mekann/**/*.ts` (non-test)
- Benchmark: `npx tsx benchmark-startup.ts`
- Checks: `npm run typecheck:prod`

## Evaluation Contract

```autoresearch-contract jsonc
{
  "schemaVersion": "autoresearch/v1",
  "objective": {
    "summary": "Mekann拡張機能のpi起動時間をtotal_ms指標で高速化する。静的importを遅延読み込みに変換し、起動時の不要なモジュールロードを排除する。",
    "successDefinition": "baseline 3000ms → 1500ms以下 (50%改善)、typecheck通過、既存テスト通過"
  },
  "scope": {
    "allowedWritePaths": [
      "mekann/**/*.ts",
      "benchmark-startup.ts"
    ],
    "forbiddenWritePaths": [
      "mekann/**/*.test.ts",
      "autoresearch.sh",
      "autoresearch.checks.sh",
      "autoresearch.jsonl",
      "autoresearch.md",
      "autoresearch.plan.md",
      ".autoresearch/**",
      "package.json",
      "package-lock.json",
      "docs/**",
      "CONTEXT.md"
    ],
    "immutableReadPaths": [
      "package.json",
      "package-lock.json",
      "benchmark-startup.ts"
    ],
    "requireGit": true,
    "requireCleanGitWorktree": false
  },
  "evaluation": {
    "benchmark": {
      "command": {
        "argv": ["npx", "tsx", "benchmark-startup.ts"],
        "cwd": "."
      },
      "timeoutSeconds": 60,
      "repeats": 3,
      "aggregate": "median"
    },
    "primaryMetric": {
      "name": "total_ms",
      "direction": "lower",
      "source": {
        "type": "metric_line",
        "format": "METRIC <name>=<number>"
      }
    },
    "checks": [
      {
        "command": {
          "argv": ["npm", "run", "typecheck:prod"],
          "cwd": "."
        },
        "timeoutSeconds": 60
      }
    ]
  },
  "acceptance": {
    "mode": "better_than_baseline",
    "minRelativeImprovement": 0.05,
    "requireImprovementAboveNoiseFloor": true,
    "requireAllChecksPass": true,
    "rejectIfMetricMissing": true,
    "rejectIfImmutableReadPathChanged": true,
    "rejectIfForbiddenFilesChanged": true,
    "rejectIfBenchmarkChanged": true
  },
  "loop": {
    "maxIterations": 50,
    "maxRuntimeMinutes": 120,
    "maxConsecutiveNoImprovement": 5,
    "maxConsecutiveFailures": 3
  },
  "failurePolicy": {
    "onBenchmarkFailure": "discard",
    "onCheckFailure": "discard",
    "onMetricMissing": "discard",
    "onContractViolation": "pause",
    "onRevertFailure": "pause"
  }
}
```