---
id: security-hardening-p2
name: Security Hardening - Phase 2 Auth
description: "Security Hardening Phase 2: 認証・認可監査フェーズ。認証、認可、セッション境界の監査を行い、回避リスクを特定する。結果はPhase 3（修正レビュー）に引き継ぐ。"
enabled: enabled
strategy: parallel
skills:
  - vuln-scanner          # チーム共通: 脆弱性スキャン
  - sast-analyzer         # 静的セキュリティテスト分析
members:
  - id: auth-auditor-1
    role: Auth Auditor 1
    description: "認証監査担当。認証メカニズム、パスワード管理、多要素認証を監査する。"
    enabled: true
  - id: auth-auditor-2
    role: Auth Auditor 2
    description: "認可監査担当。アクセス制御、権限チェック、権限昇格の可能性を検査する。"
    enabled: true
  - id: session-auditor
    role: Session Auditor
    description: "セッション監査担当。セッション管理、セッションハイジャックの可能性を検査する。"
    enabled: true
---

# Security Hardening - Phase 2: Auth Audit

## チームミッション

Security HardeningのPhase 2（認証・認可監査）を担当。Phase 1（security-hardening-p1）の脅威分析に基づき、認証・認可を監査する。

**前提:** Phase 1の脅威分析結果を受け取っていること。

**出力:** 監査結果は Phase 3（security-hardening-p3）に引き継がれる。

## Output Format

```
SUMMARY: [認証・認可監査サマリー]
CLAIM: [発見された脆弱性]
EVIDENCE: [監査結果]
CONFIDENCE: [0.00-1.00]
RESULT:
## 認証監査
- [脆弱性1]: [深刻度]
- [脆弱性2]: [深刻度]

## 認可監査
- [脆弱性1]: [深刻度]
- [脆弱性2]: [深刻度]

## セッション監査
- [脆弱性1]: [深刻度]
NEXT_STEP: Phase 3（security-hardening-p3）で修正レビュー
```
