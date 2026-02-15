---
id: file-organizer-p1
name: File Organizer - Phase 1 Analysis
description: "File Organizer Phase 1: 現状分析フェーズ。フォルダとファイルの構造を理解し、ファイルタイプ、サイズ分布、重複ファイルを特定する。結果はPhase 2（整理計画）に引き継ぐ。"
enabled: enabled
strategy: parallel
members:
  - id: structure-analyst
    role: Structure Analyst
    description: "構造分析担当。フォルダとファイルをレビューして現在の構造を理解し、ファイルタイプ、サイズ分布、日付範囲を分析する。"
    enabled: true
  - id: duplicate-detector
    role: Duplicate Detector
    description: "重複検出担当。システム全体で重複ファイルを特定し、ファイルパス、サイズ、変更日を表示して保持すべきファイルを推奨する。"
    enabled: true
  - id: issue-spotter
    role: Issue Spotter
    description: "問題発見担当。明らかな整理問題、命名規則違反、不適切な配置を特定する。"
    enabled: true
---

# File Organizer - Phase 1: Analysis

## チームミッション

File OrganizerのPhase 1（現状分析）を担当。現在のファイル構造を理解し、問題点を特定する。

**出力:** 分析結果は Phase 2（file-organizer-p2）に引き継がれる。

## Output Format

```
SUMMARY: [現状分析サマリー]
CLAIM: [整理が必要な領域]
EVIDENCE: [分析データ]
CONFIDENCE: [0.00-1.00]
RESULT:
## 現状構造
- フォルダ数: [N]
- ファイル数: [N]
- 総サイズ: [X MB/GB]

## 重複ファイル
- [ファイル1]: [パスA], [パスB]
- [ファイル2]: [パスC], [パスD]

## 特定した問題
- [問題1]: [詳細]
- [問題2]: [詳細]
NEXT_STEP: Phase 2（file-organizer-p2）で整理計画策定
```
