# Goal Extension

pi coding agent 向けの、スレッドローカルな永続 goal 管理 extension。アイドル時の自動継続、トークン/時間予算の追跡、plan-mode 連携を提供します。

## 機能

- **スレッドローカルな goal** — セッションごとに1つのアクティブな goal を持ち、セッションブランチに永続化されます。
- **アイドル時の自動継続** — agent が turn を終了しても goal がまだアクティブな場合、自動的に継続プロンプトを送信して作業を続けます。
- **トークン/時間予算** — オプションのトークン予算を設定でき、予算到達時に自動的に `budget_limited` ステータスに遷移します。
- **Plan-mode 連携** — plan mode 中は継続を抑制します。
- **Prompt fragments** — アクティブな goal を `goal_policy` (stable)、`goal_objective` (semi-stable)、`goal_runtime_state` (dynamic) に分離して提供します。

## コマンド

| コマンド | 説明 |
|---|---|
| `/goal <objective>` | 新しい goal を設定（既存がある場合は確認後置換） |
| `/goal` | 現在の goal のステータスを表示 |
| `/goal edit` | エディタで objective を編集 |
| `/goal pause` | アクティブな goal を一時停止 |
| `/goal resume` | 一時停止中の goal を再開 |
| `/goal clear` | goal を削除 |
| `/goal budget <n\|none>` | トークン予算を設定または解除 |

### goal 設定時の予算指定

goal 設定時にインラインでトークン予算を指定できます：

```
/goal --budget 10000 認証モジュールをリファクタリングする
/goal 認証モジュールをリファクタリングする --budget 10000
```

## モデルツール

| ツール | 説明 |
|---|---|
| `get_goal` | 現在の goal のステータスと残り予算を取得 |
| `create_goal` | 新しい goal を作成（既に存在する場合は失敗） |
| `update_goal` | goal を `complete` にマーク（これ以外のステータス変更は不可） |

## 自動継続の仕組み

agent が turn を終了した時点で goal がまだアクティブな場合：

1. 事前チェック：機能有効、セッション永続化済み、plan mode ではない、agent アイドル中、保留メッセージなし。
2. **継続ガード**：`continuation_count < max_continuations`（デフォルト上限：5回）。
3. **クールダウン**：前回の継続から最低2秒経過していること。
4. フォローアップ継続プロンプトを送信して作業を継続。
5. `continuation_count` をインクリメントし、`last_continued_at_ms` を更新。
6. `max_continuations` に到達すると、goal は自動的に **一時停止** され、ユーザーに通知されます。

## アーキテクチャ

```
state.ts      — goal データモデル、GoalStore（純粋な状態管理、pi API 非依存）
prompts.ts    — プロンプトテンプレート（escaping、継続、予算、stable/semi-stable/dynamic goal コンテキスト）
              — UI レンダリング（ウィジェット、サマリー、no-goal メッセージ）
runtime.ts    — ライフサイクル管理（usage 計上、継続、予算ステアリング）
index.ts      — extension エントリポイント（コマンド、ツール、イベントハンドラ）
```

## ステータス値

| ステータス | 意味 |
|---|---|
| `active` | goal が進行中 |
| `paused` | goal が一時停止中（ユーザー操作または継続上限到達） |
| `budget_limited` | トークン予算を使い切った |
| `complete` | objective が達成された |

## 制限事項

- トークン計上は Pi API の usage メタデータに依存します。正確なトークン使用量が取得できない場合は 0 または best-effort になります。
- 自動継続は `max_continuations` とクールダウンによって制限されます。
- plan-mode 中は継続しません。
- final usage の正確な計上は、lifecycle event の到着順序に依存するため best-effort です。
