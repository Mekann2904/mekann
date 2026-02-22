---
title: 思考・推論システム データカタログ
category: research
audience: researcher
last_updated: 2026-02-22
tags: [thinking, reasoning, philosophy, deconstruction]
related: [self-improvement, aporia-handler, thinking-process]
---

# 思考・推論システム データカタログ

**作成者**: Data Acquisition Specialist (acquisition)
**フェーズ**: 初期検討
**セッション**: deep-exploration-001

## 1. 収集したモジュール一覧

### 1.1 思考プロセス関連

| モジュール | パス | 機能 | 行数 | 信頼性 |
|-----------|------|------|------|--------|
| thinking-process.ts | .pi/lib/ | 6思考モード、4フェーズ、深化支援 | 450 | 高 |
| aporia-handler.ts | .pi/lib/ | アポリア検出、4対処戦略 | 400 | 高 |
| long-running-support.ts | .pi/lib/ | セッション管理、停滞検出、攪乱注入 | 350 | 高 |
| performance-profiles.ts | .pi/lib/ | タスク分類、6プロファイル | 280 | 高 |

### 1.2 検証・統合関連

| モジュール | パス | 機能 | 行数 | 信頼性 |
|-----------|------|------|------|--------|
| verification-workflow.ts | .pi/lib/ | Inspector/Challenger検証 | 600 | 高 |
| mediator-integration.ts | .pi/lib/ | 意図明確化、履歴管理 | 300 | 高 |

### 1.3 スキル定義

| スキル | パス | 機能 | 哲学的基盤 |
|-------|------|------|-----------|
| self-improvement | .pi/skills/ | 7つの哲学的視座による自己改善 | デリダ、ドゥルーズ＆ガタリ、アリストテレス、ニーチェ |
| self-reflection | .pi/skills/ | 簡易チェックリスト | 同上 |

## 2. モジュール詳細分析

### 2.1 thinking-process.ts

**主要機能**:
- 6つの思考モード: creative, analytical, critical, practical, social, emotional
- 4つの思考フェーズ: problem-discovery, problem-formulation, strategy-development, solution-evaluation
- 段階的思考深化: `thinkDeeper` 関数

**設計思想**:
- ド・ボノの「6つの思考帽」
- ブルームの分類学

**限界（7つの視座から）**:
1. パターン化のリスク
2. 「正しい思考」の前提
3. 進歩主義の物語

### 2.2 aporia-handler.ts

**主要機能**:
- 4つのアポリアタイプ: completeness-vs-speed, safety-vs-utility, autonomy-vs-obedience, consistency-vs-context
- 4つの対処戦略: maintain-tension, acknowledge-undecidable, responsible-decision, contextual-negotiation

**設計思想**:
- ヘーゲル的弁証法への抵抗
- 両極維持の原則

**限界**:
1. アポリアを「対処」対象として扱う
2. 「解決」への誘惑が残る
3. 検出パターンが固定

### 2.3 long-running-support.ts

**主要機能**:
- セッション管理
- 停滞検出: repetition, low-progress, mode-fixation, confidence-plateau
- 創造的攪乱: mode-switch, assumption-challenge, analogy, random-injection

**設計思想**:
- 停滞＝悪の前提
- 攪乱による回復

**限界**:
1. 「停滞」の否定的評価
2. 生産性の強制
3. ゼロ状態の不在

### 2.4 performance-profiles.ts

**主要機能**:
- タスク分類: trivial, simple, moderate, complex, critical, exploratory, creative
- 6つのプロファイル: fast, standard, quality, strict, exploratory, creative

**設計思想**:
- タスク別最適化
- 効率性への配慮

**限界**:
1. 効率性への服従
2. 「最適」の前提
3. タスクの分類不可能性への対応不足

## 3. データソースの信頼性評価

### 3.1 評価基準

| 基準 | 説明 | 重み |
|------|------|------|
| 実装完全性 | コードが完全に実装されているか | 0.3 |
| テストカバレッジ | テストが十分か | 0.2 |
| ドキュメント品質 | JSDoc/ABDDヘッダーが適切か | 0.2 |
| 哲学的整合性 | 7つの視座と整合しているか | 0.3 |

### 3.2 評価結果

| モジュール | 実装 | テスト | ドキュメント | 哲学 | 総合 |
|-----------|------|--------|-------------|------|------|
| thinking-process.ts | 高 | 中 | 高 | 中 | 0.75 |
| aporia-handler.ts | 高 | 中 | 高 | 高 | 0.80 |
| long-running-support.ts | 高 | 中 | 高 | 中 | 0.75 |
| performance-profiles.ts | 高 | 低 | 高 | 低 | 0.65 |
| verification-workflow.ts | 高 | 中 | 高 | 中 | 0.75 |
| self-improvement SKILL.md | - | - | 高 | 高 | 0.90 |

## 4. 取得プロセスの文書化

### 4.1 使用したコマンド

```bash
# モジュール検索
find .pi/lib -name "*.ts" | xargs grep -l "thinking\|aporia\|philosophical"

# スキル定義の確認
ls .pi/skills/*/SKILL.md
```

### 4.2 読み込んだファイル

1. `.pi/lib/thinking-process.ts`
2. `.pi/lib/aporia-handler.ts`
3. `.pi/lib/long-running-support.ts`
4. `.pi/lib/performance-profiles.ts`
5. `.pi/lib/verification-workflow.ts`
6. `.pi/lib/mediator-integration.ts`
7. `.pi/skills/self-improvement/SKILL.md`
8. `.pi/skills/self-reflection/SKILL.md`

## 5. 次のステップ

1. **Analysis Specialist**: 7つの視座からの詳細分析
2. **Methodology Specialist**: 研究手法の設計
3. **Quality Assurance Specialist**: データ品質の最終確認

---

*このカタログは Data Acquisition Specialist によって作成されました。*
