---
title: pi-coding-agent-rate-limit-fix
category: reference
audience: developer, contributor
last_updated: 2026-02-19
tags: [rate-limit, retry, extension]
related: [./README.md, ../../.pi/extensions/pi-coding-agent-rate-limit-fix.ts]
---

# pi-coding-agent-rate-limit-fix

> パンくず: [Home](../README.md) > [Patches](./README.md) > pi-coding-agent-rate-limit-fix

## 概要

`@mariozechner/pi-coding-agent` の `429` 自動リトライ挙動を、起動時に拡張で補正する。

`patch-package` ではなく、`session_start` フックでランタイム適用する。

## 対象

- モジュール: `@mariozechner/pi-coding-agent/dist/core/agent-session.js`
- 拡張: `.pi/extensions/pi-coding-agent-rate-limit-fix.ts`

## 変更内容

- `429` 判定の専用関数を追加
- `Retry-After`（秒/ms）の解析を追加
- 連続 `429` 時のクールダウン学習（streak）を追加
- 成功時に streak と cooldown をリセット
- 待機時間に `maxDelayMs` の上限を適用

## 運用

`package.json` の `pi.extensions` に登録済み。

起動時ログで状態確認できる:

- `[pi-coding-agent-rate-limit-fix] applied runtime patch`
- `[pi-coding-agent-rate-limit-fix] patch already applied`
- `[pi-coding-agent-rate-limit-fix] skipped (target changed or not found)`

## 注意

依存パッケージ側のコード構造が変わると `skip` になる。

その場合は `.pi/extensions/pi-coding-agent-rate-limit-fix.ts` の置換文字列を更新する。
