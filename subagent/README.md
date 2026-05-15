# Subagent Extension

[pi coding agent](https://github.com/nicepkg/pi) 用のマルチエージェント実行システム。親エージェントがサブエージェントを非同期で起動し、メールボックス・イベント経由で通信し、リソース制限付きレジストリで管理する。

## 特徴

- **非同期 spawn**: `spawn_agent` は即座に返却され、サブエージェントはバックグラウンドで実行される
- **メールボックス通信**: 実行中のサブエージェントにメッセージやフォローアップタスクを送信
- **結果待機**: `wait_agent` で更新が届くまで、またはタイムアウトまで待機
- **リソース制限**: 最大エージェント数・最大深度・待機タイムアウトを設定可能
- **ライフサイクル追跡**: ステータス変更と最終結果の自動通知
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

## コマンド

- `/agents [prefix]` — サブエージェントの一覧とステータスを表示
- `/wait-agent [timeout_ms]` — サブエージェントの更新を待機
- `/close-agent <target>` — 指定パスのサブエージェントをクローズ

## 設定フラグ

- `--subagent-max-agents` (デフォルト: `4`): 同時に起動できるエージェントの最大数
- `--subagent-max-depth` (デフォルト: `2`): ネストの最大深度
- `--subagent-default-wait-timeout-ms` (デフォルト: `30000`): wait_agent のデフォルトタイムアウト（ms）

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
