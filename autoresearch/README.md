# autoresearch

**評価可能なコード変更を自動反復する実験コントローラー**

コード変更がパフォーマンス指標に与える影響を、自動で測定・記録・管理します。短時間で終わるコマンドから数時間かかるベンチマークまで、実験として一貫して扱えます。

## 設計思想

mekann/autoresearch は、2つの異なるアプローチを組み合わせています。

[karpathy/autoresearch](https://github.com/karpathy/autoresearch) は「何を測定し、どう評価するか」のフレームワークです。コードを変更し、ベンチマークを実行し、結果を評価し、`keep` / `discard` を判断するサイクルを定義します。ただし、ループの駆動はエージェント自身に委ねられており、コンテキストはセッション内で維持されます。

[Ralph Wiggum テクニック](https://ghuntley.com/ralph/) は「どう回すか」の実行パターンです。エージェントを while ループで回し、1ターンにつき1つのタスクだけを行い、停止されるまで自律的に繰り返します。毎ターン context window がリセットされるため、進捗はすべて外部ファイルに永続化されます。

| | karpathy/autoresearch | Ralph |
|---|---|---|
| 提供するもの | 評価フレームワーク（測定 → keep/discard） | 実行パターン（while loop、1ターン1タスク） |
| ループの駆動 | エージェント自身 | 外部の while ループ |
| コンテキスト | セッション内で維持 | 毎ターンリセット |
| 状態の永続化 | エージェントのメモリ内 | 外部ファイル |

mekann/autoresearch は、この2つを組み合わせます。

- **karpathy/autoresearch** から「測定 → 評価 → keep/discard → commit/revert」の評価サイクル
- **Ralph** から「1ターン1タスク」「毎ターンのコンテキストリセット」「外部ファイル（`autoresearch.md`）への学びの永続化」

これにより、長時間の自動実験でもコンテキストウィンドウの肥大化を防ぎ、安定した自律ループを実現します。

## 目次

* [設計思想](#設計思想)
* [基本コンセプト](#基本コンセプト)
* [クイックスタート](#クイックスタート)
* [スラッシュコマンド](#スラッシュコマンド)
* [API](#api)

  * [autoresearch_evaluate_query](#autoresearch_evaluate_query)
  * [autoresearch_init](#autoresearch_init)
  * [autoresearch_run](#autoresearch_run)
  * [autoresearch_log](#autoresearch_log)
* [出力フォーマット](#出力フォーマット)
* [自動 git 操作](#自動-git-操作)
* [ベンチマークのベストプラクティス](#ベンチマークのベストプラクティス)
* [アーティファクト構造](#アーティファクト構造)
* [セキュリティと安全境界](#セキュリティと安全境界)
* [参考プロジェクト](#参考プロジェクト)
  * [karpathy/autoresearch](#karpathyautoresearch)
  * [Geoffrey Huntley - Ralph Wiggum テクニック](#geoffrey-huntley---ralph-wiggum-テクニック)
  * [davebcn87/pi-autoresearch](#davebcn87pi-autoresearch)

---

## 基本コンセプト

```text
コード変更 → 測定 → 良ければ commit / 悪ければ revert
```

この最適化サイクルを自動化します。パフォーマンス改善、バンドルサイズ削減、テスト実行時間の短縮、長時間ベンチマークの評価などに特に有用です。

**autoresearch は、次の4つのツールで構成されます。**

| ツール                            | 役割                                                                   |
| ------------------------------ | -------------------------------------------------------------------- |
| `autoresearch_evaluate_query` | ユーザの自然文クエリを評価し、実験契約に変換できるか判定する                                       |
| `autoresearch_init`            | 実験セッションを初期化する。指標名・単位・改善方向を設定する                                       |
| `autoresearch_run`             | コマンドを実行し、結果を測定する                                                     |
| `autoresearch_log`             | 結果を記録し、`keep` / `discard` を判断する                                      |

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

### 自動ループの仕組み

`/autoresearch on` または `/autoresearch <目的文>` でモードを有効化すると、自動ループが開始されます。エージェントはユーザーに毎回継続確認せず、停止されるまで自律的に実験を繰り返します。

**1ターンの流れ:**

```
while active:
    autoresearch.md を読む（過去の学びを確認）
    コードを1箇所変更
    autoresearch_run でコマンドを実行
    autoresearch_log で結果を記録（自動 commit / revert）
    学んだことを autoresearch.md に記録
    # 拡張機能が自動で次ターンを開始
```

各ターンでは原則1つの実験だけを行います。コンテキストウィンドウを節約し、各イテレーションで確実な進捗を作ります。エージェントは自分で次に何をすべきか判断し、ユーザーに毎回確認しません。

**停止条件:**

| 条件 | 詳細 |
|---|---|
| 連続進捗なし | `noProgress` カウンターが上限(デフォルト: 2回)に達すると自動停止 |
| 反復上限 | `maxLoopIterations`(デフォルト: 50回)に達すると自動停止。`/autoresearch loop max` で変更可能 |
| 完了マーカー | エージェントが `<autoresearch>COMPLETE</autoresearch>` を返した場合、有望な実験が尽きたと判断して停止 |
| 手動停止 | `/autoresearch off` で即座に停止 |

---

## API

### `autoresearch_evaluate_query`

ユーザの自然文クエリを評価し、autoresearch の実験契約に変換できるかを判定します。autoresearch モードの有効/無効に関わらず利用できます。

| パラメータ   | 必須 | 説明                 |
| ------- | -- | ------------------ |
| `query` | 必須 | ユーザの自然文クエリ         |

**返り値:** `decision`（判定結果）、`scores`（スコア群）、`contractDraft`（契約ドラフト）、`blockingIssues`、`riskFlags`、`suggestedRewrite`、`clarifyingQuestions`

#### decision の意味

| decision                | 意味                                                        |
| ----------------------- | ---------------------------------------------------------- |
| `ready_for_run`         | 実験契約が完備。`autoresearch_init` → `autoresearch_run` → checks/log/keep 判断まで安全に進める。`ready_for_run` は `autoresearch_run` 単体ではなく、run 後に checks と log/keep/discard 判断まで進められる状態を意味する |
| `ready_for_init`        | init は可能だが run に必要な情報（benchmark command / checks）が不足     |
| `needs_command`         | benchmark command が未指定                                        |
| `needs_metric_extraction` | metric の抽出方法（wall-clock / stdout / report file）が未確定      |
| `needs_checks_policy`   | 検証方針（checks command または autoresearch.checks.sh）が未指定        |
| `needs_metric_design`   | 目的はあるが主指標が未定義。metric 候補の検討が必要                           |
| `needs_rewrite`         | クエリが広すぎるまたは曖昧。具体化が必要                                       |
| `reject`                | 危険な操作を含むため実験不可                                            |

#### スコアの意味

| スコア              | 意味                                      |
| ----------------- | --------------------------------------- |
| `readiness`       | 実験開始可能性（weakest-link: 他スコアの最小値）         |
| `completeness`    | 必須フィールドの充足率                             |
| `measurability`   | 指標化可能性（metric 名 + direction + metric 抽出確定）         |
| `commandReadiness`| benchmark command の準備状況（checks の準備状況は `readiness.checksReady` と `reproducibility` に反映される） |
| `scopeClarity`    | 対象範囲の明確さ                                |
| `safety`          | 安全性（risk flag なし = 1、あり = 0）            |
| `reproducibility` | 再現可能性（benchmark command + checks 確定 + metric 抽出確定） |

#### 段階別 readiness

評価結果には `readiness` オブジェクトが含まれ、各段階に進めるかを boolean で示します。

| フィールド                 | 意味                                                        |
| ---------------------- | ---------------------------------------------------------- |
| `initReady`            | `autoresearch_init` に必要な情報（目的・指標・方向）が揃っている              |
| `runReady`             | `autoresearch_run` に必要な情報（init + command + metric 抽出）が揃っている |
| `metricExtractionReady`| metric の抽出方法が確定している                                         |
| `checksReady`          | 検証方針（checks command または autoresearch.checks.sh）が指定されている    |
| `logReady`             | `autoresearch_log` まで安全に進められる（runReady + checksReady）        |

#### 測定方法（measurementMethod）

主指標をどうやって測定するかを示します。

| measurementMethod | 意味                                 | extractionConfidence |
| ----------------- | ---------------------------------- | -------------------- |
| `wall_clock`      | 実行時間を autoresearch_run が自動測定        | 1.0                  |
| `stdout_metric`   | stdout の `METRIC name=value` から抽出   | 0.9                  |
| `report_file`     | カバレッジレポート等のファイルから抽出                 | 0.6                  |
| `unknown`         | 抽出方法が不明                             | 0.3                  |

#### 検証方針（checksPolicy）

| checksPolicy            | 意味                                           |
| ----------------------- | -------------------------------------------- |
| `explicit_command`      | クエリ内に checks command が明示されている                   |
| `autoresearch_checks_sh`| `autoresearch.checks.sh` または「既存 checks」の記述がある |
| `not_specified`         | 検証方針が未指定                                       |

#### 使用例

**曖昧なクエリ（ready_for_init）:**

```text
ユーザ入力: prepush を速くしたい

判定: ready_for_init
段階別 readiness:
- initReady: true
- runReady: false
- metricExtractionReady: true
- checksReady: false
- logReady: false
測定方法: wall_clock (extractionConfidence: 1.00)
checks policy: not_specified
```

**明確なクエリ（ready_for_run）:**

```text
ユーザ入力: `npm run prepush` の実行時間を短縮したい。metric は duration_seconds、lower is better。既存 checks を使う。

判定: ready_for_run
段階別 readiness:
- initReady: true
- runReady: true
- metricExtractionReady: true
- checksReady: true
- logReady: true
測定方法: wall_clock (extractionConfidence: 1.00)
checks policy: autoresearch_checks_sh
```

**command はあるが checks 未指定（needs_checks_policy）:**

```text
ユーザ入力: `pnpm test` の時間を短縮したい

判定: needs_checks_policy
段階別 readiness:
- initReady: true
- runReady: true
- metricExtractionReady: true
- checksReady: false
- logReady: false
測定方法: wall_clock
checks policy: not_specified
```

**coverage（needs_metric_extraction）:**

```text
ユーザ入力: `npm run coverage` で coverage を上げたい

判定: needs_metric_extraction
段階別 readiness:
- initReady: true
- runReady: false
- metricExtractionReady: false
- checksReady: false
- logReady: false
測定方法: unknown (extractionConfidence: 0.30)
```

**広すぎるクエリ（needs_rewrite）:**

```text
ユーザ入力: コード品質を上げたい

判定: needs_rewrite
推奨書き換え: 目的が広すぎるため、まず測定可能な proxy metric を選ぶ必要があります。
候補: lint violation 数、型エラー数、重複行数、複雑度、test coverage、prepush 実行時間。
```

**危険なクエリ（reject）:**

```text
ユーザ入力: sudo rm -rf / して全部消してから最適化して

判定: reject
リスク:
- ⚠️ 破壊的ファイル削除 (rm -rf)
- ⚠️ 管理者権限の使用 (sudo)
safety: 0
```

---

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

**返り値:** `piRunId` - 実行を一意に識別する ID

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

本プロジェクトは、以下のプロジェクトと手法を参考に実装されています。

### [karpathy/autoresearch](https://github.com/karpathy/autoresearch)

Andrej Karpathy による、AIエージェントに小規模な LLM 学習セットアップを与え、一晩自律的に実験させるプロジェクトです。

エージェントがコードを変更し、5分間学習し、結果を評価し、`keep` / `discard` を判断し、次の実験へ進むという自律研究サイクルを実現しています。

> "Give an AI agent a small but real LLM training setup and let it experiment autonomously overnight. You wake up in the morning to a log of experiments and (hopefully) a better model."

### [Geoffrey Huntley — Ralph Wiggum テクニック](https://ghuntley.com/ralph/)

AIエージェントを `while` ループで回す実行パターンです。

```bash
while :; do cat PROMPT.md | claude-code; done
```

### [davebcn87/pi-autoresearch](https://github.com/davebcn87/pi-autoresearch)

`karpathy/autoresearch` のコンセプトを、[pi](https://pi.dev/) コーディングエージェントの拡張機能として実装したプロジェクトです。

LLM 学習に限らず、テスト速度、バンドルサイズ、ビルド時間、Lighthouse スコアなど、任意の最適化ターゲットに対応します。

---

## テスト

```bash
cd autoresearch && npm test
```
