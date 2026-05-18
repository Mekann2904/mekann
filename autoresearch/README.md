# autoresearch

**評価可能なコード変更を自動反復する実験コントローラー**

コード変更がパフォーマンス指標に与える影響を、自動で測定・記録・管理します。短時間で終わるコマンドから数時間かかるベンチマークまで、実験として一貫して扱えます。

## 目次

* [基本コンセプト](#基本コンセプト)
* [クイックスタート](#クイックスタート)
* [スラッシュコマンド](#スラッシュコマンド)
* [API](#api)

  * [autoresearch_init](#autoresearch_init)
  * [autoresearch_run](#autoresearch_run)
  * [autoresearch_log](#autoresearch_log)
* [出力フォーマット](#出力フォーマット)
* [自動 git 操作](#自動-git-操作)
* [ベンチマークのベストプラクティス](#ベンチマークのベストプラクティス)
* [アーティファクト構造](#アーティファクト構造)
* [セキュリティと安全境界](#セキュリティと安全境界)
* [参考プロジェクト](#参考プロジェクト)

---

## 基本コンセプト

```text
コード変更 → 測定 → 良ければ commit / 悪ければ revert
```

この最適化サイクルを自動化します。パフォーマンス改善、バンドルサイズ削減、テスト実行時間の短縮、長時間ベンチマークの評価などに特に有用です。

**autoresearch は、次の3つのツールで構成されます。**

| ツール                 | 役割                              |
| ------------------- | ------------------------------- |
| `autoresearch_init` | 実験セッションを初期化する。指標名・単位・改善方向を設定する  |
| `autoresearch_run`  | コマンドを実行し、結果を測定する                |
| `autoresearch_log`  | 結果を記録し、`keep` / `discard` を判断する |

---

## クイックスタート

### 1. autoresearch モードを開始

```text
/autoresearch テスト実行時間の最適化
```

autoresearch モードが有効化され、自動ループが開始されます。

* `autoresearch.md` が既にある場合は、その内容を読み直して実験を再開します
* 存在しない場合は、目的・指標・実行コマンドを整理するためのセットアップ用メッセージが表示されます

### 2. 自動ループが回る

エージェントは自律的に以下を繰り返します。

1. 未初期化の場合、`autoresearch_init` でセッションを初期化する
2. コードを変更する
3. `autoresearch_run` でコマンドを実行し、結果を測定する
4. `autoresearch_log` で結果を記録する

   * `keep` → 自動 commit
   * `discard` → 自動 revert
5. 次の改善案に進む

### 3. 状態確認・停止・リセット

```text
/autoresearch status          # 現在の状態を確認
/autoresearch off             # ループを停止
/autoresearch clear           # 全データをリセット
```

---

## スラッシュコマンド

### サブコマンド一覧

| コマンド                         | 説明                                                                          |
| ---------------------------- | --------------------------------------------------------------------------- |
| `/autoresearch <目的文>`        | autoresearch モードを有効化し、ループを開始します。`autoresearch.md` があれば再開し、なければ新規セットアップを行います |
| `/autoresearch on`           | autoresearch モードを有効化します                                                     |
| `/autoresearch off`          | autoresearch モードを無効化します。ループと自動再開を停止します                                      |
| `/autoresearch clear`        | `autoresearch.jsonl` を削除し、全状態をリセットします。モードも OFF になります                        |
| `/autoresearch status`       | 現在の状態を表示します。有効/無効、ループ回数、実験回数、採用数、最良指標を確認できます                                |
| `/autoresearch loop on`      | 自動ループを有効化します                                                                |
| `/autoresearch loop off`     | 自動ループを無効化します                                                                |
| `/autoresearch loop max <N>` | ループの最大反復回数を設定します。正の整数または `none` を指定できます                                     |
| `/autoresearch loop status`  | ループの現在状態を表示します                                                              |

### 自動ループの停止条件

自動ループは、以下のいずれかの条件を満たすと停止します。

* 連続して進捗がない場合

  * `noProgress` カウンターが増加します
  * 上限は2回です
* 反復回数が `maxLoopIterations` に達した場合

  * デフォルトは50回です
* エージェントが `<autoresearch>COMPLETE</autoresearch>` を返した場合

---

## API

### `autoresearch_init`

実験セッションを初期化します。セッションの最初に一度だけ呼び出してください。

| パラメータ         | 必須 | 説明                                  |
| ------------- | -- | ----------------------------------- |
| `name`        | 必須 | セッション名                              |
| `metric_name` | 必須 | 主指標名。例: `total_ms`, `bundle_kb`     |
| `metric_unit` | 任意 | 単位。例: `ms`, `KB`                    |
| `direction`   | 任意 | `lower` または `higher`。デフォルトは `lower` |

### `autoresearch_run`

シェルコマンドを実行し、実行時間と出力を記録します。

| パラメータ                    | 必須 | 説明                            |
| ------------------------ | -- | ----------------------------- |
| `command`                | 必須 | 実行するコマンド                      |
| `timeout_seconds`        | 任意 | タイムアウト秒数。デフォルトは `600`         |
| `checks_timeout_seconds` | 任意 | checks のタイムアウト秒数。デフォルトは `300` |

**返り値:** `piRunId` — 実行を一意に識別する ID

> ワークスペースに `autoresearch.checks.sh` が存在する場合、ベンチマーク成功後に自動実行されます。

### `autoresearch_log`

実験結果を記録します。ステータスに応じて、自動的に commit または revert が実行されます。

| パラメータ         | 必須 | 説明                                                          |
| ------------- | -- | ----------------------------------------------------------- |
| `metric`      | 必須 | 主指標の値                                                       |
| `status`      | 必須 | `keep` / `discard` / `crash` / `checks_failed`              |
| `description` | 必須 | 実験内容の短い説明                                                   |
| `runId`       | 任意 | `autoresearch_run` の `piRunId`。省略時は直前の run に紐付けられますが、警告が出ます |
| `commit`      | 任意 | Git commit hash。省略時は自動設定されます                                |
| `metrics`     | 任意 | 追加指標のオブジェクト                                                 |
| `memo`        | 任意 | メモ                                                          |

---

## 出力フォーマット

コマンドの stdout から以下のタグをパースします。ベンチマークツールが対応している場合、対応する値は自動保存されます。

```text
RUN_ID 20260517T153000.123Z-bench-a1b2c3-k9x4qp
ARTIFACT_DIR logs/benchmarks/task-001/runs/20260517T153000.123Z-bench-a1b2c3-k9x4qp
SUMMARY_PATH logs/benchmarks/.../summary.json
VIEWLOG_PATH logs/benchmarks/.../viewlog.json
METRICS_PATH logs/benchmarks/.../metrics.json
METRIC objective_score=0.7342
```

> これは特定のベンチマークツールに依存しない汎用フォーマットです。これらのタグが出力されなくても、通常の実行記録は行われます。

### piRunId の形式

```text
<UTC timestamp>-pi-<gitShortSha>-<random6hex>
```

**例:** `20260517T153000.123Z-pi-a1b2c3-k9x4qp`

* 文字列ソートでおおむね時系列順になります
* git short SHA を含みます

---

## 自動 git 操作

`autoresearch_log` のステータスに応じて、自動的に git 操作が実行されます。

| ステータス           | 自動アクション                                  |
| --------------- | ---------------------------------------- |
| `keep`          | `git add -A -- ':!.pi'` → `git commit`   |
| `discard`       | revert。`autoresearch.*` / `.pi/` は保護されます |
| `crash`         | revert。`autoresearch.*` / `.pi/` は保護されます |
| `checks_failed` | revert。`autoresearch.*` / `.pi/` は保護されます |

### `keep` のバリデーション

`status=keep` は、以下の条件をすべて満たす場合のみ許可されます。

1. 対応する `autoresearch_run` の結果が存在する
2. タイムアウトしていない
3. 終了コードが `0` である
4. stdout に `METRIC <metricName>=<value>` が含まれている
5. checks がすべて成功している
6. run アーティファクトが正常に保存されている

---

## ベンチマークのベストプラクティス

### timeout を明示指定する

デフォルトは600秒、つまり10分です。長時間のベンチマークでは必ず明示してください。

```yaml
command: ./run_long_benchmark.sh
timeout_seconds: 10800   # 3時間
```

### 終了しないコマンドを指定しない

`--webui` や watch server のように終了しないコマンドは避けてください。timeout に達するとプロセスグループごと強制終了されますが、結果は有効な実験として記録されません。

### 並列 run をしない

同一セッションで複数の `autoresearch_run` を並列実行すると、`runSeq` の競合やアーティファクトの上書きが発生する可能性があります。

**必ず1本ずつ直列に実行してください。**

---

## アーティファクト構造

```text
.pi/autoresearch/<sessionId>/
├── runs/
│   └── <piRunId>/
│       ├── manifest.json        # run 全体のメタデータ
│       ├── stdout.log           # フル stdout。streaming 保存、secret 除去済み
│       ├── stderr.log           # フル stderr。streaming 保存、secret 除去済み
│       ├── metrics.json         # パースされた測定指標
│       ├── command.txt          # 実行されたコマンド
│       ├── result.json          # 実行結果サマリー
│       ├── git.status.txt       # 実行時の git status
│       ├── git.diff             # 実行時の git diff
│       └── checks-result.json   # checks 結果。実行時のみ生成
├── runs.jsonl                   # 全 run の索引。append-only
├── metrics.jsonl                # log 済み run の plot 用データ。append-only
├── decisions.jsonl              # keep/discard 判断履歴。append-only
├── events.jsonl                 # started/completed/timed_out/logged イベント
├── latest.pointer.json          # 直近の logged run へのポインター
└── best.pointer.json            # 最良 run へのポインター
```

### 各ファイルの役割

| ファイル                  | 役割                                                            |
| --------------------- | ------------------------------------------------------------- |
| `runs.jsonl`          | 全 run の索引です。1 run = 1行で、`runSeq` の正本です                        |
| `metrics.jsonl`       | `autoresearch_log` 済み run の plot 用数値データです。未 log の run は含まれません |
| `decisions.jsonl`     | `keep` / `discard` / `crash` / `checks_failed` の判断履歴です        |
| `events.jsonl`        | `started` / `completed` / `timed_out` / `logged` イベントを記録します   |
| `latest.pointer.json` | 直近の logged run を指します。常に更新されます                                 |
| `best.pointer.json`   | 主指標と改善方向に基づく最良 run を指します                                      |

> pointer は既存の immutable な run アーティファクトを指すだけです。pointer 自体を正本にしないでください。

### 安全性

* 既存の run directory は上書きしません。既に存在する場合はエラーになります
* stdout/stderr は実行開始直後から streaming 保存されるため、クラッシュ時も部分ログが残ります
* secret を含む可能性がある値は、自動的に `***REDACTED***` に置換されます

  * 対象例: `API_KEY`, `SECRET`, `PASSWORD`, `TOKEN`, `PRIVATE_KEY`
* プロセス再起動後も、artifact manifest から run データを復元できます

---

## セキュリティと安全境界

### `autoresearch_run` は任意のシェルコマンドを実行する

`autoresearch_run` は、指定されたシェルコマンドをそのまま実行します。

* **信頼できるワークスペースでのみ使用してください**
* サンドボックスは提供していません

### `.pi/` は git 管理対象外

* `gitAutoCommit()` は `git add -A -- ':!.pi'` により `.pi/` を除外します
* `gitAutoRevert()` も `.pi/` を保護します
* プロジェクトの `.gitignore` に `.pi/` を追加することを推奨します

### プロセスグループ kill

timeout 時は、プロセスグループ全体に対して SIGTERM → SIGKILL を送信します。

対象には以下が含まれます。

* bash
* 子プロセス
* 孫プロセス

これにより、Deno や Python のベンチマークが孫プロセスを残す問題を防ぎます。

---

## 参考プロジェクト

本プロジェクトは、以下の2つのプロジェクトを参考に実装されています。

### [karpathy/autoresearch](https://github.com/karpathy/autoresearch)

Andrej Karpathy による、AIエージェントに小規模な LLM 学習セットアップを与え、一晩自律的に実験させるプロジェクトです。

エージェントがコードを変更し、5分間学習し、結果を評価し、`keep` / `discard` を判断し、次の実験へ進むという自律研究サイクルを実現しています。

> “Give an AI agent a small but real LLM training setup and let it experiment autonomously overnight. You wake up in the morning to a log of experiments and (hopefully) a better model.”

### [davebcn87/pi-autoresearch](https://github.com/davebcn87/pi-autoresearch)

`karpathy/autoresearch` のコンセプトを、[pi](https://pi.dev/) コーディングエージェントの拡張機能として実装したプロジェクトです。

LLM 学習に限らず、テスト速度、バンドルサイズ、ビルド時間、Lighthouse スコアなど、任意の最適化ターゲットに対応します。

---

## テスト

```bash
cd autoresearch && npm test
```
