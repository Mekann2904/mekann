---
id: code-excellence-team
name: Code Excellence Team
description: 包括的なコード品質レビューチーム。可読性、アーキテクチャ、統合の3フェーズで構成。Phase 1で可読性レビュー、Phase 2でアーキテクチャレビュー、Phase 3で統合と優先付けを行い、コード品質を体系的に向上させる。
enabled: enabled
strategy: parallel
skills:
  - lint-analyzer         # チーム共通: Lint結果解析
  - code-review           # Engineering Practices - コードレビュー原則
members:
  - id: naming-reviewer
    role: Naming Reviewer
    description: Phase 1の命名レビュー担当。変数名・関数名が意図を正確に表現しているかを評価。略語や抽象度の高い名前に注意。
    enabled: true
  - id: layering-reviewer
    role: Layering Reviewer
    description: Phase 2のレイヤリングレビュー担当。層の分離、依存の方向、抽象レベルの一貫性を確認する。
    enabled: true
  - id: action-finalizer
    role: Action Finalizer
    description: Phase 3のアクション確定担当。最終的な改善アクションを確定し、具体的な実装ステップを提案する。
    enabled: true
---

# Code Excellence Team

## チームミッション

包括的なコード品質レビューチーム。可読性、アーキテクチャ、統合の3フェーズで構成され、コード品質を体系的に向上させる。

## Phase構成

このチームは以下のフェーズ別チームと連携して動作します：

- **Phase 1 (code-excellence-p1)**: 可読性レビュー - 命名、フロー、認知的負荷
- **Phase 2 (code-excellence-p2)**: アーキテクチャレビュー - 境界、レイヤリング、結合度
- **Phase 3 (code-excellence-p3)**: 統合と優先付け - critical/should/niceの分類

## When to Use

- プルリクエストのレビュー
- レガシーコードの改善評価
- 新機能実装後の品質チェック
- リファクタリング前の現状把握

## 注意事項

詳細な手順とガイドラインは各フェーズ別チーム（p1, p2, p3）を参照してください。
