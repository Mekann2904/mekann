# Codex Goal 最新版と Mekann のギャップ調査

調査日: 2026-07-23  
比較対象:

- OpenAI Codex `main`: commit [`4462b9deef211723b781b426f5e5d36a5777115f`](https://github.com/openai/codex/commit/4462b9deef211723b781b426f5e5d36a5777115f)（2026-07-23T06:28:27Z）
- Mekann `main`: commit `539da9c3fa928c79fd3067c4758fa8dd21531250`

## 対応状況

2026-07-23 に Mekann 側へ全項目を反映した。実装は `mekann/autonomy/goal/` を参照。Pi に Codex 同等の stable usage event ID / cumulative turn usage API はないため、accounting identity は synthetic metadata key から bounded object-identity dedupe へ変更し、同一 timestamp・同一 usage の別 message を誤って潰さない方式で適応した。Codex の semaphore に相当する跨ぎ得る競合点は、Pi の同期 mutation と async compaction callback の境界で `goal_id` を再検証して stale continuation を破棄する。

実装済み:

- settled terminal error → `blocked`、usage/rate limit → `usage_limited`
- retry/compaction 前の `agent_end` ではなく `agent_settled` で判定
- compaction 中の置換に対する stale continuation guard
- completed Goal の command/tool 無確認置換
- fork snapshot の thread rebind と初回 explicit turn までの continuation defer
- collision-safe bounded message identity accounting
- objective-update prompt の budget snapshot
- local `goal:telemetry` observability event

## 結論

Mekann の Goal は、**データモデル、status、基本 tool、token accounting 式、継続 prompt の主要ポリシーについては Codex 最新版にかなり追随している**。特に completion audit と blocked audit は現行 Codex の長い continuation prompt とほぼ同期している。

一方、最新版 Codex との差として重要なのは次の 5 点である。

1. **turn error / usage limit の停止状態への写像が未移植**
2. **Goal 状態変更と自動 continuation の競合防止が弱い**
3. **完了済み Goal の置換 UX・tool semantics が古い**
4. **fork 時の Goal 継承と初回 continuation defer がない**
5. **token accounting が message event の合成キーに依存し、Codex の turn snapshot 方式より弱い**

移植優先度は **1 → 2 → 3 → 5 → 4** を推奨する。4 は Pi に thread fork lifecycle が存在する場合だけ対象にすべきである。

## すでに追随できている部分

| 項目 | 評価 | 根拠 |
|---|---|---|
| status セット | 同期済み | 両者とも `active / paused / blocked / usage_limited / budget_limited / complete`。Codex: [`thread_goal.rs`](https://github.com/openai/codex/blob/4462b9deef211723b781b426f5e5d36a5777115f/codex-rs/state/src/model/thread_goal.rs)、Mekann: `mekann/autonomy/goal/state.ts` |
| 1 thread 1 goal | 同期済み | 両者とも thread/session ごとに current goal を 1 件保持する |
| 内部 `goal_id` | 概ね同期 | Codex の state/runtime 内部にも `goal_id` は残る。公開 app-server shape では thread が identity。Codex: [`thread.rs`](https://github.com/openai/codex/blob/4462b9deef211723b781b426f5e5d36a5777115f/codex-rs/app-server-protocol/src/protocol/v2/thread.rs) |
| model tool | 同期済み | `get_goal / create_goal / update_goal`。`update_goal` は `complete / blocked` のみ。Codex: [`spec.rs`](https://github.com/openai/codex/blob/4462b9deef211723b781b426f5e5d36a5777115f/codex-rs/ext/goal/src/spec.rs)、Mekann: `mekann/autonomy/goal/goalTools.ts` |
| blocked audit | 同期済み | 同一 blocker が 3 goal turns 続いた場合のみ blocked。Mekann の tool description と continuation prompt に反映済み |
| completion audit | 同期済み | authoritative evidence による requirement-by-requirement verification を Mekann も保持 |
| token 算式 | 同期済み | `input - cached_input + output`。Codex: [`accounting.rs`](https://github.com/openai/codex/blob/4462b9deef211723b781b426f5e5d36a5777115f/codex-rs/ext/goal/src/accounting.rs)、Mekann: `runtime.ts` |
| continuation 回数上限なし | 同期済み | active の間は idle continuation を続ける |
| budget-limit steering | 同期済み | tool 完了後/usage accounting 後に一度だけ budget-limit prompt を注入 |
| objective update steering | 概ね同期 | active turn 中に新 objective を steering として注入 |

## ギャップ詳細

### P0: turn error / usage limit の状態遷移が未移植

Codex 最新版は、retry 不可能または retry exhausted の turn error で active goal を `blocked` にし、usage limit では `usage_limited` にする。これにより compaction error などが自動 continuation を無限再開して token を消費することを防ぐ。

- Codex: [`extension.rs`](https://github.com/openai/codex/blob/4462b9deef211723b781b426f5e5d36a5777115f/codex-rs/ext/goal/src/extension.rs)
- Codex runtime: [`runtime.rs`](https://github.com/openai/codex/blob/4462b9deef211723b781b426f5e5d36a5777115f/codex-rs/ext/goal/src/runtime.rs)

Mekann は `usage_limited` 型を定義・表示するが、`runtime.ts` にその状態へ遷移する経路がない。abort された assistant message は一律 `paused` になる。結果として、usage limit と user abort を区別できず、非 abort の terminal error に対する loop breaker もない。

**推奨:** Pi の lifecycle/error surface を調査し、少なくとも以下の写像を追加する。

- user abort → accounting 後に停止（Codex の現行 `turn_abort` は自動 pause しないため、Mekann の pause が意図的差分か再確認）
- usage limit → `usage_limited`
- non-retryable / retries exhausted error → `blocked`

### P0: mutation と continuation の競合防止が弱い

Codex は thread ごとの semaphore を使い、外部 set/clear の「accounting → state write」と idle continuation の「state read → turn start」を直列化する。古い Goal を読んだ直後に別 Goal へ置換され、その古い objective で continuation が始まる競合を防いでいる。

- Codex: [`runtime.rs`](https://github.com/openai/codex/blob/4462b9deef211723b781b426f5e5d36a5777115f/codex-rs/ext/goal/src/runtime.rs)
- Codex service: [`api.rs`](https://github.com/openai/codex/blob/4462b9deef211723b781b426f5e5d36a5777115f/codex-rs/ext/goal/src/api.rs)

Mekann は `continuation_active`、`active_goal_id`、`expectedGoalId` で一部を守るが、`maybeContinueIfIdle()` の read から `sendUserMessage()` までと command/tool mutation は同一 mutex/semaphore で直列化されない。JS event loop 上でも `ctx.compact({ onComplete })` を跨ぐため、stale continuation の余地がある。

**推奨:** Goal mutation と continuation dispatch を同じ async critical section に入れる。compaction callback では current `goal_id` が開始時と一致することも検証する。

### P1: 完了済み Goal の置換 semantics が古い

Codex TUI は既存 Goal が `complete` なら確認なしで新 Goal を開始し、未完了 status の場合だけ置換確認を出す。

- Codex: [`thread_goal_actions.rs`](https://github.com/openai/codex/blob/4462b9deef211723b781b426f5e5d36a5777115f/codex-rs/tui/src/app/thread_goal_actions.rs)

Codex の `create_goal` tool も「Goal がない、または現在 Goal が complete の場合」に新規作成でき、unfinished goal のみ拒否する。

- Codex: [`spec.rs`](https://github.com/openai/codex/blob/4462b9deef211723b781b426f5e5d36a5777115f/codex-rs/ext/goal/src/spec.rs)
- Codex: [`tool.rs`](https://github.com/openai/codex/blob/4462b9deef211723b781b426f5e5d36a5777115f/codex-rs/ext/goal/src/tool.rs)

Mekann は command で `complete` を含む全既存 Goal に置換確認を出し、model tool は complete Goal が存在しても `createGoal()` を拒否する。

**推奨:**

- `/goal <objective>`: existing status が `complete` なら無確認置換
- `create_goal`: existing status が `complete` なら新しい `goal_id` と usage 0 で置換
- unfinished status は従来通り command では確認、tool では拒否

### P1: accounting の event identity と並行性が弱い

Codex は turn start 時の cumulative `TokenUsage` snapshot と最新 cumulative usage の差分を取り、accounting semaphore で tool-finish hooks を直列化する。複数 tool completion が競合しても同じ delta を二重計上しない。

- Codex: [`accounting.rs`](https://github.com/openai/codex/blob/4462b9deef211723b781b426f5e5d36a5777115f/codex-rs/ext/goal/src/accounting.rs)

Mekann は assistant message の `timestamp:input:output:cacheRead` 合成キーを最大 4096 件保持して重複排除する。このキーは安定した message/turn id ではなく、同一 millisecond・同一 usage の別 message を重複扱いする可能性がある。一方で tool end は wall-clock だけを account するため、token accounting の確定点も Codex より限定される。

**推奨:** Pi が turn/message ID と cumulative usage を公開しているなら、turn-scoped baseline/delta 方式へ移す。公開していなければ SDK enhancement 候補として記録し、現行合成キーの collision test を追加する。

### P2: fork Goal 継承と continuation defer がない

Codex は `thread/fork` に `deferGoalContinuation` を追加し、source thread の Goal を fork に引き継ぎつつ、fork 直後の自動 continuation は抑止する。次の explicit turn が lifecycle を引き受けた後、通常の自動 continuation に戻る。

- Codex protocol: [`thread.rs`](https://github.com/openai/codex/blob/4462b9deef211723b781b426f5e5d36a5777115f/codex-rs/app-server-protocol/src/protocol/v2/thread.rs)
- Codex migration: [`0002_thread_goal_continuation_deferrals.sql`](https://github.com/openai/codex/blob/4462b9deef211723b781b426f5e5d36a5777115f/codex-rs/state/goals_migrations/0002_thread_goal_continuation_deferrals.sql)

Mekann の Goal persistence は Pi session branch の replay を扱うが、fork 専用の Goal copy/defer protocol は見当たらない。

**適用条件:** Pi に fork/branch 作成 lifecycle がなければ移植不要。存在する場合、親 Goal の継承方針と初回 continuation ownership を ADR 化すべき。

### P2: objective-updated prompt の runtime 情報が Codex とずれる

Codex の objective-updated prompt は新 objective に加えて `tokens_used / token_budget / remaining_tokens` を含む。Mekann は新旧 objective の切替説明は強いが、budget 情報を含まない。

- Codex: [`objective_updated.md`](https://github.com/openai/codex/blob/4462b9deef211723b781b426f5e5d36a5777115f/codex-rs/ext/goal/templates/goals/objective_updated.md)
- Mekann: `mekann/autonomy/goal/prompts.ts`

**推奨:** Codex と同じ budget snapshot を追加する。ただし Mekann の「previous objective にしか役立たない作業を避ける」という説明は有用なので保持する。

### P2: observability が未移植

Codex Goal extension は created/resumed/terminal/usage/status change の metrics と analytics attribution（turn/no-turn）を持つ。

- Codex: [`metrics.rs`](https://github.com/openai/codex/blob/4462b9deef211723b781b426f5e5d36a5777115f/codex-rs/ext/goal/src/metrics.rs)
- Codex: [`analytics.rs`](https://github.com/openai/codex/blob/4462b9deef211723b781b426f5e5d36a5777115f/codex-rs/ext/goal/src/analytics.rs)

Mekann は context event/ledger へ action を流すが、Goal 固有の counters と attribution はない。運用上 continuation loop、budget limit、blocked の頻度を比較しにくい。

**推奨:** telemetry を増やす前に privacy 方針を確認し、まず local structured events/counters として実装する。

## 意図的差分として維持してよいもの

- **Persistence:** Codex は専用 SQLite runtime、Mekann は Pi custom entries。Pi extension としては backend をそのまま移植する必要はない。
- **Public app-server API:** Mekann は Pi extension 内 feature なので `thread/goal/*` の完全互換 API は不要。
- **Goal prompt wrapper:** Mekann の `<goal_context>` wrapper や prompt-core 分離は Pi の prompt injection model に合わせた差分であり、Codex の文字列完全一致を目的にしなくてよい。
- **Plan mode exclusion:** Codex は Plan turn を Goal accounting 対象外にするが、Mekann は planning collaboration mode を廃止済み（ADR-0014）。同機能がない限り移植不要。
- **Objective XML 5文字 escape:** Codex は element text 用の `&<>` のみ、Mekann は将来の attribute 利用にも安全な `&<>"'`。Mekann の方を維持してよい。

## 推奨する実装単位

1. **Error-state lifecycle slice**: Pi error classification → `usage_limited/blocked` → continuation stop → tests
2. **Goal mutation serialization slice**: per-session async lock → stale compaction callback guard → race tests
3. **Completed-goal replacement slice**: command + tool + persistence entry + tests
4. **Accounting identity slice**: Pi SDK capability調査 → turn baseline/delta、または現方式の制約明文化
5. **Prompt parity slice**: objective-updated budget snapshot
6. **Fork slice**: Pi に対応 lifecycle がある場合のみ

## 調査方法と制約

GitHub API で OpenAI Codex `main` の HEAD を確定し、Goal extension、state model/migrations、app-server protocol、TUI action、prompt templates を一次ソースとして読んだ。Mekann は `mekann/autonomy/goal/` の state/runtime/command/tool/prompt/lifecycle とテストを比較した。

このレポートは静的比較であり、Codex と Mekann の runtime を同一 scenario で実行した differential test ではない。特に Pi の error event、thread fork、cumulative token usage API の有無は、実装前に Pi SDK documentation/source で追加確認が必要である。
