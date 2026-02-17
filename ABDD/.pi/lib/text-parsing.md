---
title: Text Parsing
category: reference
audience: developer
last_updated: 2026-02-18
tags: [parsing, text, structured-output]
related: [judge, output-schema, output-validation]
---

# Text Parsing

構造化出力処理用の共有テキストパースユーティリティ。

## 概要

モジュール間の循環依存を避けるために抽出されたユーティリティ。

## Number Utilities

### clampConfidence()

信頼度値を有効範囲 [0, 1] にクランプ。無効な値はデフォルト0.5（中立）。

```typescript
function clampConfidence(value: number): number
```

### parseUnitInterval()

文字列から単位区間値をパース。小数（0.5）とパーセント（50%）形式の両方を処理。

```typescript
function parseUnitInterval(raw: string | undefined): number | undefined
```

## ID Generation Utilities

### generateClaimId()

構造化コミュニケーション追跡用の一意なクレームIDを生成。

フォーマット: `claim-<timestamp>-<random>`

```typescript
function generateClaimId(): string
```

### generateEvidenceId()

構造化コミュニケーション追跡用の一意な証拠IDを生成。

フォーマット: `evidence-<timestamp>-<random>`

```typescript
function generateEvidenceId(): string
```

## Text Extraction Utilities

### extractField()

構造化出力テキストから名前付きフィールドを抽出。大文字小文字を区別しない "FIELD_NAME: value" パターンにマッチ。

```typescript
function extractField(output: string, name: string): string | undefined
```

### extractMultilineField()

名前付きフィールドの複数行を抽出。フィールドラベルから次のメジャーラベルまでのコンテンツを返す。

```typescript
function extractMultilineField(output: string, name: string): string
```

## Text Analysis Utilities

### countKeywordSignals()

出力テキスト内にキーワードがいくつ出現するかをカウント。メンバー出力のシグナル検出に使用。

```typescript
function countKeywordSignals(output: string, keywords: string[]): number
```

## Discussion Analysis Utilities

### DiscussionStance

ディスカッション分析用のスタンスタイプ。output-schema.tsのStanceClassificationModeの動作に一致。

```typescript
type DiscussionStance = "agree" | "disagree" | "neutral" | "partial";
```

### DiscussionStanceResult

ディスカッションスタンス分析の結果。

```typescript
interface DiscussionStanceResult {
  stance: DiscussionStance;
  confidence: number;
  evidence: string[];
}
```

### STANCE_PATTERNS

ディスカッションテキストのスタンス検出用正規表現パターン。日本語と英語の表現をサポート。

```typescript
const STANCE_PATTERNS: Record<DiscussionStance, RegExp[]>
```

### analyzeDiscussionStance()

ターゲットメンバーに対するディスカッションスタンスを分析。

```typescript
function analyzeDiscussionStance(
  text: string,
  targetMemberId: string
): DiscussionStanceResult
```

**パラメータ:**
- `text` - 分析するディスカッションテキスト
- `targetMemberId` - コンテキストを探すメンバーID

**戻り値:** スタンス分析結果（信頼度と証拠付き）

### extractConsensusMarker()

ディスカッションテキストからコンセンサスマーカーを抽出。"合意:" または "Consensus:" で始まる行を探す。

```typescript
function extractConsensusMarker(text: string): string | undefined
```

## 使用例

```typescript
// 信頼度のクランプ
const confidence = clampConfidence(1.5); // 1.0

// フィールドの抽出
const output = "CLAIM: Test\nCONFIDENCE: 0.85\nRESULT: Done";
const claim = extractField(output, "CLAIM"); // "Test"

// ディスカッションスタンスの分析
const result = analyzeDiscussionStance(
  "agent-1の意見に同意します。正しい分析だと思います。",
  "agent-1"
);
// { stance: "agree", confidence: 0.X, evidence: ["同意", "正しい"] }

// コンセンサスの抽出
const consensus = extractConsensusMarker(
  "議論の結果:\n合意: API設計を採用する"
);
// "API設計を採用する"
```

## 関連ファイル

- `.pi/lib/judge.ts` - ジャッジ機能
- `.pi/lib/output-schema.ts` - 出力スキーマ
- `.pi/lib/output-validation.ts` - 出力バリデーション
