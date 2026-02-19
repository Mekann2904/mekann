---
id: security-hardening-p2
name: Security Hardening - Phase 2 Auth
description: "Security Hardening Phase 2: 認証・認可監査フェーズ。認証、認可、セッション境界の監査を行い、回避リスクを特定する。結果はPhase 3（修正レビュー）に引き継ぐ。"
enabled: enabled
strategy: parallel
skills:
  - vuln-scanner          # チーム共通: 脆弱性スキャン
  - sast-analyzer         # 静的セキュリティテスト分析
triggers:
  - Phase 1完了後の脅威分析結果
skip_conditions:
  - Phase 1の脅威分析結果未受領（Phase 1に戻る）
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

**核心原則:** 最小権限の原則を徹底する。アクセス制御の完全性を検証する。

**鉄の掟:**
```
入力は全て検証する
最小権限の原則を徹底する
```

**前提:** Phase 1の脅威分析結果を受け取っていること。

**出力:** 監査結果は Phase 3（security-hardening-p3）に引き継がれる。

## When to Use

Phase 1完了後、必ず実施:
- 認証フローの監査
- 認可チェックの確認
- セッション境界の検証

**スキップしてはならない:**
- 「入力検証は後で追加する」→ 後では来ない
- 「認証チェックはこのレイヤーで不要」→ 多層防御が必要

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

## 警告信号 - プロセスの遵守を促す

以下のような考えが浮かんだら、それはSTOPのサイン:
- 「入力検証は後で追加する」
- 「認証チェックはこのレイヤーで不要」
- 「セキュリティは機能開発後に」
- Phase 1の脅威分析を確認していない

**これらすべては: STOP。Phase 2を完了せよ。**

## 人間のパートナーの「やり方が間違っている」シグナル

**以下の方向転換に注意:**
- 「この入力は検証されているか？」 - 入力検証の欠如
- 「認可チェックは？」 - アクセス制御の欠如
- 「エラー時の情報漏洩は？」 - エラーハンドリングの問題

**これらを見たら:** STOP。Phase 2を完了せよ。

## よくある言い訳

| 言い訳 | 現実 |
|--------|------|
| 「入力検証は後で」 | 後では来ない。設計段階から組み込む。 |
| 「このレイヤーで不要」 | 多層防御。各レイヤーで検証する。 |
| 「機能開発後に」 | 後付けは不完全。設計の基盤に組み込む。 |
