---
title: 自己改善ループモード - データ品質レポート
category: development
audience: developer
last_updated: 2026-02-22
tags: [self-improvement, loop, data-quality, research-team]
related: [STATISTICAL_NOTES.md, ../skills/self-improvement/SKILL.md]
---

# 自己改善ループモード - データ品質レポート

**作成者:** Research Team - Data Steward
**作成日時:** 2026-02-22 20:53

---

## SUMMARY

既存loop.ts、git-workflowスキル、self-improvementスキル、および他の自動化拡張機能のパターンに関する包括的調査を完了。データ整合性とメタデータ管理の観点から品質評価を実施した。

---

## CLAIM

既存のloop.tsは十分な機能を持ち、7つの哲学的視座を統合した自己改善ループモードの実装基盤として適切である。ただし、完全自走のためにはgit操作の自動化における制約に対処が必要。

---

## EVIDENCE

- `.pi/extensions/loop.ts`: 57KB、完全な自律ループ実行機能（停止条件、安全機構、ログ管理実装済み）
- `.pi/extensions/loop/iteration-builder.ts`: 26KB、プロンプト構築・契約解析モジュール
- `.pi/extensions/loop/verification.ts`: 18KB、検証コマンド実行（許可リストベース）
- `.pi/skills/self-improvement/SKILL.md`: 1786行、7つの哲学的視座の詳細な理論的基盤
- `.pi/skills/git-workflow/SKILL.md`: questionツールによるユーザー確認が必須という制約
- `.pi/self-improvement-loop/STATISTICAL_NOTES.md`: statisticianによる統計的設計

---

## CONFIDENCE

0.85

---

## DISCUSSION

### 他メンバーへの参照

**Statistician**の統計解析ノートは、7視座サイクルの統計的設計を提供しており、本研究の基盤として適切である。特に、視座別の評価指標、収束判定基準、検出力分析が詳細に記述されている。

**EDA Analyst**のレポートは、既存loop.tsの詳細分析を提供しており、推奨事項として「既存loop.tsを拡張し、self-improvement-loopとして新規登録」を提示している。この推奨に同意する。

**acquisition**, **viz-xai-lead**, **pi-pm**はfailedステータスであり、これらの成果物は利用できない。

### 同意点

1. 既存loop.tsを拡張するアプローチに同意。新規作成よりも既存の安全機構、ログ管理を再利用できる利点がある。
2. 7つの視座をループ内で循環させる設計に同意。statisticianの設計したサイクルは統計的に妥当である。
3. 作業ログのJSONL形式とサマリーファイルの管理方式に同意。

### 懸念点・修正提案

1. **git操作の自動化制約**: git-workflowスキルは「読み取り専用操作以外は必ずquestionツールで確認」を要求している。完全自走のためには、以下の選択肢を検討する必要がある：
   - 選択肢A: git操作は条件付き自動化（安全な操作のみ自動、危険な操作は保留）
   - 選択肢B: ユーザー明示的な「--auto-commit」フラグで自動化を許可
   - 選択肢C: git操作は人間の介入ポイントとして設計し、ループは一時停止する

2. **7視座の複雑性**: 全ての視座を各イテレーションで適用すると、プロンプトが過度に長くなる可能性。EDA Analystの「視座の選択的適用」提案を支持する。

3. **反証の検討**: EDA Analystが指摘した「新規作成の方が良い可能性」について、ラッパーとして実装する選択肢も検討すべき。これは既存loop.tsへの影響リスクを回避できる。

### 合意形成

**合意: 既存loop.tsをベースに、7つの哲学的視座を統合した自己改善ループモードを実装する。ただし、git操作の自動化については条件付きとし、ユーザーの明示的な許可または安全な操作に限定する。**

---

## RESULT

### 1. データ辞書（既存コード）

| データ項目 | 型 | ソース | 説明 |
|-----------|-----|--------|------|
| LoopStatus | enum | loop.ts | "continue" \| "done" \| "unknown" |
| LoopGoalStatus | enum | loop.ts | "met" \| "not_met" \| "unknown" |
| ParsedLoopContract | interface | iteration-builder.ts | ループ契約解析結果 |
| LoopVerificationResult | interface | verification.ts | 検証コマンド実行結果 |
| PhilosophicalViewpoint | type | STATISTICAL_NOTES.md | 7つの哲学的視座 |
| StoppingCriteria | interface | STATISTICAL_NOTES.md | 統計的停止条件 |

### 2. データ品質評価

| 評価項目 | 既存loop.ts | self-improvementスキル | git-workflowスキル |
|---------|-------------|----------------------|-------------------|
| 完全性 | 高 | 高 | 高 |
| 一貫性 | 高 | 高 | 高 |
| 妥当性 | 高 | 高 | 高 |
| 日本語対応 | 部分 | 完全 | 完全 |
| 拡張性 | 高 | 高 | N/A |

### 3. メタデータ管理

**ログファイル構造:**
```
.pi/agent-loop/
├── <run-id>.jsonl          # 実行ログ（JSONL形式）
├── <run-id>.summary.json   # サマリファイル
└── latest-summary.json     # 最新サマリ
```

**サマリファイル必須フィールド:**
- runId: string
- startedAt: ISO8601
- finishedAt: ISO8601
- completed: boolean
- stopReason: "model_done" | "max_iterations" | "stagnation" | "iteration_error"
- iterationCount: number

### 4. 推奨されるデータフロー

```
ユーザー開始要求
    ↓
[初期化フェーズ]
    ├── 作業ログファイル作成（.pi/self-improvement-loop/<run-id>.md）
    ├── 現在のgit状態を記録
    └── 7視座の初期状態設定
    ↓
[視座循環フェーズ]
    ├── 視座選択（ラウンドロビン）
    ├── タスク実行（loop.ts拡張）
    ├── 出力品質評価（CLAIM-RESULT整合性）
    └── 検証（verification.ts）
    ↓
[停止判定フェーズ]
    ├── 統計的収束判定
    ├── ユーザー停止要求確認
    └── 安全停止条件確認
    ↓
[終了フェーズ]
    ├── git commit（条件付き自動化）
    ├── サマリファイル更新
    └── 作業ログ更新
```

### 5. データ整合性ルール

1. **二項対立の回避**: 停止条件は「成功/失敗」ではなく、複数の状態を持つ
2. **アポリア対処**: 完全性と速度の対立を「解決」せず、一時的な判断を明示
3. **文脈依存性の記録**: 各判断の文脈をログに記録
4. **除外事項の明示**: 「完了」と言うことで除外したものを明示

### 6. 反証と境界条件

**COUNTER_EVIDENCE:**
- 新規作成アプローチの方が、既存loop.tsへの影響リスクを回避できる可能性
- 7視座の全てをループに組み込むと、プロンプトが過度に長くなり処理時間が増加する可能性
- 完全自走の限界：ユーザー確認なしでのgit操作は、安全性の観点から懸念がある

**境界条件:**
- pi SDKのAPIが現状のままであること
- 7つの哲学的視座が要件として変更されないこと
- git-workflowスキルのユーザー確認ルールが維持されること

---

## NEXT_STEP

1. **design-discovery-team**: 7視座循環アーキテクチャの詳細設計（git操作の自動化条件を含む）
2. **core-delivery-team**: 拡張かラッパーかの実装アプローチの決定と実装計画の策定
3. **統合議論**: 全チームの成果物を統合し、最終的な設計を確定

---

## APPENDIX: 参照ファイル一覧

| ファイルパス | サイズ | 役割 |
|-------------|--------|------|
| `.pi/extensions/loop.ts` | 57KB | ループ実行エントリポイント |
| `.pi/extensions/loop/iteration-builder.ts` | 26KB | プロンプト構築・契約解析 |
| `.pi/extensions/loop/verification.ts` | 18KB | 検証コマンド実行 |
| `.pi/extensions/loop/reference-loader.ts` | 9KB | 参照読み込み |
| `.pi/extensions/loop/ssrf-protection.ts` | 6KB | セキュリティ保護 |
| `.pi/skills/self-improvement/SKILL.md` | 1786行 | 7つの哲学的視座 |
| `.pi/skills/self-reflection/SKILL.md` | 簡易版 | チェックリスト |
| `.pi/skills/git-workflow/SKILL.md` | 詳細版 | Git操作ルール |
| `.pi/self-improvement-loop/STATISTICAL_NOTES.md` | 新規 | 統計的設計 |

---

*このレポートはData Stewardの視点から、既存コード調査のデータ品質と整合性を評価したものである。*
