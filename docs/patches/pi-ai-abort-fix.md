---
title: pi-ai Abort Stop Reason 修正パッチ
category: reference
audience: developer, contributor
last_updated: 2026-02-14
tags: [patch, pi-ai, zai, bugfix, patch-package]
related: [../04-reference/03-troubleshooting.md]
---

# pi-ai Abort Stop Reason 修正パッチ

> パンくず: [Home](../README.md) > [Patches](./) > pi-ai-abort-fix

## 概要

zaiプロバイダー（glm-5モデルなど）使用時に発生する"Unhandled stop reason: abort"エラーを修正するためのパッチ。`@mariozechner/pi-ai`パッケージの`mapStopReason`関数に"abort"ケースを追加する。

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

## 根本原因

`@mariozechner/pi-ai@0.52.9`の`mapStopReason`関数はTypeScriptのexhaustive checkを使用しており、未知の停止理由に対して例外を投げる設計になっている。しかし、"abort"という停止理由がケースとして定義されていなかった。

### 対象ファイル

1. `dist/providers/openai-completions.js` - OpenAI Completions API用
2. `dist/providers/openai-responses-shared.js` - OpenAI Responses API用

## 修正内容

### コード差分

#### openai-completions.js

```diff
 function mapStopReason(reason) {
     // ... 既存のケース ...
     case "content_filter":
         return "error";
+    case "abort":
+        return "aborted";
     default: {
         const _exhaustive = reason;
         throw new Error(`Unhandled stop reason: ${_exhaustive}`);
```

#### openai-responses-shared.js

```diff
 function mapStopReason(status) {
     // ... 既存のケース ...
     case "failed":
     case "cancelled":
         return "error";
+    case "abort":
+        return "aborted";
     // These two are wonky ...
     case "in_progress":
```

### 戻り値の意味

| 停止理由 | 戻り値 | 意味 |
|---------|-------|-----|
| abort | aborted | ユーザーまたはシステムによる中止 |

## patch-packageの仕組み

### 前提条件

`patch-package`が`devDependencies`に含まれている必要がある。

```json
// package.json
{
  "devDependencies": {
    "patch-package": "^8.0.0"
  },
  "scripts": {
    "postinstall": "patch-package"
  }
}
```

### 自動適用

`npm install`実行時に`postinstall`スクリプトが自動的にパッチを適用する。

### パッチファイルの場所

```
patches/
  @mariozechner+pi-ai+0.52.9.patch
```

### パッケージ名のエスケープ

patch-packageはスコープ付きパッケージの`/`を`+`に置換してファイル名を生成する。

```
@mariozechner/pi-ai -> @mariozechner+pi-ai
```

## 今後の注意点

### バージョンアップ時の対応

`@mariozechner/pi-ai`のバージョンを上げる場合:

1. **パッチの競合確認**

   ```bash
   npx patch-package @mariozechner/pi-ai --reverse
   ```

2. **パッチの更新**

   ```bash
   # node_modules内のファイルを直接編集後
   npx patch-package @mariozechner/pi-ai
   ```

3. **パッチファイル名の更新**

   バージョンが変わった場合、パッチファイル名も更新が必要:
   ```
   @mariozechner+pi-ai+0.52.9.patch -> @mariozechner+pi-ai+<新バージョン>.patch
   ```

### upstream対応

この問題はupstream（pi-aiリポジトリ）での修正が望ましい。修正がマージされたら:

1. パッチファイルを削除
2. `package.json`の`postinstall`スクリプトを削除（他にパッチがなければ）
3. pi-aiをアップデート

### 他のstop reasonが追加された場合

同様の手順でパッチを更新:

1. `node_modules/@mariozechner/pi-ai/dist/providers/*.js`を編集
2. `npx patch-package @mariozechner/pi-ai`でパッチ更新
3. このドキュメントを更新

## 関連ファイル一覧

| ファイル | 説明 |
|---------|-----|
| `patches/@mariozechner+pi-ai+0.52.9.patch` | パッチ本体 |
| `package.json` | postinstallスクリプト定義 |
| `node_modules/@mariozechner/pi-ai/dist/providers/openai-completions.js` | 修正対象1 |
| `node_modules/@mariozechner/pi-ai/dist/providers/openai-responses-shared.js` | 修正対象2 |

---

## 関連トピック

- [トラブルシューティング](../04-reference/03-troubleshooting.md) - 一般的な問題の解決方法
- [開発者ガイド](../03-development/README.md) - 開発環境のセットアップ

## 次のトピック

[ パッチ一覧に戻る ](./)（他のパッチがある場合）
