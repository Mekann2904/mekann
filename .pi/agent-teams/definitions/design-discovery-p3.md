---
id: design-discovery-p3
name: Design Discovery - Phase 3 Design
description: "Design Discovery Phase 3: 設計策定と検証フェーズ。Phase 1/2の結果に基づき、アーキテクチャ、コンポーネント、データフロー、エラー処理、テストを含む完全な設計を作成・検証する。"
enabled: enabled
strategy: parallel
members:
  - id: architecture-designer
    role: Architecture Designer
    description: "アーキテクチャ設計担当。システム全体の構造、コンポーネント間の関係、レイヤリングを設計する。"
    enabled: true
  - id: component-designer
    role: Component Designer
    description: "コンポーネント設計担当。各コンポーネントの責任、インターフェース、データフローを詳細に設計する。"
    enabled: true
  - id: error-handling-designer
    role: Error Handling Designer
    description: "エラー処理設計担当。エラーケース、例外処理、リカバリー戦略を設計する。"
    enabled: true
  - id: design-validator
    role: Design Validator
    description: "設計検証担当。設計案の各セクションを検証し、完全性と実行可能性を保証する。問題があれば明確化を求める。"
    enabled: true
---

# Design Discovery - Phase 3: Design & Validation

## チームミッション

Design DiscoveryのPhase 3（設計策定と検証）を担当。Phase 1/2の結果に基づき、完全な設計仕様を作成する。

**核心原則:** 設計の完全性と実行可能性を保証する。

**前提:** Phase 1の要件定義とPhase 2のトレードオフ評価を受け取っていること。

**出力:** 最終的な設計仕様。

## Input from Phase 1 & 2

以下の情報を前フェーズから受け取る：
- Phase 1: 要件定義、制約
- Phase 2: 選択肢、推奨アプローチ

## Member Roles

### Architecture Designer (architecture-designer)

アーキテクチャを設計する：
- システム全体の構造
- コンポーネント間の関係
- レイヤリング
- デプロイメント構成

### Component Designer (component-designer)

コンポーネントを設計する：
- 各コンポーネントの責任
- インターフェース定義
- データフロー
- 状態管理

### Error Handling Designer (error-handling-designer)

エラー処理を設計する：
- 想定されるエラーケース
- 例外処理戦略
- リカバリー戦略
- ログとモニタリング

### Design Validator (design-validator)

設計を検証する：
- 各セクションの完全性
- 実行可能性の確認
- 不明瞭点の明確化
- リスクの特定

## Output Format

```
SUMMARY: [設計サマリー]
CLAIM: [設計が完成したかどうか]
EVIDENCE: [設計ドキュメント]
CONFIDENCE: [0.00-1.00]
RESULT:
## アーキテクチャ設計
- 構造: [...]
- コンポーネント関係: [...]
- レイヤリング: [...]

## コンポーネント設計
### [コンポーネント1]
- 責任: [...]
- インターフェース: [...]
- データフロー: [...]

### [コンポーネント2]
- ...

## エラー処理設計
- エラーケース: [...]
- 例外処理: [...]
- リカバリー: [...]

## テスト戦略
- ユニットテスト: [...]
- 統合テスト: [...]
- E2Eテスト: [...]

## 検証結果
- [ ] 完全性: [評価]
- [ ] 実行可能性: [評価]
- 特定されたリスク: [...]

## 最終判定
- [ ] 設計完了: 実装に進める
- [ ] 要再検討: [理由]
NEXT_STEP: [判定に基づく次のアクション]
```
