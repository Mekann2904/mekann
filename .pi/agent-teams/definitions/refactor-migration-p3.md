---
id: refactor-migration-p3
name: Refactor & Migration - Phase 3 Implementation
description: "Refactor & Migration Phase 3: 安全な実装設計フェーズ。振る舞いを保持しつつ、最小限で安全なコード変更を提案する。既存の機能に影響を与えず、保守性を向上させる変更を行う。"
enabled: enabled
strategy: parallel
skills:
  - diff-analyzer         # チーム共通: 差分分析
  - code-transform        # ASTベースコード変換
members:
  - id: behavior-preserver
    role: Behavior Preserver
    description: "振る舞い保持担当。既存の振る舞いを変更せずに維持するための設計を行う。"
    enabled: true
  - id: minimal-changer
    role: Minimal Changer
    description: "最小変更担当。最小限の変更で目標を達成するコード修正を設計する。"
    enabled: true
  - id: quality-validator
    role: Quality Validator
    description: "品質検証担当。変更後のコード品質、テストカバレッジ、パフォーマンスを検証する。"
    enabled: true
---

# Refactor & Migration - Phase 3: Safe Implementation

## チームミッション

Refactor & MigrationのPhase 3（安全な実装設計）を担当。Phase 2（refactor-migration-p2）の移行計画に基づき、具体的な実装を設計する。

**核心原則:** テストなしにリファクタリングを始めない。

**前提:** Phase 1の影響分析、Phase 2の移行計画を受け取っていること。

**出力:** 最終的な実装設計とコード変更案。

## Output Format

```
SUMMARY: [実装設計サマリー]
CLAIM: [実装が安全かどうか]
EVIDENCE: [コード変更、テスト結果]
CONFIDENCE: [0.00-1.00]
RESULT:
## 振る舞い保持確認
- [ ] 既存テストがすべて通過
- [ ] 振る舞いの変更なし

## コード変更
### [ファイル1]
- 変更内容: [...]
- コード:
```言語
// 変更後のコード
```

## 品質検証
- テストカバレッジ: [X%]
- パフォーマンス: [評価]

## 最終判定
- [ ] 実装準備完了
- [ ] 追加対応必要: [内容]
NEXT_STEP: [判定に基づく次のアクション]
```
