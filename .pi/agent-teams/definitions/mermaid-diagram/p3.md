---
id: mermaid-diagram-p3
name: Mermaid Diagram - Phase 3 Syntax
description: "Mermaid Diagram Phase 3: 構文検証フェーズ。作成されたMermaid図の構文正確性を検証し、レンダリングエラーを特定・修正する。結果はPhase 4（整合性確認）に引き継ぐ。"
enabled: enabled
strategy: parallel
triggers:
  - Phase 2完了後の作成図
skip_conditions:
  - Phase 2の作成図未受領（Phase 2に戻る）
members:
  - id: syntax-checker
    role: Syntax Checker
    description: "構文チェッカー。Mermaid構文の正確性を検証し、エラーを特定する。"
    enabled: true
  - id: render-validator
    role: Render Validator
    description: "レンダリング検証担当。図が正しくレンダリングされるかを確認し、問題を修正する。"
    enabled: true
---

# Mermaid Diagram - Phase 3: Syntax Validation

## チームミッション

Mermaid DiagramのPhase 3（構文検証）を担当。Phase 2（mermaid-diagram-p2）で作成された図の正確性を検証する。

**核心原則:** 構文的に正しい図のみを先に進める。

**鉄の掟:**
```
構文エラーのある図を承認しない
```

**前提:** Phase 2で作成された図を受け取っていること。

**出力:** 検証済みの図は Phase 4（mermaid-diagram-p4）に引き継がれる。

## When to Use

Phase 2完了後、必ず実施:
- Mermaid構文の正確性確認
- レンダリング検証

**スキップしてはならない:**
- 「目視で確認したから大丈夫」→ 目視は見落とす

## Output Format

```
SUMMARY: [構文検証サマリー]
CLAIM: [構文が正しいかどうか]
EVIDENCE: [検証結果]
CONFIDENCE: [0.00-1.00]
RESULT:
## 構文検証結果
- [ ] 構文エラーなし
- [ ] レンダリング成功

## 修正内容（ある場合）
- [修正1]
- [修正2]

## 修正後の図
```mermaid
[修正後のMermaidコード]
```
NEXT_STEP: Phase 4（mermaid-diagram-p4）で整合性確認
```

## 警告信号 - プロセスの遵守を促す

以下のような考えが浮かんだら、それはSTOPのサイン:
- 「目視で確認したから大丈夫」
- 「エラー処理は後で追加すればいい」
- 構文エラーを見逃している

**これらすべては: STOP。Phase 3を完了せよ。**

## 人間のパートナーの「やり方が間違っている」シグナル

**以下の方向転換に注意:**
- 「この図、レンダリングエラーがある」 - 構文の問題

**これらを見たら:** STOP。Phase 3を完了せよ。

## よくある言い訳

| 言い訳 | 現実 |
|--------|------|
| 「目視で確認」 | 目視は見落とす。体系的に検証する。 |
| 「エラー処理は後で」 | 後で追加は忘れる。最初から含める。 |
