# subagent

[pi coding agent](https://github.com/nicepkg/pi) 用のマルチエージェント実行システム。親エージェントがサブエージェントを非同期で起動し、メールボックス・イベント経由で通信し、リソース制限付きレジストリで管理する。

## 特徴

- **非同期 spawn**: `spawn_agent` は即座に返却され、サブエージェントはバックグラウンドで実行される
- **メールボックス通信**: 実行中のサブエージェントにメッセージやフォローアップタスクを送信
- **結果待機**: `wait_agent` で更新が届くまで、またはタイムアウトまで待機
- **リソース制限**: 最大エージェント数・最大深度・待機タイムアウトを設定可能
- **ライフサイクル追跡**: ステータス変更と最終結果の自動通知
- **構造化 patch proposal**: `subagent.result.v1` を ResultStore に保存し、mailbox には `result_id` と summary だけを返す
- **機械的 apply queue**: patch 本文・authority・base hash・public surface・validation を親側で検証して適用
- **グレースフルシャットダウン**: エージェントとその子孫をまとめてクローズ

## インストール

pi 拡張として追加:

```json
{
  "pi": {
    "extensions": ["./subagent"]
  }
}
```

または pi パッケージとしてインストール。

## ツール

### `spawn_agent`

新しいサブエージェントを非同期で起動する。

```javascript
// 基本的な起動
spawn_agent({
  task_name: "research/api_scan",
  message: "API 層を調査して要約して"
})
// 戻り値: { agent_id: "sub_1_abc", task_name: "/root/research/api_scan", status: "pending_init" }

// モデル・ロール指定
spawn_agent({
  task_name: "analysis/perf",
  message: "パフォーマンスのボトルネックを分析して",
  model: "anthropic/claude-sonnet-4-20250514",
  role: "パフォーマンス分析",
  nickname: "perf-bot"
})

// コンテキスト fork 付き
spawn_agent({
  task_name: "fix/tests",
  message: "落ちているテストを直して",
  fork_turns: 2  // 直近2ターンの user/assistant やり取りをコンテキストとして引き継ぐ
})
```

パラメータ:
- `task_name` (必須): サブエージェントのパス。現在のエージェントからの相対パスまたは絶対パス。
- `message` (必須): サブエージェントへの初期タスクメッセージ。
- `model`: モデル指定（`provider/model_id` または `model_id` のみ）。
- `reasoning_effort`: 推論レベル（`off`, `minimal`, `low`, `medium`, `high`）。
- `role`: サブエージェントのロール説明。
- `nickname`: 短い表示名。
- `fork_turns`: コンテキスト fork 方法（`"none"`（デフォルト）, `"all"`, またはターン数）。
- `authority`: サブエージェント権限。`read_only` / `propose_patch` / `edit`、`write_scope`、`semantic_scope`、`allowed_commands`、`require_base_hash` などを指定可能。
- `result_contract`: `"free_text"` または `"subagent_result_v1"`。structured result を要求する場合に指定する。

`propose_patch` では `write` / `edit` / `apply_patch` / `bash` / `request_elevation` を外し、直接編集ではなく unified diff proposal を返す前提にする。external Pi 表示モードでは authority は prompt-only になり得るため、authority 非強制かつ medium/high risk や public surface 変更を含む result は auto apply せず review に回す。

### `send_message`

サブエージェントにメッセージを送信する。ターンはトリガーされない。

```javascript
send_message({
  target: "research/api_scan",
  message: "auth ミドルウェアも確認して"
})
```

### `followup_task`

フォローアップタスクを送信する。エージェントが待機中なら新しいターンをトリガー、実行中ならキューに積む。

```javascript
followup_task({
  target: "research/api_scan",
  message: "データベース層も確認して"
})
```

### `wait_agent`

サブエージェントからのメールボックスメッセージやライフサイクルイベントを待機する。

```javascript
wait_agent({ timeout_ms: 30000 })
// 戻り値: { timed_out: false, events: [...], mailbox: [...] }
```

### `list_agents`

全エージェントを一覧表示。パスプレフィクスでフィルタリング可能。

```javascript
list_agents()
list_agents({ path_prefix: "/root/research" })
```

### `close_agent`

サブエージェントとその起動中の子孫をすべてクローズする。

```javascript
close_agent({ target: "/root/research/api_scan" })
```

### Structured result / apply tools

- `list_agent_results({ status?, outcome?, agent_path? })` — `.pi/subagent-results/` に保存された structured result を一覧表示
- `show_agent_result({ result_id, include_patch? })` — result の詳細を表示。`include_patch` 指定時のみ patch 本文も読む
- `apply_agent_results({ source?, result_ids?, max_results?, rollback_on_failure?, allow_high_risk? })` — pending patch proposal を FIFO で機械的に検証・適用
- `reject_agent_result({ result_id, reason? })` — result を手動 reject
- `retry_agent_result({ result_id, reason? })` — 元 subagent が生存中なら followup、終了済みなら `<元path>/retry_<id>` に新規 retry subagent を spawn

`apply_agent_results` は subagent の自己申告だけを信用しない。保存済み authority と patch 本文から再計算した actual touched paths を照合し、repo-relative path validator で absolute path / Windows drive-letter path / `.git/**` / `.pi/**` / `..` traversal / NUL を拒否する。`.husky/**` など execution-sensitive path は auto apply せず review に回す。patch 本文内の unsafe path は silent ignore せず、その場で reject する。`write_scope` 未指定または external Pi などで `authority_enforced=false` の result は auto apply せず review に回す。`require_base_hash !== false` の場合は変更対象ごとの base hash を必須にする。ただし `/dev/null -> b/path` の新規ファイル patch は base hash 不要。`validation.required` は `command` または同名 npm script suggestion に解決できない場合 review 扱いになり、validation allowlist は完全一致で判定される。write scope は複雑な glob ではなく repo-relative prefix として扱う。`result_id` は `sar_<base36time>_<counter>` 形式のみ受け付け、path traversal を拒否する。

## コマンド

- `/agents [prefix]` — サブエージェントの一覧とステータスを表示
- `/wait-agent [timeout_ms]` — サブエージェントの更新を待機
- `/focus-agent <target>` — サブエージェントの表示ウィンドウにフォーカス
- `/close-agent <target>` — 指定パスのサブエージェントをクローズ

## 設定フラグ

- `--subagent-max-agents` (デフォルト: `2`): 同時に起動できるサブエージェントの最大数（ハードキャップ 2）
- `--subagent-max-depth` (デフォルト: `2`): ネストの最大深度
- `--subagent-default-wait-timeout-ms` (デフォルト: なし): `wait_agent` のデフォルトタイムアウト（ms）
- `--subagent-min-wait-timeout-ms` (デフォルト: `1000`): `wait_agent` の最小タイムアウト（ms）
- `--subagent-display` (デフォルト: `kitty-split`): サブエージェントの表示モード（`none` / `kitty-pi` / `kitty-split`）。`kitty-*` は独立 Pi プロセスのため安全性・権限制御が親プロセスと異なります。
- `--subagent-allow-unsafe-external-pi` (デフォルト: `true`): `kitty-pi` / `kitty-split` で独立した Pi プロセスを起動する。`false` では親プロセス内 subagent を使い、モデル・thinking・ツール制限を親が決定的に渡します。
- `--subagent-log-dir` (デフォルト: なし): 表示ログの出力ディレクトリ
- `--subagent-kitten-bin` (デフォルト: `kitten`): `kitten` バイナリのパス
- `--subagent-pi-command` (デフォルト: `pi`): 子 Pi プロセスの起動コマンド
- `--subagent-extension-path` (デフォルト: 自身のパス): 子 Pi に渡す拡張機能パス

### 設定ファイル

フラグに加えて `settings.json`（`~/.pi/agent/settings.json` または `.pi/settings.json`）の `subagent` セクションでも設定可能:

```json
{
  "subagent": {
    "max-agents": "2",
    "max-depth": "2",
    "default-wait-timeout-ms": "30000",
    "display": "kitty-split",
    "allow-unsafe-external-pi": "true"
  }
}
```

CLI フラグが明示的に指定されている場合は CLI フラグが優先されます。

## アーキテクチャ

```
Root Agent (/root)
├── spawn_agent("research/api_scan")
│   └── SubAgent (/root/research/api_scan) — running
├── spawn_agent("build/compile")
│   └── SubAgent (/root/build/compile) — completed
└── wait_agent() → 結果を受信
```

各サブエージェントは独立した `AgentSession`（インメモリセッション）で実行される。親はメールボックスシステムを通じて通信する。終了ステータス（`completed`, `errored`, `shutdown`, `interrupted`）は最終状態であり、クローズされたパスは再利用可能。

Structured result は workspace cwd ごとの `.pi/subagent-results/` に保存される。apply queue も tool 実行時の `ctx.cwd` を使うため、extension process の `process.cwd()` ではなく workspace 基準で base hash check / git apply / validation を行う。Result schema は enum / path/hash / semantic target kind / semantic assumptions/effects / validation command / validation.required を検証し、stored result も load/list 境界で再検証する。壊れた stored JSON は list では skip し、apply/show の direct load では error にする。apply engine の予期しない例外は `needs_review: apply_engine_exception` に落とす。patch 適用後の例外は `apply_engine_exception_after_patch_applied` として記録し、可能なら rollback を試みる。`workspace_cwd` が現在 cwd と一致しない result も review に回す。public surface delta は `diff --git` ベースの簡易 detector で再計算する。add/remove の同一 export は modify に正規化してから declared delta と比較する。

## 使用例

```
1. spawn_agent({ task_name: "research/api", message: "API 層を調査して" })
   → { agent_id: "sub_1", task_name: "/root/research/api", status: "pending_init" }

2. list_agents()
   → ● /root/research/api — running — API 層を調査して

3. followup_task({ target: "research/api", message: "auth 周辺も確認して" })
   → { queued: false, triggered: true }

4. wait_agent({ timeout_ms: 30000 })
   → { timed_out: false, mailbox: [{ from: "/root/research/api", content: "...", kind: "final_result" }] }

5. close_agent({ target: "/root/research/api" })
   → Closed: /root/research/api
```

## 開発

```bash
cd subagent
npm test          # vitest を実行
npm run typecheck # TypeScript の型チェック
```
