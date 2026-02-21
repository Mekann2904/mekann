---
title: Kitty Status Integration
category: user-guide
audience: daily-user
last_updated: 2026-02-17
tags: [kitty, terminal, status, integration]
related: [./02-user-guide/11-utilities.md]
---

# Kitty Status Integration

piとkittyターミナルを連携し、作業状態をウィンドウタイトルや通知に反映する拡張機能です。

## 機能

- **ウィンドウタイトルの自動更新** - piの処理状態に合わせてタイトルが変化
- **タブ名の同期** - kittyのタブ名にも同じ情報が表示
- **デスクトップ通知** - LLMレスポンス完了時などの通知
- **kitty以外では何もしない** - 自動検出して安全

## 使用例

### 自動更新されるタイトル

| 状態 | タイトル表示 |
|------|-------------|
| セッション開始時 | `pi: project-name` |
| プロンプト送信時 | `pi: project-name [Processing... T1]` |
| ツール実行中 | `pi: project-name [Running: read]` |
| 完了時 | `pi: project-name` （通知あり） |

### 通知例

- `Done: 3 tool(s) in project-name` - ターン完了
- `Model: anthropic/claude-3-5-sonnet` - モデル変更
- `Tool failed: bash` - ツールエラー

## コマンド

### /kitty-title `[title]`

ウィンドウタイトルをカスタム設定します。

```bash
/kitty-title               # デフォルト（現在のディレクトリ名）に戻す
/kitty-title My Project   # カスタムタイトルを設定
```

### /kitty-notify `<message>`

kitty通知を送信します。

```bash
/kitty-notify Building complete!
```

### /kitty-status

現在の統合ステータスを表示します。

```bash
/kitty-status
```

出力:
```
Kitty Status Integration: Active
  Window ID: 1
  Working dir: my-project
  Turn count: 5
  Status: Running: read
```

## インストール

拡張機能は `.pi/extensions/kitty-status-integration.ts` に配置済みです。

piを起動すると自動的に読み込まれます。

```bash
cd /path/to/your/project
pi
```

## 動作条件

- kittyターミナルを使用していること（環境変数 `KITTY_WINDOW_ID` で判定）
- kittyのshell integrationが有効であること（デフォルトで有効）

## 動作しない場合

### kittyでタイトルが変わらない場合

kittyの設定でshell integrationが有効になっているか確認：

`~/.config/kitty/kitty.conf`:
```conf
# デフォルトで有効（無効化されている場合は有効化）
shell_integration enabled
```

### 通知が表示されない場合

kittyの通知設定を確認：

`~/.config/kitty/kitty.conf`:
```conf
# 通知許可（Linuxの場合）
allow_remote_control yes
```

## 技術詳細

### エスケープシーケンス

- **ウィンドウタイトル**: `OSC 2 ; title ST`
- **通知**: `OSC 99 ; i=ID:d=duration:text ST`

### イベント

以下のpiイベントに反応します：

- `session_start` - セッション開始
- `agent_start` / `agent_end` - エージェント処理
- `turn_start` / `turn_end` - ターン処理
- `tool_call` / `tool_result` - ツール実行
- `session_shutdown` - セッション終了
- `model_select` - モデル変更

## ライセンス

この拡張機能はpiの拡張機能として提供されます。

## 関連トピック

- [ユーティリティ](./02-user-guide/11-utilities.md) - 他のユーティリティ拡張機能
