---
title: Mediator層実装トレードオフ評価
category: development
audience: developer
last_updated: 2026-02-21
tags: [mediator, architecture, tradeoff-analysis]
related: [mediator-types.ts, intent-mediator.ts, mediator-integration.ts]
---

# Mediator層実装トレードオフ評価

## 概要

論文「Intent Mismatch Causes LLMs to Get Lost in Multi-Turn Conversation」（arXiv:2602.07338v1）の知見に基づき、Mediator層の実装について3つのアプローチを評価した結果をまとめる。

## 3つのアプローチ比較

### アプローチA: YAGNI原則維持（現在の実装）

**説明**: requirements-analystが実装した最小限の構成

**構成ファイル**:
- `.pi/lib/mediator-types.ts` - 型定義（約11KB）
- `.pi/lib/mediator-history.ts` - 履歴管理（約17KB）
- `.pi/lib/mediator-prompt.ts` - プロンプトテンプレート（約25KB）
- `.pi/lib/intent-mediator.ts` - メインロジック（約21KB）

**利点**:
1. 実装完了済みで即座に利用可能
2. 論文のTraining-free要件を完全に満たす
3. 新規依存関係なし
4. Equation (3)/(5)の型定義が適切

**欠点**:
1. confirmed-facts.jsonとconversation-summary.mdの二重フォーマット
2. intent-aware-limits.tsとの重複機能
3. LiC検出がLLM依存のみ（ルールベースなし）
4. Markdownパース処理が複雑

**適合性**:
- 論文Section 4: 十分に適合
- 保守性: 中
- 拡張性: 低

---

### アプローチB: 既存機能統合

**説明**: context-engineering.ts、intent-aware-limits.ts、semantic-repetition.tsとの完全統合

**追加統合先**:
- `context-engineering.ts` - コンテキストウィンドウ管理
- `intent-aware-limits.ts` - 意図分類
- `semantic-repetition.ts` - セマンティック反復検出
- `index.ts` - エクスポート統合

**利点**:
1. トークン管理が最適化される
2. 意図分類が統一される
3. 反復検出との連携が可能
4. 包括的な機能提供

**欠点**:
1. 大規模なリファクタリングが必要（2-3日）
2. 循環参照のリスク
3. YAGNI原則に反する過剰実装の可能性
4. テスト範囲が拡大

**適合性**:
- 論文Section 4: 過剰適合
- 保守性: 高
- 拡張性: 高

---

### アプローチC: 軽量拡張（推奨）

**説明**: YAGNI原則を尊重しつつ、最低限の改善を追加

**追加ファイル**:
- `.pi/lib/mediator-lic-rules.ts` - ルールベースLiC検出（約12KB）
- `.pi/lib/mediator-integration.ts` - 既存機能との統合（約7KB）

**改善内容**:
1. ルールベースLiC検出の追加（LLM呼び出し削減）
2. intent-aware-limits.tsとの軽量連携
3. トークン推定機能の追加
4. 統一サマリー生成

**利点**:
1. 半日の作業で保守性と機能性が向上
2. Training-free要件を維持
3. 大規模リファクタリング不要
4. 既存コードへの影響最小

**欠点**:
1. 追加ファイルが2つ増える
2. インターフェースの複雑化

**適合性**:
- 論文Section 4: 適切に適合
- 保守性: 高
- 拡張性: 中

---

## 推奨: アプローチC（軽量拡張）

### 理由

1. **コスト対効果**: 半日の作業で保守性と機能性が大幅に向上
2. **論文適合**: Training-free要件を維持しつつ、Section 4のガイドラインを強化
3. **リスク低減**: 大規模リファクタリングを避け、段階的改善が可能
4. **即時価値**: ルールベース検出により、LLM呼び出しなしでLiC兆候を検出可能

### 実装済みコンポーネント

#### 1. mediator-lic-rules.ts

ルールベースのLiC検出エンジン。以下のルールを実装:

| ルール | 兆候タイプ | 説明 |
|--------|-----------|------|
| GENERIC_RESPONSE_RULE | generic_response | 汎用応答パターン検出 |
| CONTEXT_IGNORATION_RULE | context_ignore | 文脈無視検出 |
| PREMISE_MISMATCH_RULE | premise_mismatch | 前提不一致検出 |
| CONFIRMATION_OVERLOAD_RULE | confirmation_overload | 過度な確認要求検出 |
| TOPIC_DRIFT_RULE | topic_drift | トピック逸脱検出 |

#### 2. mediator-integration.ts

既存機能との統合アダプター:

- `classifyMediatorIntent()`: Mediator意図をTaskIntentに変換
- `getMediatorBudget()`: 意図に基づく予算設定を取得
- `adjustBudgetByConfidence()`: 信頼度ベースの予算調整
- `buildOptimizedMediatorContext()`: トークン制限を考慮したコンテキスト構築

---

## 残存リスク

### 1. 履歴フォーマットの二重性

**現状**: confirmed-facts.json（JSON）とconversation-summary.md（Markdown）の二重管理

**リスク**:
- 同期不整合の可能性
- パース処理の複雑化

**推奨対応**:
- 段階的にJSONベースに統一（v2で実施）
- 移行スクリプトの作成

### 2. LLM統合の未完了

**現状**: `defaultLlmCall`がプレースホルダー

**リスク**:
- 本番環境で動作しない

**推奨対応**:
- pi-coreのLLMクライアントとの統合
- 環境変数による設定切り替え

### 3. テストカバレッジ

**現状**: テストファイル未作成

**リスク**:
- リグレッションの検出困難

**推奨対応**:
- ユニットテストの追加（特にパース関数）
- 統合テストの追加

---

## 次のステップ

### Phase 2（現在）

1. [完了] mediator-lic-rules.tsの実装
2. [完了] mediator-integration.tsの実装
3. [ ] intent-mediator.tsへの統合
4. [ ] index.tsへのエクスポート追加

### Phase 3（将来）

1. 履歴フォーマットのJSON統一
2. LLMクライアント統合
3. テストファイル作成
4. ドキュメント拡充

---

## 論文との適合性確認

| 論文の要件 | アプローチA | アプローチC | 状態 |
|-----------|-------------|-------------|------|
| Training-free | 適合 | 適合 | OK |
| 履歴のインコンテキスト使用 | 適合 | 適合 | OK |
| Equation (3): 意図推論と実行の分離 | 適合 | 適合 | OK |
| Equation (5): 履歴からの意図再構築 | 適合 | 適合 | OK |
| Experience Refiner | 基本実装 | 拡張可能 | OK |
| LiC検出 | LLM依存 | LLM + ルールベース | 改善 |

---

## 結論

**アプローチC（軽量拡張）を推奨する。**

現在のYAGNI原則に基づく実装（アプローチA）は、論文の要件を十分に満たしている。しかし、以下の点で改善の余地がある:

1. LiC検出のLLM依存は、トークン消費とレイテンシを増加させる
2. intent-aware-limits.tsとの連携がないため、意図分類が重複している

アプローチCは、これらの問題を最小限の変更で解決し、保守性と機能性を向上させる。大規模なリファクタリングを伴うアプローチBは、現在のフェーズでは過剰であり、将来のニーズに応じて検討すべきである。
