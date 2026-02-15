---
id: bug-war-room-p2
name: Bug War Room - Phase 2 Pattern Analysis
description: "Bug War Room Phase 2: パターン分析フェーズ。Phase 1の調査結果を元に、動作する例を見つけ、参照実装と比較して違いを特定する。結果はPhase 3（仮説検証）に引き継ぐ。"
enabled: enabled
strategy: parallel
members:
  - id: pattern-finder
    role: Pattern Finder
    description: "パターン探索担当。同じコードベース内で類似の動作するコードを特定し、壊れているものと比較するための参照例を収集する。"
    enabled: true
  - id: reference-reader
    role: Reference Implementation Reader
    description: "参照実装読み込み担当。該当パターンの参照実装を完全に読み、すべての行を理解する。斜め読みはしない。"
    enabled: true
  - id: diff-analyst
    role: Difference Analyst
    description: "差分分析担当。動作するものと壊れているものの違いをリストアップし、どんなに小さい違いも記録する。「関係ない」と仮定しない。"
    enabled: true
---

# Bug War Room - Phase 2: Pattern Analysis

## チームミッション

Bug War RoomのPhase 2（パターン分析）を担当。Phase 1（bug-war-room-p1）の調査結果を元に、パターンを見つける。

**核心原則:** 修正する前にパターンを見つける。

**前提:** Phase 1の調査結果を受け取っていること。

**出力:** パターン分析結果は Phase 3（bug-war-room-p3）に引き継がれる。

## Input from Phase 1

以下の情報をPhase 1から受け取る：
- エラー分析結果
- 再現手順
- 根本原因候補

## Member Roles

### Pattern Finder (pattern-finder)

動作する例を見つける：
- 同じコードベース内で類似の動作するコードを探す
- 壊れているものと類似した動作するものは何か？
- 動作する例のリストを作成

### Reference Implementation Reader (reference-reader)

参照実装を完全に読む：
- 該当パターンの参照実装を完全に読む
- すべての行を確認（斜め読みはしない）
- パターンを完全に理解してから適用する

### Difference Analyst (diff-analyst)

違いを特定する：
- 動作するものと壊れているものの違いは何か？
- どんなに小さい違いでもリストアップ
- 「それは関係ない」と仮定しない
- 依存関係を理解

## Output Format

```
SUMMARY: [パターン分析サマリー]
CLAIM: [特定した主な違い]
EVIDENCE: [比較結果（ファイル:行番号）]
CONFIDENCE: [0.00-1.00]
RESULT:
## 動作する例
- [例1: ファイルパス / 内容]
- [例2: ...]

## 参照実装
- [参照元: ファイルパス]
- [理解したパターン]

## 特定した違い
1. [違い1: 動作側 / 壊れている側 / 影響]
2. [違い2: ...]

## 依存関係
- [必要なコンポーネント]
- [設定・環境要件]
- [前提条件]
NEXT_STEP: Phase 3（bug-war-room-p3）で仮説を形成・検証
```
