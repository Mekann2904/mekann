# Autoresearch

<!-- AUTORESEARCH:BEGIN generated -->
Current plan: `.autoresearch/plans/plan-b67e68f9ec19/`

## Current objective

subagent で特定の同じテストタスク（npm test）を実行し、実行時間を記録・最適化する。特に autoresearch パッケージのテストが49秒と全体の83%を占めているため、そこを重点的に最適化する。

## Files

- Plan: `.autoresearch/plans/plan-b67e68f9ec19/plan.md`
- Contract: `.autoresearch/plans/plan-b67e68f9ec19/contract.json`
- Benchmark: `.autoresearch/plans/plan-b67e68f9ec19/benchmark.sh`
- Checks: `.autoresearch/plans/plan-b67e68f9ec19/checks.sh`
- Runs: `.autoresearch/plans/plan-b67e68f9ec19/runs/`
<!-- AUTORESEARCH:END generated -->

## Codebase Patterns

- `tryParseSubagentResult` は `extractJSON` 経由で code block / prose から JSON を抽出するようになった (commit e89680f)
- pi プロセスは起動時に拡張機能をロードする。コード修正は次回セッション開始まで反映されない
- in-process (kitty-log) では authority が enforced。外部 Pi (kitty-split) では enforced=false
- `filterToolsByAuthority`: edit=全ツール, その他=readOnlyAllow のみ
- `getActiveTools()` はツールオブジェクト配列を返す。文字列配列ではない (commit 6d8b1c8 で修正)

## 試したこと

### ラウンド1-3: 振る舞いテスト（18件検証）
- P1: structured result の JSON パース失敗 → extractJSON で修正
- P2: patch schema が LLM に複雑すぎる → preamble に例を追加
- P3: retry message が固定 → outcome 応答化

### ラウンド4: P1 修正の実証 (commit e89680f, fe3ca8d)
- extractJSON の code-block-in-prose 対応を修正
- 実際の LLM 出力サンプルで unit test 検証: 256 テスト全パス
- **制約発見**: 実行中の pi セッションではコード修正が反映されない

### ラウンド5: P5 bash 除外の根因修正 (commit 6d8b1c8)
- **subagent 調査で発見**: `getActiveTools()` の戻り値がツールオブジェクト配列なのに `new Set(parentActiveTools)` に入れて `has(toolName)` で検索 → 常に false
- **影響**: in-process subagent が getActiveTools() を返す環境では全ツールが削除される
- **修正**: `.map(t => t.name)` を追加して文字列 Set に変換
- 256 テスト全パス

### ラウンド6: Blog 記事更新 (commit 5cf26a0)
- §10.6 Silent Enforcement Failure を新設
- §11 実装済みテーブルに extractJSON / getActiveTools 修正を追加
- §12 Claim 4 を更新（「実装済み≠動作確認済」の教訓）

### ラウンド7: バグ修正 + テスト実行（未記録）
- subagent/mailbox と cache-friendly-prompt の無制限蓄積を bounded retention 化
- goal runtime の assistant message dedupe を timestamp 単独から usage 含む key に変更
- autoresearch runner の `generatePiRunId` が 100回 git を叩いて `runner.test.ts` timeout していたため、短時間 git hash cache を追加
- `gitAutoCommit` 後は hash cache を invalidate しないと postCommit 判定が古い hash になり、auto commit 済みでも「変更なし」と表示されることを発見・修正
- keep log の legacy JSONL 書き込み後にも auto commit を行い、記録ファイルが未コミットで残る問題を修正
- `npm test` 全体: すべて成功（autoresearch 598 tests / goal 217 tests / subagent 256 tests 等）
- 注意: 現セッションでは autoresearch モードが inactive で、`autoresearch_run` / `autoresearch_log` は tool guard により拒否された。次回は `/autoresearch on` 後に同じ実験を正式記録する。

### ラウンド8: 機能監査テスト + 軽量修正（autoresearch tool guard により未正式記録）
- `.autoresearch/feature-audit/FEATURE_LIST.md` に mekann 拡張全体の機能リストと問題一覧を作成
- 新規テスト 47件を追加し、ContextFork / ResultSchema / ResultStore / ContractEvaluator / GoalRuntime の期待挙動を明文化
- 低リスク修正として zip-repo の `formatFileSize` に GB 表示と負値/非有限値拒否を追加
- subagent の mailbox/final_result 注入上限を縮小し、巨大出力による context 圧迫を軽減
- 確認: 8テストファイル 342 tests 全パス
- 追加確認: `npm test` を bash で実行し、主要 workspace は全パス（sandbox 466 / subagent 282 / zip-repo 61 / autoresearch 609 / goal 227）
- 注意: このセッションでも `autoresearch_run` / `autoresearch_init` が `[ERROR] autoresearch モードが無効です` で拒否されたため、正式な `autoresearch_log` までは到達できなかった

### ラウンド9: 残 issue 対応
- prompt 重複対策: agent-guidelines を短縮し、autoresearch tool promptGuidelines から system prompt と重複する subagent/root 実行ルールを削減
- plan-mode: 古い `<proposed_plan>` compact を string content にも対応。配列 content は後方 scan にして「本当に最新」の plan だけ残す
- cache-friendly-prompt: dynamic tail を 12,000 chars で切り詰め、肥大化を抑制
- autoresearch activation: `/autoresearch on <purpose>` の追加コンテキストを 2,000 chars に制限
- goal: 未使用の `renderGoalContext` を削除。budget_limited 中に token_budget を十分引き上げた場合は自動的に active 復帰
- contract evaluator: contract v1 で禁止されている manual acceptance が到達した場合は silently threshold 判定せず pause
- 確認: targeted 10 test files 653 tests 全パス、`npm test` 主要 workspace 全パス（sandbox 466 / subagent 282 / zip-repo 61 / autoresearch 608 / goal 223）

## Memo

- 次セッション開始時にやること:
  1. observation outcome + code block wrapping の実証（ResultStore 保存確認）
  2. propose_patch + preamble example の効果確認
  3. retry_agent_result の outcome 応答メッセージ確認
  4. getActiveTools 修正の実証（edit 権限で bash が含まれるか）
