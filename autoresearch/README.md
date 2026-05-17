# autoresearch

評価可能な変更を自動反復する実験コントローラ — コード変更がパフォーマンス指標に与える影響を自動測定・記録・管理する。短時間コマンドから長時間 benchmark（数十分〜数時間）まで安全に扱える。

> **autoresearch は「AIが自由に研究する機能」ではありません。**
> 変更候補を `run → log → keep/discard` の評価ループに通す仕組みです。
> 明確な数値指標と評価関数が存在するタスクでのみ使用してください。

## 概要

「コード変更 → 測定 → 良ければ commit、悪ければ revert」という最適化サイクルを自動化する。パフォーマンス改善、バンドルサイズ削減、テスト実行時間の短縮、長時間 benchmark の評価などに特に有用。

## セキュリティと安全境界

### `autoresearch_run` は任意のシェルコマンドを実行する

- **信頼できるワークスペースでのみ使用してください**
- コマンドは現在のワークスペース配下で実行されますが、サンドボックスは提供していません

### `.pi/` は git 管理対象外

`.pi/autoresearch/` には run の stdout/stderr、manifest、ledger 等の監査用 artifact が保存されますが、これらは **git commit 対象外** です。

- `gitAutoCommit()` は `git add -A -- ':!.pi'` を使用し、`.pi/` を除外します
- `gitAutoRevert()` も `.pi/` を保護対象に含みます
- プロジェクトの `.gitignore` にも `.pi/` の追加を推奨します

### `keep` バリデーション

`status=keep` は以下の条件を**すべて**満たす場合のみ許可されます：

1. 対応する `autoresearch_run` の結果が存在する（メモリまたは artifact manifest）
2. run がタイムアウトしていない
3. run の終了コードが 0（成功）である
4. run の stdout に主指標 `METRIC <metricName>=<value>` が含まれている
5. checks が定義されていて失敗している場合は拒否される
6. run artifact が正常に保存されている

条件を満たさない `keep` は拒否され、理由が列挙されます。

## long-run benchmark での使用

### timeout 設定

デフォルトの timeout は 600秒（10分）です。長時間 benchmark では `timeout_seconds` を明示指定してください：

```
autoresearch_run:
  command: ./run_long_benchmark.sh
  timeout_seconds: 10800  # 3時間
```

### 終了しないコマンドを入れない

`--webui` や watch server のように終了しないコマンドを benchmark command にしないでください。timeout でプロセスグループごと強制終了されますが、結果は記録されません。

### プロセスグループ kill

timeout 時は単一プロセスではなく、プロセスグループ全体（bash + 子プロセス + 孫プロセス）に SIGTERM → SIGKILL を送信します。これにより、Deno や Python の benchmark が孫プロセスを残す問題を防ぎます。

### 同一 session での並列 run は非対応

`autoresearch_run` は `runs.jsonl` の行数から runSeq を採番しています。同一 session で複数の `autoresearch_run` を並列実行すると、runSeq 競合や artifact 上書きが発生します。必ず1本ずつ直列に実行してください。

### Streaming stdout/stderr 保存

run の開始直後に `stdout.log` / `stderr.log` が作成され、実行中に streaming write されます。プロセスクラッシュ時も部分ログが残ります。

### 外部 artifact の自動保存

外部 benchmark が以下の形式で stdout に出力する場合、pi 側で自動的に保存・対応づけを行います：

```
RUN_ID 20260517T153000.123Z-bench-a1b2c3-k9x4qp
ARTIFACT_DIR logs/benchmarks/task-001/runs/20260517T153000.123Z-bench-a1b2c3-k9x4qp
SUMMARY_PATH logs/benchmarks/.../summary.json
VIEWLOG_PATH logs/benchmarks/.../viewlog.json
METRICS_PATH logs/benchmarks/.../metrics.json
METRIC objective_score=0.7342
```

これらは特定 benchmark 名に依存しない汎用フォーマットです。存在しない benchmark でも通常動作します。

### プロセス再起動後の log

run 完了後にプロセス再起動やセッション切れが起きた場合でも、artifact manifest から run データを復元して `autoresearch_log` を実行できます。メモリマップ → manifest ファイルの順で検索します。

## piRunId 設計

**形式**: `<UTC timestamp>-pi-<gitShortSha>-<random6hex>`

**例**: `20260517T153000.123Z-pi-a1b2c3-k9x4qp`

- 時系列ソート可能（文字列ソートで概ね時系列順）
- UUID v4 不使用（タイムスタンプベース）
- git short SHA を含む

## Run と Log の対応関係

- `autoresearch_run` が返す `piRunId` を `autoresearch_log` の `runId` に渡して紐付けます
- 存在しない `piRunId` は拒否されます（メモリと artifact の両方を検索）
- `runId` 省略時は直前の run に紐付け（警告付き）

## Artifact 保存構造

```
.pi/autoresearch/<sessionId>/
├── runs/
│   └── <piRunId>/
│       ├── manifest.json      # run全体のメタデータ
│       ├── stdout.log         # フル stdout（streaming, secret 除去済み）
│       ├── stderr.log         # フル stderr（streaming, secret 除去済み）
│       ├── metrics.json       # パースされた測定指標
│       ├── command.txt        # 実行されたコマンド
│       ├── result.json        # 実行結果サマリー
│       ├── git.status.txt     # 実行時の git status
│       ├── git.diff           # 実行時の git diff
│       └── checks-result.json # checks 結果（実行時のみ）
├── runs.jsonl                 # 全 run の索引（append-only）
├── metrics.jsonl              # plot 用数値データ（append-only）
├── decisions.jsonl            # keep/discard 判断履歴（append-only）
├── events.jsonl               # started/completed/timed_out/logged イベント
├── latest.pointer.json        # 最新 run へのポインタ
└── best.pointer.json          # 最良 run へのポインタ
```

### Artifact の安全性

- 既存 run directory は上書きしません（エラーになります）
- stdout/stderr は実行開始直後に streaming 保存し、クラッシュ時も部分ログが残ります
- secret（API_KEY, SECRET, PASSWORD, TOKEN, PRIVATE_KEY）は自動的に `***REDACTED***` に置換
- `.pi/` は `git add -A` の対象外です

## runSeq の採番

`runSeq` は `state.runCount` ではなく `runs.jsonl` の既存行数から採番します。これにより、`autoresearch_log` 前に複数回 `autoresearch_run` しても runSeq が重複しません。plot 順序の正本として `runSeq` を使用してください。

## Append-only Ledger

- `runs.jsonl` — 全 run の索引（1run 1行）
- `metrics.jsonl` — plot 用数値データ（1run 1行、`runSeq` を含む）
- `decisions.jsonl` — keep/discard/crash/checks_failed の判断履歴
- `events.jsonl` — started/completed/timed_out/logged イベント

## Pointer

- `latest.pointer.json` — 直近の logged run を指す（常に更新）
- `best.pointer.json` — primary metric と direction に基づく最良 run を指す

pointer は既存 immutable run artifact を指すだけです。pointer 自体を正本にしないでください。

## 自動 git 操作

| `autoresearch_log` のステータス | 自動アクション |
|---|---|
| `keep` | `git add -A -- ':!.pi' && git commit` |
| `discard` | revert（`autoresearch.*` / `.pi/` は保護） |
| `crash` | revert（`autoresearch.*` / `.pi/` は保護） |
| `checks_failed` | revert（`autoresearch.*` / `.pi/` は保護） |

## テスト

```bash
cd autoresearch && npm test
```

## 破壊的変更

- `runId` の形式が `<timestamp>-pi-<sha>-<random6>` に変更
- 存在しない `runId` は manifest artifact を検索した上で拒否
- `keep` には run 出力に主指標が含まれていることが必要
- `keep` には artifact が正常保存されていることが必要
- timeout / exitCode != 0 の run は keep 不可
- `.pi/` は git commit 対象外（`git add -A` で除外）
- stdout/stderr は streaming 保存（実行開始直後にファイル作成）
