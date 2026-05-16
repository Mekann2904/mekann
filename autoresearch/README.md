# autoresearch

自律的実験ループ拡張機能 — コード変更がパフォーマンス指標に与える影響を自動測定・記録・管理する。

## 概要

「コード変更 → 測定 → 良ければ commit、悪ければ revert」という最適化サイクルを自動化する。パフォーマンス改善、バンドルサイズ削減、テスト実行時間の短縮などの実験的作業に特に有用。

エージェントは `autoresearch-create` skill を読み込み、`autoresearch.md` と `autoresearch.sh` を作成し、停止されるまで自律的に実験を繰り返す。

**autoresearch は明示的な `/autoresearch on` または `/autoresearch <目的>` でのみ有効化される。** ツールはモード無効時には拒否され、`autoresearch-create` skill も LLM による自動選択の対象外（`disable-model-invocation: true`）。明示的に `/skill:autoresearch-create` で呼び出した場合のみ利用できる。

## 提供するもの

### 3つのツール

| ツール | 役割 |
|---|---|
| `autoresearch_init` | セッションの初期化（名前、指標、単位、方向） |
| `autoresearch_run` | コマンドを実行し、実行時間と出力を記録。`METRIC name=value` 行を自動パース |
| `autoresearch_log` | 結果を `autoresearch.jsonl` に記録。ステータスに応じて自動 commit / revert |

### Ralph-style loop

`/autoresearch on` または `/autoresearch <目的>` は Ralph 方式の watchdog loop も有効化する。各 agent turn の終了時に、拡張機能が `agent_end` で進捗を確認し、`autoresearch_log` まで進んでいれば次イテレーション用の follow-up を自動投入する。

- 1ターン1実験を基本にして、コンテキストを小さく保つ
- 記憶は `autoresearch.md` / `autoresearch.ideas.md` / `autoresearch.jsonl` / git history に残す
- 進捗なし終了が続くと自動停止する（空回り防止）
- 上限回数に達すると停止する
- エージェントが `<autoresearch>COMPLETE</autoresearch>` を出力すると停止する

### コマンド

```
/autoresearch              → status（現在の状態を表示）
/autoresearch on           → モード有効化
/autoresearch off          → モード無効化
/autoresearch clear        → データをクリア
/autoresearch loop status  → loop 状態を表示
/autoresearch loop on      → watchdog loop を有効化
/autoresearch loop off     → watchdog loop を無効化
/autoresearch loop max <n|none> → loop 上限回数を設定
/autoresearch <目的文>      → モード有効化＋目的文をエージェントに送信
```

### その他

- `before_agent_start` — モード有効時に日本語 system prompt を追記
- `agent_end` — Ralph 方式の watchdog loop で次イテレーションを自動投入
- 日本語ステータス widget（実験回数・採用数・最良指標・loop状態を表示）
- `session_start` — `autoresearch.jsonl` から状態を復元

## ワークフロー

```
1. /autoresearch テスト実行時間を最適化したい
2. エージェントが autoresearch-create skill を読み込む
3. autoresearch.md + autoresearch.sh を作成
4. autoresearch_init → autoresearch_run（ベースライン）→ autoresearch_log
5. コードを変更 → autoresearch_run → autoresearch_log（改善なら keep、悪化なら discard）
6. `agent_end` の watchdog が follow-up を投入し、停止条件まで 5 を繰り返す
```

## 自動 git 操作

| `autoresearch_log` のステータス | 自動アクション |
|---|---|
| `keep` | `git add -A && git commit` |
| `discard` | 作業ツリーを revert（`autoresearch.*` は保護） |
| `crash` | 作業ツリーを revert（`autoresearch.*` は保護） |
| `checks_failed` | 作業ツリーを revert（`autoresearch.*` は保護） |

`checks_failed` の場合、`keep` は拒否される。

## checks（任意）

プロジェクトルートに `autoresearch.checks.sh` を置くと、ベンチマーク成功後に自動実行される（型チェック、lint、テストなど）。チェックが失敗した場合は `checks_failed` として記録され、`keep` は選択できない。

```bash
#!/bin/bash
set -euo pipefail
pnpm test --run --reporter=dot 2>&1 | tail -50
pnpm typecheck 2>&1 | grep -i error || true
```

## セッションファイル

| ファイル | 役割 |
|---|---|
| `autoresearch.jsonl` | 設定・実験結果の履歴（JSON Lines 形式） |
| `autoresearch.md` | 実験ルール・対象ファイル・試したこと（エージェントが参照） |
| `autoresearch.sh` | ベンチマークスクリプト。`METRIC name=value` 行を出力する |
| `autoresearch.ideas.md` | 有望だが今すぐ試さない最適化案のバックログ |
| `autoresearch.checks.sh` | 正確性チェック（任意） |

`autoresearch.*` は revert 対象から保護される。

## 構造

```
autoresearch/
├── index.ts          # 拡張機能エントリ（ツール・コマンド・イベント登録）
├── state.ts          # JSONL 解析・状態管理の純粋関数
├── runner.ts         # コマンド実行・checks 実行
├── render.ts         # widget 表示文字列の生成
├── index.test.ts     # 拡張機能のテスト
├── state.test.ts     # state.ts のテスト
├── skill.test.ts     # skill・package.json の検証テスト
├── vitest.config.ts
└── package.json
```

## テスト

```bash
cd autoresearch && npm test
```

## 未移植の機能

最小構成として以下は未移植。段階的に追加可能。

- hooks（before.sh / after.sh による反復前後の処理）
- フルダッシュボード（テーブル展開・折りたたみ）
- compaction（コンテキスト圧縮時の要約）
- セグメント（複数 init による再初期化）
- セカンダリメトリクス（追加指標の自動追跡）
- ASI（Actionable Side Information）
- 信頼度スコア（MAD ベースノイズ推定）
- autoresearch.config.json（workingDir, maxIterations）
- キーボードショートカット
- finalize（実験ブランチの整理・レビュー用分割）
