---
title: agent-idle-indicator
category: api-reference
audience: developer
last_updated: 2026-02-18
tags: [auto-generated, extensions]
---

# agent-idle-indicator

## 概要

エージェントが実行中でない場合に視覚的なインジケーターを表示する拡張機能。ターミナルタイトルとフッターでアイドル状態を通知する。

## エクスポート

### 関数

#### default (エントリーポイント)

```typescript
export default function (pi: ExtensionAPI): void
```

拡張機能のエントリーポイント。エージェント開始/終了イベントを監視し、アイドル状態を視覚化する。

## 機能

### ターミナルタイトル表示

- アイドル時: `[🔴]` （赤丸）をタイトルに表示
- 実行中: `[🟢]` （緑丸）をタイトルに表示

### フッターステータス

- アイドル時: 赤色の「停止中」テキストを表示

## 使用例

```typescript
// 拡張機能として自動的に読み込まれる
// ユーザーは特別な操作不要

// ターミナルタイトルの例:
// アイドル: [🔴] pi - my-project
// 実行中:   [🟢] pi - my-project
```

## イベントハンドラ

| イベント | 動作 |
|---------|------|
| agent_start | アイドルインジケーターをクリア |
| agent_end | アイドルインジケーターを表示 |
| session_start | 初期状態でアイドルなら表示 |
| session_shutdown | 元のタイトルを復元 |

## 内部関数

### showIdleIndicator

```typescript
function showIdleIndicator(ctx: ExtensionAPI["context"]): void
```

ターミナルタイトルに赤丸を設定し、フッターに「停止中」を表示。

### clearIdleIndicator

```typescript
function clearIdleIndicator(ctx: ExtensionAPI["context"]): void
```

ターミナルタイトルに緑丸を設定し、フッターのステータスをクリア。

### restoreOriginal

```typescript
function restoreOriginal(ctx: ExtensionAPI["context"]): void
```

セッション終了時に元のタイトルを復元。

## 関連

- `.pi/extensions/agent-runtime.ts`
- `.pi/extensions/agent-usage-tracker.ts`
