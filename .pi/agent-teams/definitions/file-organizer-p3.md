---
id: file-organizer-p3
name: File Organizer - Phase 3 Execution
description: "File Organizer Phase 3: 実行と検証フェーズ。承認された計画を実行し、フォルダを作成してファイルを移動・名前変更し、すべての操作をログに記録する。"
enabled: enabled
strategy: parallel
members:
  - id: plan-executor
    role: Plan Executor
    description: "計画実行担当。承認された計画に従ってフォルダ作成、ファイル移動・名前変更を実行する。"
    enabled: true
  - id: operation-logger
    role: Operation Logger
    description: "操作ログ担当。すべての操作をログに記録し、ロールバック可能な情報を保持する。"
    enabled: true
  - id: verification-checker
    role: Verification Checker
    description: "検証担当。実行結果を確認し、整合性をチェックする。保守のヒントを提供する。"
    enabled: true
---

# File Organizer - Phase 3: Execution & Verification

## チームミッション

File OrganizerのPhase 3（実行と検証）を担当。Phase 2（file-organizer-p2）で策定された計画を実行する。

**前提:** Phase 2の整理計画とユーザー承認を受け取っていること。

**出力:** 実行結果と検証サマリー。

## Output Format

```
SUMMARY: [実行サマリー]
CLAIM: [整理が完了したか]
EVIDENCE: [実行ログ]
CONFIDENCE: [0.00-1.00]
RESULT:
## 実行した操作
1. [操作1]: [結果]
2. [操作2]: [結果]

## 検証結果
- ファイル整合性: [OK/NG]
- 構造確認: [OK/NG]

## ロールバック情報
- ログファイル: [パス]

## 保守のヒント
- [ヒント1]
- [ヒント2]
NEXT_STEP: 完了
```
