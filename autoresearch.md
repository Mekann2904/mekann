# Autoresearch: Pre-push高速化 Phase 2

## Goal
husky prepushフックのテスト実行時間を短縮する（品質を損なわずに）

## Metric
- **Primary**: prepush実行時間 (ms)
- **Baseline**: 14000ms
- **Current**: 6100ms (-56.4%)
- **Direction**: lower is better

## Session: Pre-push Phase 2 (2026-05-17)

| # | Description | Time | Δ | Status |
|---|---|---|---|---|
| 0 | Baseline | 14.0s | - | baseline |
| 1 | macSeatbelt タイムアウト短縮 (sleep 30→5, timeoutMs 300→150等) | 11.8s | -15.7% | keep |
| 2 | sandbox統合テストにvitest concurrent mode + autoresearch timeout 0.5s | 8.2s | -30.5% | keep |
| 3 | 全sandbox describeMacブロックにconcurrent mode | 6.1s | -25.6% | keep |
| 4 | typecheck並列化（8プロセス同時）→ システム過負荷で悪化 | 11.6s | +90% | discard |

## Changes Made

### 1. macSeatbelt タイムアウト/スリープ短縮
- `sleep 30` → `sleep 5`, `sleep 1000` → `sleep 5`
- `timeoutMs: 300→150`, `500→200`
- abort delay: `300→150`, `500→200`
- `expectProcessGone`: 10retries/100ms → 5retries/50ms
- test timeouts: `10000→5000`, `15000→8000`

### 2. autoresearch timeout テスト
- `timeout_seconds: 1` → `0.5`

### 3. vitest concurrent mode (最大効果)
- `describeMacConcurrent = isMac ? describe.concurrent : describe.skip`
- 統合テスト（sandbox-exec起動）を並列実行
- テストファイル内のテストが独立しているため安全に並列化可能
- sandbox: 9.0s → 3.1s (テスト実行: 8.0s → 2.0s)

## Bottleneck Analysis
現在のprepush（~6秒）の内訳:
- typecheck (直列): sandbox tsc 1.7s + subagent tsc 3.8s = 5.5s
- sandbox tests (concurrent): 3.1s
- subagent tests: 2.4s
- autoresearch tests: 2.6s
- goal tests: 0.8s
- plan-mode tests: 1.2s
- zip-repo tests: 0.6s

ウォールクロック ≈ max(typecheck 5.5s, sandbox 3.1s) + overhead ≈ 6s

## Remaining Optimization Opportunities
1. **typecheck並列化**: sandbox(1.7s)とsubagent(3.8s)を並列実行で3.8sに → 8プロセス同時でシステム過負荷、効果不明
2. **subagent tsc高速化**: index.test.tsが4699行でtsc処理が重い（3.8s）。ファイル分割で改善可能性
3. **sandboxテストファイル分割**: 2205行を複数ファイルに分割 → transform/import 3.0sを短縮
4. **テストのバッチ化**: 複数アサーションを1プロセス起動にまとめる → テスト粒度が荒くなる

## Rules
- All tests must pass (`npm run prepush`)
- No behavior changes to production source code
- Quality equivalence: same checks, same logic paths

## Benchmark
```bash
cd /Users/mekann/github/pi-plugin/mekann && npm run prepush
```
