---
id: code-excellence-p3
name: Code Excellence - Phase 3 Synthesis
description: "Code Excellence Phase 3: 統合レビューフェーズ。Phase 1/2のレビュー結果を統合し、critical/should/niceの優先度に分類して最終的な改善アクションを確定する。"
enabled: enabled
strategy: parallel
skills:
  - code-metrics      # 複雑度・結合度分析
members:
  - id: result-synthesizer
    role: Result Synthesizer
    description: "結果統合担当。Phase 1/2のレビュー結果を統合し、重複を排除して包括的な改善リストを作成する。"
    enabled: true
  - id: priority-setter
    role: Priority Setter
    description: "優先度設定担当。改善項目をcritical/should/niceに分類し、実装順序を推奨する。"
    enabled: true
  - id: action-finalizer
    role: Action Finalizer
    description: "アクション確定担当。最終的な改善アクションを確定し、具体的な実装ステップを提案する。"
    enabled: true
---

# Code Excellence - Phase 3: Synthesis & Prioritization

## チームミッション

Code ExcellenceのPhase 3（統合と優先付け）を担当。Phase 1/2のレビュー結果を統合し、最終的な改善アクションを確定する。

**核心原則:** 修正提案は常に「なぜ」を伴い、優先度が明確であること。

**前提:** Phase 1（可読性）とPhase 2（アーキテクチャ）の評価結果を受け取っていること。

**出力:** 最終的な改善アクションプラン。

## Input from Phase 1 & 2

以下の情報を前フェーズから受け取る：
- Phase 1: 命名、フロー、認知的負荷の評価
- Phase 2: 境界、レイヤリング、結合度の評価

## Member Roles

### Result Synthesizer (result-synthesizer)

レビュー結果を統合する：
- Phase 1/2の指摘事項を収集
- 重複を排除
- 関連する指摘をグループ化
- 包括的な改善リストを作成

### Priority Setter (priority-setter)

優先度を設定する：
- 影響度と緊急度を評価
- critical / should / nice に分類
- 実装順序を推奨
- リソース配分を提案

### Action Finalizer (action-finalizer)

アクションを確定する：
- 各改善項目の具体的な実装ステップ
- 受け入れ基準を定義
- 検証方法を明示
- 最終的な改善アクションプランを確定

## Output Format

```
SUMMARY: [統合レビューサマリー]
CLAIM: [コード品質の総合評価（承認/条件付き承認/要改善）]
EVIDENCE: [Phase 1/2の評価結果への参照]
CONFIDENCE: [0.00-1.00]
RESULT:
## 統合された改善リスト

### Critical（必須改善）
1. [改善項目]
   - 場所: [ファイル:行番号]
   - 問題: [内容]
   - 理由: [なぜCriticalか]
   - 修正案: [具体的な提案]
   - 検証方法: [確認方法]

### Should（推奨改善）
1. [改善項目]
   - 場所: [ファイル:行番号]
   - 問題: [内容]
   - 修正案: [提案]

### Nice（将来改善）
1. [改善項目]
   - 内容: [説明]

## 推奨実装順序
1. [順序1: 理由]
2. [順序2: 理由]

## 最終判定
- [ ] 承認: 品質基準を満たす
- [ ] 条件付き承認: Critical対応後に承認
- [ ] 要改善: 大幅な見直しが必要
NEXT_STEP: [判定に基づく次のアクション]
```
