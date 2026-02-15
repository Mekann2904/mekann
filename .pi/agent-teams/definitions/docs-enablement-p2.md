---
id: docs-enablement-p2
name: Docs Enablement - Phase 2 Runbook
description: "Docs Enablement Phase 2: 運用手順文書化フェーズ。運用手順、トラブルシューティングフロー、リカバリ手順を文書化する。結果はPhase 3（品質チェック）に引き継ぐ。"
enabled: enabled
strategy: parallel
members:
  - id: procedure-author
    role: Procedure Author
    description: "手順書作成担当。日次・週次の運用手順、デプロイ手順、バックアップ手順を文書化する。"
    enabled: true
  - id: troubleshooting-author
    role: Troubleshooting Author
    description: "トラブルシューティング作成担当。よくある問題と解決策、エラーメッセージ一覧、FAQを作成する。"
    enabled: true
  - id: recovery-author
    role: Recovery Author
    description: "リカバリ手順作成担当。障害発生時の復旧手順、緊急時対応、ロールバック手順を文書化する。"
    enabled: true
---

# Docs Enablement - Phase 2: Runbook Creation

## チームミッション

Docs EnablementのPhase 2（運用手順文書化）を担当。運用者が迅速に情報を参照できるよう文書化する。

**前提:** Phase 1のオンボーディングフローを受け取っていること。

**出力:** 運用手順書は Phase 3（docs-enablement-p3）に引き継がれる。

## Output Format

```
SUMMARY: [運用手順文書化サマリー]
CLAIM: [運用者が迅速に対応できるか]
EVIDENCE: [作成したドキュメント]
CONFIDENCE: [0.00-1.00]
RESULT:
## 運用手順
- [手順1]: [内容]
- [手順2]: [内容]

## トラブルシューティング
- [問題1]: [解決策]
- [問題2]: [解決策]

## リカバリ手順
- [シナリオ1]: [手順]
- [シナリオ2]: [手順]
NEXT_STEP: Phase 3（docs-enablement-p3）で品質チェック
```
