---
title: Verification Workflow Test
category: reference
audience: developer
last_updated: 2026-02-18
tags: [test, verification, workflow, unit-test]
related: [verification-workflow]
---

# Verification Workflow Test

verification-workflow.tsのユニットテスト。

## 概要

シンプルなテストランナーを使用して検証ワークフローモジュールの各機能をテストする。

## 実行方法

```bash
node --import tsx .pi/lib/verification-workflow.test.ts
```

またはvitest/jestなどのテストランナーを使用。

## Test Categories

### shouldTriggerVerification() Tests

検証トリガー判定のテスト:

- 検証無効時はトリガーしない
- 信頼度が閾値を超える場合はトリガーしない
- 低信頼度（0.7未満）でトリガー
- 高リスクタスクは高信頼度でもトリガー
- post-subagentモードでトリガー
- post-teamモードのテスト

### detectClaimResultMismatch() Tests

CLAIM-RESULT不一致検出のテスト:

- 否定の不一致を検出
- 不確実性-信頼度の不一致を検出
- 共通キーワードの欠落を検出
- 一貫性のある出力はトリガーしない

### detectOverconfidence() Tests

過信検出のテスト:

- 最小限の証拠での高信頼度を検出
- 高信頼度マーカーに不確実性がない場合を検出
- 低い証拠具体性を検出
- 十分な証拠のある高信頼度はトリガーしない

### detectMissingAlternatives() Tests

代替解釈欠如検出のテスト:

- 高信頼度結論での代替解釈欠如を検出
- DISCUSSIONセクション欠如を検出
- 代替案が議論されている場合はトリガーしない

### detectConfirmationBias() Tests

確認バイアス検出のテスト:

- 肯定的証拠のみで確認バイアスを検出
- 複数の確認フレーズを検出
- 反証の探索がある場合はトリガーしない

### isHighStakesTask() Tests

高リスクタスク判定のテスト:

- 削除操作を高リスクと判定
- 本番環境を高リスクと判定
- セキュリティ関連を高リスクと判定
- 認証タスクを高リスクと判定
- 暗号化/パスワードを高リスクと判定
- 破壊的操作を高リスクと判定
- マイグレーションを高リスクと判定
- 低リスクタスクは高リスクと判定しない

### resolveVerificationConfig() Tests

設定解決のテスト:

- デフォルト設定を返す
- disabledモードで無効化
- strictモードで厳格設定
- minimalモードで最小設定
- 環境変数のパース
- 範囲外値のクランプ

### buildInspectorPrompt() Tests

Inspectorプロンプト生成のテスト:

- ターゲット出力を含む
- 必要な検査パターンを含む

### buildChallengerPrompt() Tests

Challengerプロンプト生成のテスト:

- ターゲット出力を含む
- 全チャレンジカテゴリを含む

### synthesizeVerificationResult() Tests

検証結果統合のテスト:

- 問題なしでpassを返す
- medium疑惑でpass-with-warnings
- high疑惑でneeds-review
- critical challengeでfail
- ブロック時に再実行が必要
- 最大検証深度を尊重

### getVerificationWorkflowRules() Tests

ルール文字列のテスト:

- 非空の文字列を返す
- 環境変数のドキュメントを含む
- 検証判定の説明を含む

## Test Utilities

### createDefaultContext()

デフォルトのVerificationContextを作成。

```typescript
function createDefaultContext(overrides?: Partial<VerificationContext>): VerificationContext
```

### restoreEnv()

テスト用環境変数をリセット。

```typescript
function restoreEnv(): void
```

### Assertion Functions

- `assertEqual<T>(actual, expected, message?)` - 厳密等価チェック
- `assertDeepEqual<T>(actual, expected, message?)` - 深度等価チェック
- `assertTrue(value, message?)` - 真値チェック
- `assertFalse(value, message?)` - 偽値チェック

## 関連ファイル

- `.pi/lib/verification-workflow.ts` - 検証ワークフローモジュール
