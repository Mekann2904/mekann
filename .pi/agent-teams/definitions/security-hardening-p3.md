---
id: security-hardening-p3
name: Security Hardening - Phase 3 Review
description: "Security Hardening Phase 3: 修正レビューフェーズ。提案された修正措置について網羅性とリグレッションの観点からレビューを行う。修正が完全で、新たな脆弱性を生み出していないかを確認する。"
enabled: enabled
strategy: parallel
skills:
  - vuln-scanner          # チーム共通: 脆弱性スキャン
  - sast-analyzer         # 静的セキュリティテスト分析
members:
  - id: fix-completeness-checker
    role: Fix Completeness Checker
    description: "修正完全性チェッカー。修正が脆弱性を完全に解決しているかを確認する。"
    enabled: true
  - id: regression-checker
    role: Regression Checker
    description: "リグレッションチェッカー。修正が新たな脆弱性を生み出していないかを確認する。"
    enabled: true
  - id: security-approver
    role: Security Approver
    description: "セキュリティ承認担当。最終的なセキュリティ評価を行い、承認/要修正を判断する。"
    enabled: true
---

# Security Hardening - Phase 3: Fix Review

## チームミッション

Security HardeningのPhase 3（修正レビュー）を担当。Phase 1/2（security-hardening-p1, security-hardening-p2）の結果に基づき、修正をレビューする。

**前提:** Phase 1の脅威分析、Phase 2の監査結果を受け取っていること。

**出力:** 最終的なセキュリティ評価。

## Output Format

```
SUMMARY: [修正レビューサマリー]
CLAIM: [修正が適切かどうか]
EVIDENCE: [レビュー結果]
CONFIDENCE: [0.00-1.00]
RESULT:
## 修正完全性チェック
- [ ] 脆弱性が完全に解決されている
- 未解決: [なし/あり（内容）]

## リグレッションチェック
- [ ] 新たな脆弱性なし
- 発見された問題: [なし/あり（内容）]

## 最終判定
- [ ] 承認: セキュリティ基準を満たす
- [ ] 要修正: [内容]
NEXT_STEP: [判定に基づく次のアクション]
```
