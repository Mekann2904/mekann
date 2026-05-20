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
- **Ralph** から「1ターン1タスク」「毎ターンのコンテキストリセット」「外部ファイル（`.autoresearch/plans/<planId>/notes.md` など）への学びの永続化」

これにより、長時間の自動実験でもコンテキストウィンドウの肥大化を防ぎ、安定した自律ループを実現します。

## 目次

* [設計思想](#設計思想)
* [基本コンセプト](#基本コンセプト)
* [クイックスタート](#クイックスタート)
* [スラッシュコマンド](#スラッシュコマンド)
* [API](#api)

  * [autoresearch_evaluate_query](#autoresearch_evaluate_query)
  * [autoresearch_init](#autoresearch_init)
  * [autoresearch_plan](#autoresearch_plan)
  * [autoresearch_approve](#autoresearch_approve)
  * [autoresearch_run](#autoresearch_run)
  * [autoresearch_candidate_escrow](#autoresearch_candidate_escrow)
  * [autoresearch_apply_candidate](#autoresearch_apply_candidate)
  * [autoresearch_run_contract](#autoresearch_run_contract)
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

**autoresearch は、基本ツールと subagent 連携用 candidate ツールで構成されます。**

| ツール                            | 役割                                                                   |
| ------------------------------ | -------------------------------------------------------------------- |
| `autoresearch_evaluate_query` | ユーザの自然文クエリを評価し、実験契約に変換できるか判定する                                       |
| `autoresearch_init`            | 実験セッションを初期化する。指標名・単位・改善方向を設定する                                       |
| `autoresearch_plan`            | 自然文クエリから `autoresearch.plan.md` の draft を生成する                        |
| `autoresearch_approve`         | plan の contract block を validate し、baseline を測定する                    |
| `autoresearch_run`             | コマンドを実行し、結果を測定する                                                     |
| `autoresearch_candidate_escrow` | pending subagent patch result を plan-scoped candidate として凍結する             |
| `autoresearch_apply_candidate` | candidate を main worktree に一時適用する。subagent result は `applied` にしない                    |
| `autoresearch_apply_candidate_isolated` | candidate を `.pi/autoresearch-worktrees/<candidateId>` に一時適用する |
| `autoresearch_suggest_subagents` | current contract から scout/proposer/critic の spawn payload を提案する |
| `autoresearch_list_candidates` / `autoresearch_show_candidate` / `autoresearch_reject_candidate` | candidate を確認・棄却する |
| `autoresearch_run_contract`    | contract に従って checks/benchmark/repeats/aggregate/acceptance を実行する      |
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
/autoresearch clear           # current state をリセット（plans/runs は保持）
/autoresearch clear all       # 監査履歴も含めて全データを削除
```

---

## スラッシュコマンド

### サブコマンド一覧

| コマンド                         | 説明                                                                          |
| ---------------------------- | --------------------------------------------------------------------------- |
| `/autoresearch <目的文>`        | autoresearch モードを有効化し、ループを開始します。`autoresearch.md` があれば再開し、なければ新規セットアップを行います |
| `/autoresearch on`           | autoresearch モードを有効化します                                                     |
| `/autoresearch off`          | autoresearch モードを無効化します。ループと自動再開を停止します                                      |
| `/autoresearch clear`        | `.autoresearch/state.json` / `current.plan.json` と legacy root files を削除し、current state をリセットします。plans/runs は監査履歴として保持します |
| `/autoresearch clear all`    | `.autoresearch/`、legacy `.pi/autoresearch/`、legacy root files も含めて削除します |
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
    学んだことを .autoresearch/plans/<planId>/notes.md に記録
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

**返り値:** `decision`（判定結果）、`readiness`（段階別 gate）、`scores`（スコア群）、`contractDraft`（契約ドラフト）、`blockingIssues`、`warnings`、`ambiguityFlags`、`riskFlags`、`suggestedRewrite`、`clarifyingQuestions`

`contractDraft.primaryMetric` には `name` / `unit` / `direction` / `source` / `measurementMethod` / `extractionRule` / `extractionConfidence` が含まれます。

#### 評価の 2×2: 静的 / 動的 × 数値化可能 / 数値化困難

`autoresearch_evaluate_query` の思想は、評価対象を「静的 / 動的」と「数値化可能 / 数値化困難」の 2 軸で分けることです。

| 分類 | 意味 | autoresearch での扱い |
| ---- | ---- | -------------------- |
| 静的 × 数値化可能 | クエリ文字列だけから機械的に判定でき、0.0〜1.0 等でスコア化しやすいもの | `evaluateQueryStatically` が担当。例: 必須フィールド充足率、command の有無、risk flag、checksPolicy、metricExtractionReady |
| 静的 × 数値化困難 | クエリ文字列だけから検出はできるが、単純な数値にしにくい意味的判断 | `decision` / `blockingIssues` / `suggestedRewrite` に反映。例: broad query、latency は wall-clock ではない、rate / ratio は方向不明に寄せる |
| 動的 × 数値化可能 | repo の状態や実行結果を見ると数値評価できるもの | 将来的な動的評価の対象。例: 実行時間、coverage、test pass rate、METRIC 行、checks 成否 |
| 動的 × 数値化困難 | repo の文脈や設計判断が必要で、数値だけでは決めにくいもの | agent の判断・確認質問の対象。例: metric がユーザ目的に本当に合っているか、改善価値があるか、変更方針が妥当か |

現在の tool は **静的 evaluator** です。LLM API や git 操作、コマンド実行は行わず、クエリ文字列だけから契約ドラフトと gate を作ります。したがって `ready_for_run` は「静的に見て実験契約が揃っている」という意味であり、実際の repo で有用か・改善余地があるかまでは保証しません。

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
| `wall_clock`      | `autoresearch_run` が測定したコマンド全体の `durationSeconds` を主指標として使う。`duration_seconds` では stdout の `METRIC duration_seconds=<value>` がなくても keep 可能。stdout METRIC がある場合はそちらを優先する。 | 1.0（明示的な実行時間表現） / 0.9（metric 名からの推定） |
| `stdout_metric`   | stdout の `METRIC name=value` から抽出   | 0.9                  |
| `report_file`     | カバレッジレポート等のファイルから抽出                 | 0.6                  |
| `unknown`         | 抽出方法が不明                             | 0.3（通常） / 0.4（latency 系内部指標） |

`primaryMetric.source` は `measurementMethod` から導出されます。

| measurementMethod | source |
| ----------------- | ------ |
| `wall_clock`      | `custom` |
| `stdout_metric`   | `stdout` |
| `report_file`     | `file` |
| `unknown`         | `unknown` |

重要: `wall_clock` はコマンド全体の実行時間です。`duration_seconds` は `autoresearch_run.durationSeconds` から解決されます。`latency_ms` / `p95_latency_ms` のような benchmark 内部の latency 指標は、コマンド全体時間とは別物なので `wall_clock` にはせず、`stdout_metric` または `report_file` の抽出指定が必要です。

#### 検証方針（checksPolicy）

| checksPolicy            | 意味                                           |
| ----------------------- | -------------------------------------------- |
| `explicit_command`      | クエリ内に checks command が明示されている                   |
| `autoresearch_checks_sh`| `autoresearch.checks.sh` または「既存 checks」の記述がある |
| `not_specified`         | 検証方針が未指定                                       |

#### metric 名からの推定ルール

明示的な metric 名がある場合、unit / direction / measurementMethod の一部を静的に推定します。

**unit 推定:**

| metric 名の例 | unit |
| ------------ | ---- |
| `duration_seconds`, `runtime_sec` | `seconds` |
| `total_ms`, `p95_latency_ms` | `ms` |
| `coverage`, `success_rate`, `accuracy` | `%` |
| `error_count`, `failure_count`, `violation_count` | `count` |

**direction 推定:**

| metric 名の例 | direction |
| ------------ | --------- |
| `duration_seconds`, `total_ms`, `latency_ms`, `p95_latency_ms` | `lower` |
| `error_rate`, `failure_rate`, `crash_rate`, `flaky_rate`, `violation_rate` | `lower` |
| `error_count`, `failure_count`, `violation_count` | `lower` |
| `success_rate`, `pass_rate`, `win_rate`, `coverage`, `accuracy`, `score` | `higher` |
| `success_count`, `pass_count` | `higher` |
| `request_count`, `conversion_rate`, `request_ratio` など中立的な `count` / `rate` / `ratio` | `unknown` |

`改善したい` は direction を直接決める語として扱いません。`total_ms を改善` は `lower`、`coverage を改善` は `higher` のように、metric 名の意味を優先します。

**latency 系 metric:**

`latency`, `レイテンシ`, `応答時間`, `p50`, `p90`, `p95`, `p99` が自然文に出た場合は、`duration_seconds` ではなく `latency_ms` / `p95_latency_ms` のような内部指標として扱います。この場合、抽出方法が明示されていなければ `needs_metric_extraction` になります。

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

**latency 系内部指標（needs_metric_extraction）:**

```text
ユーザ入力: latency を短縮したい。`npm run bench`。既存 checks を使う。

判定: needs_metric_extraction
主指標: latency_ms（lower, unit: ms）
測定方法: unknown (extractionConfidence: 0.40)
理由: latency は benchmark 内部指標であり、autoresearch_run の wall-clock time では測れないため
```

**p95 latency を stdout METRIC で明示（ready_for_run）:**

```text
ユーザ入力: `npm run bench`。主指標は p95_latency_ms、lower is better。stdout に METRIC p95_latency_ms=<value> を出す。既存 checks を使う。

判定: ready_for_run
主指標: p95_latency_ms（lower, unit: ms）
測定方法: stdout_metric (extractionConfidence: 0.90)
checks policy: autoresearch_checks_sh
```

**中立的な rate / ratio（needs_metric_design）:**

```text
ユーザ入力: 主指標は conversion_rate で改善したい

判定: needs_metric_design
主指標: conversion_rate（direction: unknown）
理由: rate / ratio はドメインにより higher/lower が変わるため、改善方向の明示が必要
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

実験 plan を初期化します。plan 固有ファイルは `.autoresearch/plans/<planId>/` に保存され、current state は `.autoresearch/state.json` に記録されます。`autoresearch.jsonl` / `autoresearch.contract.json` は legacy compatibility 用です。

| パラメータ         | 必須 | 説明                                  |
| ------------- | -- | ----------------------------------- |
| `name`        | 必須 | セッション名                              |
| `metric_name` | 必須 | 主指標名。例: `total_ms`, `bundle_kb`     |
| `metric_unit` | 任意 | 単位。例: `ms`, `KB`                    |
| `direction`   | 任意 | `lower` または `higher`。デフォルトは `lower` |
| `objective`   | 任意 | 実験目的                              |
| `benchmark_command` | 任意 | benchmark command (例: `./autoresearch.sh`) |
| `metric_method` | 任意 | 測定方法。`wall_clock` / `stdout_metric` / `report_file`。デフォルト: `wall_clock` |
| `checks_mode` | 任意 | checks mode。`script` / `command` / `none`。デフォルト: `script` |
| `checks_command` | 任意 | checks mode=`command` の場合のコマンド |
| `acceptance_mode` | 任意 | `better_than_best` / `improvement_threshold` / `manual`。デフォルト: `better_than_best` |
| `min_improvement` | 任意 | 最小改善率 (0.02 = 2%)。`acceptance_mode=improvement_threshold` で有効 |
| `repeat`      | 任意 | 測定繰り返し回数。デフォルト: `1`                |
| `aggregate`   | 任意 | 集計方法。`single` / `median` / `mean` / `min` / `max`。デフォルト: `single` |
| `require_git` | 任意 | git repo を必須にする。デフォルト: `true`     |
| `require_clean_baseline` | 任意 | clean working tree を必須にする。デフォルト: `true` |
| `allowed_paths` | 任意 | 許可パスパターンの配列                      |
| `excluded_paths` | 任意 | 除外パスパターンの配列                      |

---

### `autoresearch_plan`

自然文 query から `autoresearch.plan.md` の draft を生成します。plan は Markdown + contract block 形式です。baseline 測定は行わず、repo は read-only 調査のみです。

| パラメータ   | 必須 | 説明                 |
| ------- | -- | ------------------ |
| `query` | 必須 | ユーザの自然文クエリ         |

plan は人間と agent が議論するための editable document です。contract block の言語指定は `autoresearch-contract jsonc` にしてください。

---

### `autoresearch_approve`

plan の contract block を validate し、baseline を測り、`.autoresearch/current.contract.json` と `.autoresearch/current.lock.json` を作成します。

| パラメータ      | 必須 | 説明                                          |
| ---------- | -- | ------------------------------------------- |
| `plan_path` | 任意 | plan file path (デフォルト: `autoresearch.plan.md`) |

approve 前に plan を確認・編集してください。approve 後は contract の変更ができません。

---

### `autoresearch_run`

シェルコマンドを実行し、実行時間と出力を記録します。

| パラメータ                    | 必須 | 説明                            |
| ------------------------ | -- | ----------------------------- |
| `command`                | 必須 | 実行するコマンド                      |
| `timeout_seconds`        | 任意 | タイムアウト秒数。デフォルトは `600`         |
| `checks_timeout_seconds` | 任意 | checks のタイムアウト秒数。デフォルトは `300` |

**返り値:** `runId` - 実行を一意に識別する ID（`piRunId` は legacy alias として details に残ります）

> ワークスペースに `autoresearch.checks.sh` が存在する場合、ベンチマーク成功後に自動実行されます。

### `autoresearch_log`

実験結果を記録します。ステータスに応じて、自動的に commit または revert が実行されます。

| パラメータ         | 必須 | 説明                                                          |
| ------------- | -- | ----------------------------------------------------------- |
| `metric`      | 必須 | 主指標の値                                                       |
| `status`      | 必須 | `keep` / `discard` / `crash` / `checks_failed`              |
| `description` | 必須 | 実験内容の短い説明                                                   |
| `runId`       | 任意 | `autoresearch_run` の `runId`。旧 `piRunId` も互換 alias として受け付けます。省略時は直前の run に紐付けられますが、警告が出ます |
| `commit`      | 任意 | Git commit hash。省略時は自動設定されます                                |
| `metrics`     | 任意 | 追加指標のオブジェクト                                                 |
| `memo`        | 任意 | メモ                                                          |

---

### `autoresearch_candidate_escrow`

`.pi/subagent-results/` の pending patch result を、current plan 配下の candidate として凍結します。この時点では patch を適用せず、subagent result の status も変更しません。

| パラメータ | 必須 | 説明 |
| --- | -- | --- |
| `source` | 任意 | `pending` または `result_ids` |
| `result_ids` | 任意 | `source=result_ids` の対象 ID |
| `max_results` | 任意 | 最大 import 件数 |

### `autoresearch_apply_candidate`

pending candidate を 1 件だけ trial apply します。`apply_agent_results` と異なり、subagent result は `applied` にならず、semantic-log にも書きません。

| パラメータ | 必須 | 説明 |
| --- | -- | --- |
| `candidate_id` | 必須 | `arc_...` candidate ID |

関連 tool: `autoresearch_apply_candidate_isolated`, `autoresearch_list_candidates`, `autoresearch_show_candidate`, `autoresearch_reject_candidate`, `autoresearch_suggest_subagents`。

`autoresearch_apply_candidate_isolated` は main worktree を汚さず、`.pi/autoresearch-worktrees/<candidateId>` に candidate patch を適用します。`autoresearch_run_contract({ candidate_id })` は candidate の trial mode に応じて main / isolated worktree のどちらかを評価し、isolated keep の場合だけ main に replay して commit します。

---

### `autoresearch_run_contract`

contract に従って checks / benchmark / repeats / aggregate / acceptance を実行します。keep / discard / pause は agent ではなく evaluator が決定します。benchmark command や metric は受け取りません。

| パラメータ            | 必須 | 説明                  |
| ---------------- | -- | ------------------- |
| `reason`         | 任意 | この run の理由          |
| `iteration_label` | 任意 | iteration label |
| `candidate_id` | 任意 | trial apply 済み candidate を評価対象として紐付ける |

contract mode では agent から `status=keep` / `status=discard` を受け取りません。decision は必ず tool 側が返します。subagent patch を評価する場合は `apply_agent_results` ではなく、`autoresearch_candidate_escrow` → `autoresearch_apply_candidate` → `autoresearch_run_contract({ candidate_id })` の順に実行します。

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

### runId の形式

```text
run-<UTC timestamp>-<gitShortSha>-<random6hex>
```

**例:** `run-20260517T153000.123Z-a1b2c3-k9x4qp`

* 実行試行ごとに一意です
* plan 内容の hash ではありません
* git short SHA を含みます

---

## 自動 git 操作

`autoresearch_log` のステータスに応じて、自動的に git 操作が実行されます。

| ステータス           | 自動アクション                                  |
| --------------- | ---------------------------------------- |
| `keep`          | `git add -A`（`.autoresearch/**` / `.pi/**` 等は除外）→ `git commit`   |
| `discard`       | revert。`autoresearch.*` / `.autoresearch/**` / `.pi/**` は保護されます |
| `crash`         | revert。`autoresearch.*` / `.autoresearch/**` / `.pi/**` は保護されます |
| `checks_failed` | revert。`autoresearch.*` / `.autoresearch/**` / `.pi/**` は保護されます |

### `keep` のバリデーション

`status=keep` は、以下の条件をすべて満たす場合のみ許可されます。

1. 対応する `autoresearch_run` の結果が存在する
2. タイムアウトしていない
3. 終了コードが `0` である
4. 主指標が解決できる
   - stdout に `METRIC <metricName>=<value>` が含まれている
   - または `metricName` が `duration_seconds` で、`autoresearch_run` が測定した `durationSeconds` が存在する
5. checks がすべて成功している
6. run アーティファクトが正常に保存されている

現行 API では `autoresearch_log` の `metric` 引数は必須です。ただし `keep` 時に主指標が stdout METRIC または `duration_seconds` wall-clock から解決できる場合、記録値は解決済み主指標を優先します。

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
.autoresearch/
├── state.json                  # current state（currentPlanId/latestRunId/bestRunId など）
├── current.plan.json           # current plan への pointer/cache
├── journal.jsonl               # canonical append-only history
└── plans/
    └── <planId>/
        ├── plan.md             # plan 本文
        ├── contract.json       # plan contract（sessionId 等 runtime field は除外）
        ├── plan.lock.json      # plan file checksum
        ├── benchmark.sh        # benchmark 実体
        ├── checks.sh?          # checks 実体
        ├── notes.md?           # plan 固有の作業記憶
        ├── ideas.md?           # plan 固有 backlog
        └── runs/
            └── <runId>/
                ├── manifest.json
                ├── command.txt
                ├── stdout.log
                ├── stderr.log
                ├── metrics.json
                ├── result.json
                ├── git.status.txt
                ├── git.diff
                └── checks-result.json?
```

### 各ファイルの役割

| ファイル                  | 役割                                                            |
| --------------------- | ------------------------------------------------------------- |
| `.autoresearch/state.json` | current plan、latest/best run、best metric を保持します |
| `.autoresearch/current.plan.json` | current plan への pointer/cache です。canonical な plan 実体は `plans/<planId>/` です |
| `.autoresearch/journal.jsonl` | plan 作成、run 開始、metric 記録、decision などの canonical append-only history です |
| `.autoresearch/plans/<planId>/` | plan 固有ファイルの保存先です。同じ内容の plan は同じ `planId` を再利用します |
| `.autoresearch/plans/<planId>/runs/<runId>/` | run artifact の canonical 保存先です |

Legacy compatibility として `autoresearch.jsonl` や `.pi/autoresearch/<sessionId>/` が生成される場合がありますが、正本ではありません。

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

### `.autoresearch/` と `.pi/` は git 管理対象外

* `gitAutoCommit()` は `.autoresearch/**` / `.pi/**` などの内部 artifact を除外します
* `gitAutoRevert()` も `.autoresearch/**` / `.pi/**` を保護します
* プロジェクトの `.gitignore` に `.autoresearch/` と `.pi/` を追加することを推奨します

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
