---
id: rapid-swarm-p1
name: Rapid Swarm - Phase 1 Interface
description: "Rapid Swarm Phase 1: API・インターフェース分析フェーズ。外部インターフェース、API設計、契約境界を迅速に分析する。結果はPhase 2（データフロー分析）に引き継ぐ。"
enabled: enabled
strategy: parallel
members:
  - id: api-analyst-1
    role: API Analyst 1
    description: "API分析担当1。公開API、エンドポイント、リクエスト・レスポンス形式を分析する。"
    enabled: true
  - id: api-analyst-2
    role: API Analyst 2
    description: "API分析担当2。認証・認可、エラーレスポンス、レート制限を分析する。"
    enabled: true
  - id: contract-analyst
    role: Contract Analyst
    description: "契約分析担当。インターフェース契約、型定義、バリデーションルールを分析する。"
    enabled: true
---

# Rapid Swarm - Phase 1: Interface Analysis

## チームミッション

Rapid SwarmのPhase 1（API・インターフェース分析）を担当。外部境界を迅速に分析する。

**核心原則:** 速度を重視し、簡潔で実行可能な出力を返す。

**出力:** 分析結果は Phase 2（rapid-swarm-p2）に引き継がれる。

## Output Format

```
SUMMARY: [インターフェース分析サマリー]
CLAIM: [主要な発見]
EVIDENCE: [API定義、契約]
CONFIDENCE: [0.00-1.00]
RESULT:
## API一覧
- [API1]: [概要]
- [API2]: [概要]

## 契約境界
- [境界1]
- [境界2]
NEXT_STEP: Phase 2（rapid-swarm-p2）でデータフロー分析
```
