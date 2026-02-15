---
id: bug-war-room-p3
name: Bug War Room - Phase 3 Hypothesis
description: "Bug War Room Phase 3: 仮説検証フェーズ。Phase 1/2の結果を元に仮説を形成し、最小限の変更でテストする。検証結果はPhase 4（実装）に引き継ぐ。"
enabled: enabled
strategy: parallel
members:
  - id: hypothesis-former
    role: Hypothesis Former
    description: "仮説形成担当。「Xが根本原因だと思われる。なぜならYだから」と明確に仮説を形成する。複数の仮説がある場合は優先度を付ける。"
    enabled: true
  - id: test-minimal
    role: Minimal Tester
    description: "最小テスト担当。仮説をテストするために最小限の変更を行う。一度に一つの変数のみ変更する。"
    enabled: true
  - id: validator
    role: Hypothesis Validator
    description: "検証担当。テスト結果を確認し、仮説が正しいかを判断する。機能したらPhase 4へ、機能しなければ新しい仮説を形成する。"
    enabled: true
---

# Bug War Room - Phase 3: Hypothesis & Validation

## チームミッション

Bug War RoomのPhase 3（仮説検証）を担当。Phase 1/2の結果を元に、科学的アプローチで仮説を検証する。

**核心原則:** 一度に一つの変数。続行前に検証。

**前提:** Phase 1/2の調査・分析結果を受け取っていること。

**出力:** 検証結果は Phase 4（bug-war-room-p4）に引き継がれる。

## Input from Phase 1 & 2

以下の情報を前フェーズから受け取る：
- Phase 1: エラー分析、再現手順、根本原因候補
- Phase 2: 動作する例、参照実装、特定した違い

## Member Roles

### Hypothesis Former (hypothesis-former)

単一の仮説を形成する：
- 明確に述べる: 「Xが根本原因だと思われる。なぜならYだから」
- 書き留める
- 曖昧でなく具体的に
- 複数の仮説がある場合は優先度を付ける

### Minimal Tester (test-minimal)

最小限でテストする：
- 仮説をテストするために最小限の変更を行う
- 一度に一つの変数
- 一度に複数のことを修正しない

### Hypothesis Validator (validator)

続行前に検証する：
- 機能したか？ はい → Phase 4
- 機能しなかったか？ 新しい仮説を形成
- その上にさらに修正を追加しない
- わからない場合は「Xがわからない」と言う

## Output Format

```
SUMMARY: [仮説検証サマリー]
CLAIM: [仮説は正しいかどうかの結論]
EVIDENCE: [テスト結果]
CONFIDENCE: [0.00-1.00]
RESULT:
## 形成した仮説
- 仮説: 「Xが根本原因だと思われる。なぜならYだから」
- 優先度: [高/中/低]

## テスト内容
- 変更内容: [...]
- 変更した変数: [1つのみ]

## 検証結果
- [ ] 成功: 仮説が正しい
- [ ] 失敗: 新しい仮説が必要
- [ ] 不明: さらに調査が必要

## 次のアクション
- 成功の場合: Phase 4で実装
- 失敗の場合: 新しい仮説 [内容]
NEXT_STEP: [判定に基づく次のアクション]
```
