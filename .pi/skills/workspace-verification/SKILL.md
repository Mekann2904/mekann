---
name: workspace-verification
description: コード変更後の品質検証パイプライン。lint、typecheck、test、build、runtime、UI検証を自動化。失敗時のエラー要約と再実行機能を提供。
license: MIT
tags: [verification, testing, quality-gate, pipeline]
metadata:
  skill-version: "1.0.0"
  created-by: pi-skill-system
---

# Workspace Verification スキル

## 概要

`workspace_verify` は、コード変更後に品質ゲート（lint、typecheck、test、build、runtime、UI）を自動的に検証するパイプラインツールです。

## いつ使うか

| トリガー | アクション |
|---------|-----------|
| コード変更後 | `workspace_verify()` を実行して検証 |
| 失敗時 | エラー要約を読み、修正して再実行 |
| 成功時 | `workspace_verify_ack()` で承認（必要な場合） |
| 高リスク変更時 | `workspace_verify_review()` でレビュー |

## ツール一覧

| ツール | 目的 | 使用タイミング |
|--------|------|---------------|
| `workspace_verify` | 検証パイプラインを実行 | コード変更後 |
| `workspace_verify_status` | 現在の状態を確認 | 状態不明時 |
| `workspace_verify_plan` | 検証runbookを表示 | 手順確認時 |
| `workspace_verify_trajectory` | 実行履歴を表示 | デバッグ時 |
| `workspace_verify_replay` | 失敗から再開 | 再試行時 |
| `workspace_verify_ack` | 成功を承認 | 検証成功後 |
| `workspace_verify_review` | レビューを生成 | 高リスク変更時 |
| `workspace_verify_review_ack` | レビューを承認 | レビュー後 |
| `workspace_verify_replan` | 修復戦略を記録 | 反復失敗時 |

## 検証フロー

```
1. workspace_verify() を実行
   ├─ lint: コードスタイルチェック
   ├─ typecheck: TypeScript型チェック
   ├─ test: テスト実行
   ├─ build: ビルド
   ├─ runtime: ランタイム確認（オプション）
   └─ ui: UI確認（オプション）

2. 失敗した場合
   ├─ system prompt に「検証失敗の詳細」が表示される
   ├─ エラー要約を読む
   ├─ 詳細が必要なら artifact ファイルを read ツールで確認
   ├─ エラーを修正
   └─ workspace_verify() を再実行

3. 成功した場合
   ├─ requireProofReview=true の場合: workspace_verify_ack()
   ├─ requireReviewArtifact=true の場合: workspace_verify_review() + workspace_verify_review_ack()
   └─ 通常: 次のタスクへ進む
```

## 失敗時の対応

### 1. エラー要約を読む

system prompt に以下の形式で表示されます：

```
## 検証失敗の詳細

### test 失敗
コマンド: npm test
エラー要約:
```
Error: process.exit unexpectedly called with "1"
  at process.exceptionHandler .pi/lib/global-error-handler.ts:137:15
```
詳細ログ: /path/to/artifact/03-test.log

上記のエラーを修正し、再度 `workspace_verify` を実行すること。
```

### 2. 詳細ログを確認

```typescript
read({ path: "/path/to/artifact/03-test.log" })
```

### 3. エラーを分類

| エラータイプ | 対応 |
|-------------|------|
| テスト失敗 | テストコードまたは実装を修正 |
| 型エラー | 型定義を修正 |
| Lintエラー | コードスタイルを修正 |
| ビルドエラー | 依存関係や設定を確認 |
| タイムアウト | テストを分割またはタイムアウトを延長 |

### 4. 修正して再実行

```typescript
workspace_verify({ steps: ["test"] })  // 特定ステップのみ
workspace_verify()                      // 全ステップ
```

## 反復失敗時の対応

同じエラーが3回以上繰り返される場合：

1. スコープを狭める
2. `workspace_verify_replan()` で修復戦略を記録
3. 別のアプローチを試す

```typescript
workspace_verify_replan({
  strategy: "テストタイムアウトを延長し、テストを分割して実行する"
})
```

## 設定

```typescript
workspace_verification_config({ action: "show" })
```

主要な設定項目：

| 設定 | デフォルト | 説明 |
|------|-----------|------|
| `commandTimeoutMs` | 120000 | コマンドタイムアウト（ms） |
| `antiLoopThreshold` | 3 | 反復失敗検知閾値 |
| `requireProofReview` | false | 成功時の承認必須 |
| `requireReviewArtifact` | false | レビュー必須 |
| `autoRunOnTurnEnd` | false | ターン終了時自動実行 |

## よくある問題

### Q: テストがタイムアウトする

```typescript
workspace_verification_config({
  action: "update",
  commandTimeoutMs: 300000  // 5分に延長
})
```

### Q: 全テストが遅い

特定のテストのみ実行：

```typescript
workspace_verify({
  steps: ["lint", "typecheck"],
  trigger: "manual"
})
```

または検証コマンドをカスタマイズ：

```typescript
workspace_verification_config({
  action: "update",
  commands: { test: "npm test -- --grep='ralph-loop'" }
})
```

### Q: 検証状態が dirty のまま

強制的にクリア（デバッグ用）：

```typescript
workspace_verify_status()  // 状態確認
workspace_verify()         // 再検証
```

## ベストプラクティス

1. **変更後は必ず検証**: コード変更後は `workspace_verify` を実行
2. **エラー要約を読む**: system prompt の「検証失敗の詳細」を必ず確認
3. **詳細ログを活用**: 不明なエラーは artifact ファイルを確認
4. **部分検証を活用**: 全体が遅い場合は `steps` パラメータで絞り込み
5. **反復失敗時は再計画**: 同じエラーが続くならアプローチを変更

## 関連ファイル

- 実装: `.pi/extensions/workspace-verification.ts`
- ライブラリ: `.pi/lib/workspace-verification.ts`
- 設定: `.pi/workspace-verification/config.json`
- 状態: `.pi/workspace-verification/state.json`
- 履歴: `.pi/workspace-verification/continuity.json`
