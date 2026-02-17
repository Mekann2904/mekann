---
title: Kitty Status Integration
category: reference
audience: developer
last_updated: 2026-02-18
tags: [extension, kitty, terminal, notification, status]
related: []
---

# Kitty Status Integration

> パンくず: [Home](../README.md) > [Extensions](./) > Kitty Status Integration

## 概要

Kitty Status Integration拡張機能は、kittyターミナルのshell integrationを活用して、piの作業状態をウィンドウタイトルと通知に反映します。kitty以外のターミナルでは何もしません。

## 機能

- ウィンドウタイトル/タブ名の動的更新
- macOS通知センターへの通知送信
- 作業状態のサウンド通知
- 複数のカスタムコマンド

---

## 型定義

### NotificationOptions

通知設定の型定義。

```typescript
interface NotificationOptions {
  enabled: boolean;             // 通知全体の有効/無効
  soundEnabled: boolean;        // サウンドの有効/無効
  notifyCenterEnabled: boolean; // 通知センターの有効/無効
  successSound: string;         // 成功時のサウンドパス
  errorSound: string;           // エラー時のサウンドパス
}
```

---

## 主要関数

### isKitty()

kittyターミナルで実行されているかを判定します。

```typescript
function isKitty(): boolean
```

**戻り値**: `KITTY_WINDOW_ID`環境変数が存在する場合`true`

### setTitle(title: string)

ウィンドウタイトル/タブ名を設定します。

```typescript
function setTitle(title: string): void
```

**パラメータ**:
- `title`: 設定するタイトル文字列

### notifyMacOS(text: string, title?: string)

macOSの通知センターに通知を送信します。

```typescript
function notifyMacOS(text: string, title?: string): void
```

**パラメータ**:
- `text`: 通知本文
- `title`: 通知タイトル（デフォルト: "pi"）

### playSound(soundPath: string)

サウンドを再生します（macOSのみ）。

```typescript
function playSound(soundPath: string): void
```

**パラメータ**:
- `soundPath`: サウンドファイルのパス

### notifyKitty(text: string, duration?: number)

kittyのネイティブ通知を送信します（Linuxなど）。

```typescript
function notifyKitty(text: string, duration?: number): void
```

**パラメータ**:
- `text`: 通知テキスト
- `duration`: 表示時間（ミリ秒）

### notify(text: string, duration?: number, title?: string, isError?: boolean)

プラットフォーム別の通知を表示します。

```typescript
function notify(text: string, duration?: number, title?: string, isError?: boolean): void
```

**パラメータ**:
- `text`: 通知テキスト
- `duration`: 表示時間
- `title`: タイトル
- `isError`: エラー通知かどうか

---

## イベントハンドラ

| イベント | 説明 |
|---------|------|
| `session_start` | セッション開始時にタイトルを設定 |
| `agent_start` | エージェント開始時に処理中状態を表示 |
| `agent_end` | エージェント終了時に完了通知を送信 |
| `turn_start` | ターン開始時にターン番号を表示 |
| `turn_end` | ターン終了時にタイトルを復元 |
| `tool_call` | ツール呼び出し時にツール名を表示 |
| `tool_result` | ツール実行完了時にタイトルを復元 |
| `session_shutdown` | セッション終了時にタイトルを復元 |
| `session_before_switch` | セッション切り替え時に状態を表示 |

---

## カスタムコマンド

### /kitty-title

カスタムウィンドウ/タブタイトルを設定します。

```
/kitty-title <title>
```

引数なしで実行するとデフォルトタイトルに復元します。

### /kitty-notify

kitty経由で通知を送信します。

```
/kitty-notify <message>
```

### /kitty-status

kitty統合の状態を表示します。

```
/kitty-status
```

### /kitty-notify-config

通知設定を構成します。

```
/kitty-notify-config [on|off|sound on|sound off]
```

---

## 使用例

```typescript
// タイトル設定
setTitle("pi: my-project [Processing...]");

// 通知送信
notify("Task completed successfully", 0, "pi", false);

// エラー通知
notify("Error occurred", 0, "pi", true);
```

---

## プラットフォーム対応

| プラットフォーム | タイトル設定 | 通知 | サウンド |
|----------------|-------------|------|---------|
| macOS (kitty) | 対応 | 通知センター | afplay |
| Linux (kitty) | 対応 | kittyネイティブ | 非対応 |
| その他 | 非対応 | 非対応 | 非対応 |

---

## 関連トピック

- [Loop Extension](./loop.md) - ループ実行機能
- [Plan Extension](./plan.md) - プラン管理機能
