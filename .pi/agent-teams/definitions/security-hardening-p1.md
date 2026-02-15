---
id: security-hardening-p1
name: Security Hardening - Phase 1 Threat
description: "Security Hardening Phase 1: 攻撃面マッピングフェーズ。攻撃対象領域、信頼境界、悪用シナリオをマッピングし、深刻度を評価する。結果はPhase 2（認証・認可監査）に引き継ぐ。"
enabled: enabled
strategy: parallel
skills:
  - vuln-scanner          # チーム共通: 脆弱性スキャン
  - secret-detector       # チーム共通: 機密情報検出
members:
  - id: attack-surface-mapper
    role: Attack Surface Mapper
    description: "攻撃面マッピング担当。外部に公開される攻撃対象領域を特定する。"
    enabled: true
  - id: trust-boundary-analyst
    role: Trust Boundary Analyst
    description: "信頼境界分析担当。信頼境界、データフロー境界を特定する。"
    enabled: true
  - id: exploit-scenario-designer
    role: Exploit Scenario Designer
    description: "悪用シナリオ設計担当。想定される悪用シナリオを特定し、深刻度を評価する。"
    enabled: true
---

# Security Hardening - Phase 1: Threat Modeling

## チームミッション

Security HardeningのPhase 1（攻撃面マッピング）を担当。セキュリティリスクを包括的に特定する。

**出力:** 脅威分析結果は Phase 2（security-hardening-p2）に引き継がれる。

## Output Format

```
SUMMARY: [脅威分析サマリー]
CLAIM: [主要なセキュリティリスク]
EVIDENCE: [攻撃面マップ、悪用シナリオ]
CONFIDENCE: [0.00-1.00]
RESULT:
## 攻撃面
- [攻撃面1]: [深刻度]
- [攻撃面2]: [深刻度]

## 信頼境界
- [境界1]: [説明]
- [境界2]: [説明]

## 悪用シナリオ
- [シナリオ1]: [深刻度: 高/中/低]
- [シナリオ2]: [深刻度]
NEXT_STEP: Phase 2（security-hardening-p2）で認証・認可監査
```
