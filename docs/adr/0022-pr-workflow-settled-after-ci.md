# pr-workflow: classify after CI settles, not on the first push-time snapshot

`pr-workflow` の `agent_end` フックが PR 作成直後（CI 実行中）の `mergeStateStatus` を取得し、`UNKNOWN` / `UNSTABLE` を blocked 扱いしていたため、CI が通るにもかかわらず「blocked or inconclusive」通知が連発していた。取得を **CI 収束後**まで遅らせ、`UNSTABLE` / `UNKNOWN` を blocked から外す。

## Status

Accepted

## Context

GitHub の `mergeStateStatus` は push 直後に過渡状態を返す。

- `UNKNOWN`: GitHub 側が mergeability を計算中（秒単位の一時状態）。
- `UNSTABLE`（check 実行中）: マージ可能だが、必須でないステータスチェックが保留中。
- `UNSTABLE`（check 完了後）: マージ可能。非必須チェックの失敗のみ。
- `BLOCKED` / `DIRTY` / `BEHIND` / `CONFLICTING`: 真のブロック。
- `CLEAN`: 全 OK。

`mekann/utils/pr-workflow/index.ts` の `agent_end` は PR 作成直後に発火するため、CI が走り始めた瞬間のスナップショットを取得していた。`isBlocked()` に `UNKNOWN` / `UNSTABLE` が含まれていたため、これらの過渡状態で「blocked or inconclusive」通知が出ていた。実例として PR #55 は最終的に `CLEAN` に収束したが、CI 完了前に `UNSTABLE` → `UNKNOWN` の通知が2回連続した。

本質的に `mergeable=true && mergeStateStatus=UNSTABLE` は **マージ可能** であり、blocked ではない。ユーザへのノイズであり、git-safety ポリシーが「安全な後続作業のみ」を求める場面で誤ってエージェントを停止させる原因にもなる。

## Decisions

- **取得フィールドに `statusCheckRollup` を追加**: check 実行中（`CheckRun.status` が `QUEUED` / `IN_PROGRESS`、`StatusContext.state` が `PENDING`）を検知し、「まだ判定できない」状態を明示する。
- **純粋関数 `classifyStatus(status)` を新設**: `pending` / `clean` / `mergeableUnstable` / `blocked` の4値に分類。`gh` を呼ばないため単体テストが容易。
- **`isBlocked()` を廃止し `classifyStatus` に統一**: `UNKNOWN` / `UNSTABLE` を blocked から外す。`mergeable=true && UNSTABLE` は `mergeableUnstable`（info、警告しない）。`UNKNOWN` と check 実行中は `pending`。
- **`agent_end` は即 return（fire-and-forget）**: `pending` のときはバックグラウンドでポーリングし、収束後に最終判定・通知を1回だけ行う。Pi をブロックしない。
- **bounded exponential backoff**: 初回 15s、上限 60s、係数 1.4、最大 20 回（約 8.4 分天井）。`setTimeout(...).unref()` でプロセス終了を引き留めない。予算を使い切ってもまだ `pending` の場合は info（警告ではない）で「checks still running」を通知する。
- **重複防止**: 収束済み URL は `settledUrls`、ポーリング中 URL は `pollingUrls` で管理し、同一 URL の重複ポーリング・重複通知を防ぐ。
- **`/pr-check` は即時スナップショットのまま**: ユーザ主導なので待たせない。分類は `classifyStatus` に統一し、`pending` は info「checks still running」。
- **設定は既存 `MEKANN_*` env 慣行に準拠**: `MEKANN_PR_WORKFLOW_MAX_POLLS` / `MEKANN_PR_WORKFLOW_INITIAL_INTERVAL_MS` / `MEKANN_PR_WORKFLOW_MAX_INTERVAL_MS` / `MEKANN_PR_WORKFLOW_BACKOFF`。

## Considered Options

- **`UNSTABLE` を blocked のまま残す**: マージ可能な PR を blocked 扱いする誤報が残るため却下。
- **webhook / GitHub App による push 型通知**: インフラ要件が重く、本機能のスコープ（ローカル runtime flow）を超えるため却下。
- **`/pr-check --wait` 同期オプション**: 今回は保留。設計は `classifyStatus` に統一したので将来追加可能。
- **`ctx.getSignal()` でポーリングをキャンセル**: turn スコープの可能性があり `agent_end` 後は既に abort 済みの恐れがあるため、bounded attempts で担保する。
- **`reviewDecision` も取得**: `mergeStateStatus=BLOCKED` で被覆されるため不要。

## Consequences

- PR 作成直後の誤った blocked 通知が消え、真にブロックされたときだけ警告・follow-up が出る。
- `agent_end` は即 return するため、ポーリングが Pi の応答性に影響しない。
- CI が8分を超えても終わらない場合は info で「後で `/pr-check` して」と促す（誤った blocked 扱いにはしない）。
- `classifyStatus` / `isCheckRunning` / `nextInterval` が純粋関数として export され、ポーリング状態遷移が fake timers で網羅的にテストできる。
