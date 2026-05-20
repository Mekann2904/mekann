# Autoresearch

<!-- AUTORESEARCH:BEGIN generated -->
Current plan: `.autoresearch/plans/plan-f4133aa0fc86/`

## Current objective

pi の subagent 機能を実際に呼び出し（spawn_agent, followup_task, send_message, wait_agent, close_agent）、authority enforcement、result contract、mailbox、lifecycle 管理の振る舞いを実証的に検証する。mock ではなく実際の subagent 呼び出しによるテスト。

## Files

- Plan: `.autoresearch/plans/plan-f4133aa0fc86/plan.md`
- Contract: `.autoresearch/plans/plan-f4133aa0fc86/contract.json`
- Benchmark: `.autoresearch/plans/plan-f4133aa0fc86/benchmark.sh`
- Checks: `.autoresearch/plans/plan-f4133aa0fc86/checks.sh`
- Runs: `.autoresearch/plans/plan-f4133aa0fc86/runs/`
<!-- AUTORESEARCH:END generated -->

## Codebase Patterns

- `tryParseSubagentResult` は `extractJSON` 経由で code block / prose から JSON を抽出するようになった (commit e89680f)
- pi プロセスは起動時に拡張機能をロードする。コード修正は次回セッション開始まで反映されない
- in-process (kitty-log) では authority が enforced。外部 Pi (kitty-split) では enforced=false
- `filterToolsByAuthority`: edit=全ツール, その他=readOnlyAllow のみ

## 試したこと

### ラウンド1-3: 振る舞いテスト（18件検証）
- P1: structured result の JSON パース失敗 → extractJSON で修正
- P2: patch schema が LLM に複雑すぎる → preamble に例を追加
- P3: retry message が固定 → outcome 応答化

### ラウンド4: P1 修正の実証 (commit e89680f, fe3ca8d)
- extractJSON の code-block-in-prose 対応を修正
- 実際の LLM 出力サンプルで unit test 検証: 256 テスト全パス
- **制約発見**: 実行中の pi セッションではコード修正が反映されない
- 次回セッション開始時に subagent 実証テストを再実行する必要あり

## Memo

- 次セッション開始時にやること:
  1. observation outcome + code block wrapping の実証（ResultStore 保存確認）
  2. propose_patch + preamble example の効果確認
  3. retry_agent_result の outcome 応答メッセージ確認
