---
id: bug-war-room-p1
name: Bug War Room - Phase 1 Root Cause
description: "Bug War Room Phase 1: 根本原因調査フェーズ。エラーを読み取り、再現性を確認し、証拠を収集する。結果はPhase 2（パターン分析）に引き継ぐ。"
enabled: enabled
strategy: parallel
skills:
  - log-analyzer          # チーム共通: ログ解析・エラー抽出
members:
  - id: error-reader
    role: Error Analyst
    description: "エラー分析担当。エラーメッセージを注意深く読み、スタックトレースを解析し、行番号・ファイルパス・エラーコードを記録する。"
    enabled: true
  - id: repro-checker
    role: Reproducibility Checker
    description: "再現性確認担当。正確な再現手順を確立し、毎回発生するかを確認する。環境依存の問題を特定する。"
    enabled: true
  - id: change-tracker
    role: Change Tracker
    description: "変更追跡担当。最近の変更（git diff、コミット、依存関係更新、設定変更）を確認し、問題の原因候補を特定する。"
    enabled: true
---

# Bug War Room - Phase 1: Root Cause Investigation

## チームミッション

Bug War RoomのPhase 1（根本原因調査）を担当。修正を試みる前に、必ず根本原因を特定するための情報収集を行う。

**核心原則:** 根本原因調査なしに修正は許されない。

**出力:** 調査結果は Phase 2（bug-war-room-p2）に引き継がれる。

## Member Roles

### Error Analyst (error-reader)

エラーメッセージを注意深く読み、解析する：
- エラーや警告をスキップしない
- スタックトレースを完全に読む
- 行番号、ファイルパス、エラーコードを記録

### Reproducibility Checker (repro-checker)

再現性を確認し、再現手順を確立する：
- 確実にトリガーできるか？
- 正確な手順は何か？
- 毎回発生するか？
- 再現できない場合 → データをさらに収集

### Change Tracker (change-tracker)

最近の変更を確認する：
- 何が変更されてこれを引き起こす可能性があるか？
- git diff、最近のコミット
- 新しい依存関係、設定変更
- 環境の違い

## Output Format

```
SUMMARY: [調査サマリー]
CLAIM: [特定した根本原因の候補]
EVIDENCE: [ログ、スタックトレース、コード箇所]
CONFIDENCE: [0.00-1.00]
RESULT:
## エラー分析
- エラーメッセージ: [...]
- スタックトレース: [...]
- 関連ファイル: [...]

## 再現性
- 再現手順: [...]
- 発生頻度: [毎回/時々/不明]
- 環境依存: [あり/なし]

## 変更履歴
- 最近の変更: [...]
- 疑わしい変更: [...]

## 根本原因候補
1. [候補1] (信頼度: 高/中/低)
2. [候補2] (信頼度: ...)
NEXT_STEP: Phase 2（bug-war-room-p2）でパターン分析を実施
```
