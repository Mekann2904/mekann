# autoresearch

評価可能な変更を自動反復する実験コントローラ — コード変更がパフォーマンス指標に与える影響を自動測定・記録・管理する。

> **autoresearch は「AIが自由に研究する機能」ではありません。**
> 変更候補を `run → log → keep/discard` の評価ループに通す仕組みです。
> 明確な数値指標と評価関数が存在するタスクでのみ使用してください。

## 概要

「コード変更 → 測定 → 良ければ commit、悪ければ revert」という最適化サイクルを自動化する。パフォーマンス改善、バンドルサイズ削減、テスト実行時間の短縮などの実験的作業に特に有用。

エージェントは `autoresearch-create` skill を読み込み、`autoresearch.md` と `autoresearch.sh` を作成し、停止されるまで自律的に実験を繰り返す。

**autoresearch は明示的な `/autoresearch on` または `/autoresearch <目的>` でのみ有効化される。** ツールはモード無効時には拒否され、`autoresearch-create` skill も LLM による自動選択の対象外（`disable-model-invocation: true`）。明示的に `/skill:autoresearch-create` で呼び出した場合のみ利用できる。

## 向いているタスク

以下の条件を満たすタスクに適しています：

- **明確な数値指標がある** — ミリ秒、キロバイト、スコアなど
- **自動測定可能** — シェルコマンドで再現可能な測定ができる
- **変更の良し悪しが数値で判定できる**

具体的な例：

- テスト実行時間の高速化
- ベンチマークスコアの改善
- バンドルサイズの削減
- CLI 起動時間の短縮
- typecheck / lint / test エラー数の削減
- メモリ使用量の削減
- ビルド時間の短縮

## 向いていないタスク

以下のタスクには**使用しないでください**：

- **UX 判断** — ユーザー体験の質は数値化困難
- **プロダクト方針** — 戦略的決定には人間の判断が必要
- **セキュリティ設計の良し悪し** — 脆弱性の評価は専門家が行うべき
- **抽象化や保守性の主観的改善** — 「コードがきれいになった」は測定不能
- **評価関数が存在しない設計判断** — 数値で比較できない変更は適用外
- **新機能の実装** — 既存指標への影響が不明

## セキュリティと安全境界

### `autoresearch_run` は任意のシェルコマンドを実行する

`autoresearch_run` は `bash -c <command>` で任意のコマンドを実行します。以下の点に注意してください：

- **信頼できるワークスペースでのみ使用してください**
- 実行されるコマンドは AI が生成するため、意図しない操作が行われる可能性があります
- 危険なコマンド（`rm -rf /`、機密ファイルの送信など）を実行しないよう、ユーザーが最終的に責任を負う必要があります
- コマンドは現在のワークスペース配下で実行されますが、サンドボックスは提供していません
- 将来的に `sandbox` 拡張（`read_only` / `workspace_write` / `dangerously_unsandboxed`）との連携を予定していますが、現時点では統合されていません

### `keep` バリデーション

`autoresearch_log` の `status=keep` は以下の条件を**すべて**満たす場合のみ許可されます：

1. 対応する `autoresearch_run` の結果が存在する
2. run がタイムアウトしていない
3. run の終了コードが 0（成功）である
4. checks が定義されていて失敗している場合は拒否される
5. 主指標 metric が提供されている

条件を満たさない `keep` は拒否され、エラーメッセージとともに次に取るべきアクションが提示されます。

## 提供するもの

### 3つのツール

| ツール | 役割 |
|---|---|
| `autoresearch_init` | セッションの初期化（名前、指標、単位、方向） |
| `autoresearch_run` | コマンドを実行し、実行時間と出力を記録。一意な `runId` を返す。`METRIC name=value` 行を自動パース |
| `autoresearch_log` | 結果を `autoresearch.jsonl` に記録。`runId` で run と紐付け。ステータスに応じて自動 commit / revert |

### runId 追跡

- `autoresearch_run` は各実行に一意な `runId`（8文字）を付与します
- `autoresearch_log` は対応する `runId` を検証し、不正な `runId` を拒否します
- `runId` を省略した場合は直前の run に自動的に紐付けられます
- JSONL 履歴に `runId` が記録されるため、実験の完全な追跡が可能です

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

## checks（任意）

プロジェクトルートに `autoresearch.checks.sh` を置くと、ベンチマーク成功後に自動実行される（型チェック、lint、テストなど）。チェックが失敗した場合は `checks_failed` として記録され、`keep` は選択できない。

### 推奨例

```bash
#!/bin/bash
set -euo pipefail

pnpm test --run --reporter=dot
pnpm typecheck
```

### 出力を短くする例

exit code が壊れないように `grep` や `tail` はパイプラインの最後に配置し、`set -eo pipefail` を使用してください。`|| true` で失敗を握りつぶさないでください。

```bash
#!/bin/bash
set -eo pipefail

pnpm test --run --reporter=dot 2>&1 | tail -20
pnpm typecheck 2>&1 | tail -5
```

## JSONL 履歴の Provenance

`autoresearch.jsonl` の各 run エントリには以下のフィールドが記録されます：

| フィールド | 説明 |
|---|---|
| `runId` | 実行の一意なID |
| `run` | 実験番号 |
| `status` | keep / discard / crash / checks_failed |
| `metric` | 主指標の値 |
| `command` | 実行されたコマンド |
| `exitCode` | コマンドの終了コード |
| `timedOut` | タイムアウトしたか |
| `checksPassed` | checks の結果（null = 未実行） |
| `preCommit` | 実験前のコミットハッシュ |
| `postCommit` | 実験後（commit/revert後）のコミットハッシュ |
| `dirtyBefore` | 実験前に未コミット変更があったか |
| `dirtyAfter` | 実験後に未コミット変更があったか |
| `changedFiles` | 変更されたファイルのリスト |
| `timestamp` | 記録時刻（UNIX epoch ms） |
| `description` | 実験内容の説明 |
| `notes` | メモ |

これにより、JSONL から実験履歴とコミット履歴を完全に復元できます。

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
├── runner.ts         # コマンド実行・checks 実行・git操作
├── render.ts         # widget 表示文字列の生成
├── index.test.ts     # 拡張機能のテスト
├── state.test.ts     # state.ts のテスト
├── runner.test.ts    # runner.ts のテスト
├── skill.test.ts     # skill・package.json の検証テスト
├── vitest.config.ts
└── package.json
```

## テスト

```bash
cd autoresearch && npm test
```

## 互換性に関する注意点

- `runId` パラメータは省略可能。省略時は直前の run に自動紐付け。
- `runId` なしで `keep` を呼び出す場合、`autoresearch_run` が先に実行されている必要があります。
- `discard` / `crash` / `checks_failed` は `runId` なしでも呼び出し可能（後方互換）。
- 古い JSONL 形式（`runId` なし）も引き続き読み込み可能です。

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
- sandbox 拡張との連携（コマンド実行のサンドボックス化）
