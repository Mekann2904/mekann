---
title: pi-ai Abort Stop Reason 修正
category: reference
audience: developer, contributor
last_updated: 2026-02-19
tags: [extension, pi-ai, zai, bugfix, monkey-patch]
related: [../04-reference/03-troubleshooting.md]
---

# pi-ai Abort Stop Reason 修正

> パンくず: [Home](../README.md) > [Patches](./) > pi-ai-abort-fix

## 概要

zaiプロバイダー（glm-5モデルなど）使用時に発生する"Unhandled stop reason: abort"エラーを修正する拡張機能。`@mariozechner/pi-ai`パッケージの`mapStopReason`関数をmonkey patchで拡張し、"abort"ケースを追加する。

## 問題の説明

### エラーメッセージ

```
Error: Unhandled stop reason: abort
```

### 発生条件

| 条件 | 値 |
|-----|---|
| プロバイダー | zai |
| モデル | glm-5 など |
| 停止理由 | abort |

APIが`finish_reason: "abort"`を返した際、`mapStopReason`関数がこのケースを処理できず例外をスローする。

## 解決方法

### 拡張機能によるmonkey patch

`.pi/extensions/pi-ai-abort-fix.ts`がセッション開始時に自動的にパッチを適用する。

#### 対象ファイル

1. `@mariozechner/pi-ai/dist/providers/anthropic.js`
2. `@mariozechner/pi-ai/dist/providers/openai-completions.js`
3. `@mariozechner/pi-ai/dist/providers/openai-responses-shared.js`

#### 修正内容

```typescript
providerModule.mapStopReason = (reason: string): string => {
  if (reason === "abort") {
    return "aborted";
  }
  return originalMapStopReason.call(providerModule, reason);
};
```

### 戻り値の意味

| 停止理由 | 戻り値 | 意味 |
|---------|-------|-----|
| abort | aborted | ユーザーまたはシステムによる中止 |

## patch-packageからの移行

以前は`patch-package`を使用していたが、拡張機能ベースに移行した。

### 移行理由

1. **バージョン非依存**: pi-aiのバージョンアップでパッチが壊れる問題を回避
2. **簡易メンテナンス**: パッチファイルの管理が不要
3. **自動適用**: 拡張機能として自動ロードされる

### 削除されたファイル

- `patches/@mariozechner+pi-ai+0.53.0.patch`

## 今後の注意点

### upstream対応

この問題はupstream（pi-aiリポジトリ）での修正が望ましい。修正がマージされたら:

1. 拡張機能を削除: `.pi/extensions/pi-ai-abort-fix.ts`
2. このドキュメントを削除

### 他のstop reasonが追加された場合

拡張機能を拡張して対応:

```typescript
providerModule.mapStopReason = (reason: string): string => {
  if (reason === "abort") return "aborted";
  if (reason === "new_reason") return "appropriate_value";
  return originalMapStopReason.call(providerModule, reason);
};
```

## 関連ファイル一覧

| ファイル | 説明 |
|---------|-----|
| `.pi/extensions/pi-ai-abort-fix.ts` | monkey patch拡張機能 |

---

## 関連トピック

- [トラブルシューティング](../04-reference/03-troubleshooting.md) - 一般的な問題の解決方法
- [開発者ガイド](../03-development/README.md) - 開発環境のセットアップ
