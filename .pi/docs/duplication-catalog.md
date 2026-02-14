# 重複実装カタログ (Duplication Catalog)

作成日: 2026-02-13
作成者: Core Delivery Team - Reviewer
目的: Phase 1調査結果の統合と詳細な重複実装分析

---

## 概要

本カタログは.pi/extensions/および.pi/lib/ディレクトリ内のTypeScriptファイルにおける重複実装の詳細な分析結果を記載します。

### 重複実装の統計

- **完全一致**: 14種類の関数
- **類似実装**: 2種類の関数
- **影響ファイル数**: 10ファイル
- **合計重複箇所**: 38箇所

---

## 1. 完全一致の重複

### 1.1 toBoundedInteger

**ファイル**:
- `.pi/extensions/loop.ts:2448`
- `.pi/extensions/rsa.ts:879`

**実装コード**:
```typescript
function toBoundedInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
  field: string,
): { ok: true; value: number } | { ok: false; error: string } {
  const resolved = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(resolved) || !Number.isInteger(resolved)) {
    return { ok: false, error: `${field} must be an integer.` };
  }
  if (resolved < min || resolved > max) {
    return { ok: false, error: `${field} must be in [${min}, ${max}].` };
  }
  return { ok: true, value: resolved };
}
```

**使用箇所**:
- loop.ts: 4回使用 (857, 866, 875行)
- rsa.ts: 5回使用 (743, 752, 761, 770, 779行)

**影響範囲**: ループ設定、RSA集約設定のパラメータ検証

**統合計画**: `.pi/lib/validation.ts`に移動し、両ファイルからインポート

**優先度**: 中（影響範囲は限定的だが、2つの主要拡張機能で使用）

---

### 1.2 toErrorMessage

**ファイル**:
- `.pi/extensions/agent-teams.ts:5340`
- `.pi/extensions/loop.ts:2477`
- `.pi/extensions/rsa.ts:1500`
- `.pi/extensions/subagents.ts:3087`

**実装コード**:
```typescript
function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
```

**影響範囲**: 全ての主要拡張機能でエラーハンドリングに使用

**統合計画**: `.pi/lib/error-utils.ts`に移動し、全ての拡張機能からインポート

**優先度**: 高（4ファイルで使用される基礎ユーティリティ）

---

### 1.3 looksLikeMarkdown

**ファイル**:
- `.pi/extensions/agent-teams.ts:289`
- `.pi/extensions/subagents.ts:225`

**実装コード**:
```typescript
function looksLikeMarkdown(input: string): boolean {
  const text = input.trim();
  if (!text) return false;
  if (/^#{1,6}\s+/m.test(text)) return true;
  if (/^\s*[-*+]\s+/m.test(text)) return true;
  if (/^\s*\d+\.\s+/m.test(text)) return true;
  if (/```/.test(text)) return true;
  if (/\[[^\]]+\]\([^)]+\)/.test(text)) return true;
  if (/^\s*>\s+/m.test(text)) return true;
  if (/^\s*\|.+\|\s*$/m.test(text)) return true;
  if (/\*\*[^*]+\*\*/.test(text)) return true;
  if (/`[^`]+`/.test(text)) return true;
  return false;
}
```

**影響範囲**: Markdownプレビュー機能

**統合計画**: `.pi/lib/markdown-utils.ts`に移動

**優先度**: 中（renderPreviewWithMarkdownとセットで統合推奨）

---

### 1.4 renderPreviewWithMarkdown

**ファイル**:
- `.pi/extensions/agent-teams.ts:304`
- `.pi/extensions/subagents.ts:240`

**実装コード**:
```typescript
function renderPreviewWithMarkdown(
  text: string,
  width: number,
  maxLines: number,
): { lines: string[]; renderedAsMarkdown: boolean } {
  if (!text.trim()) {
    return { lines: [], renderedAsMarkdown: false };
  }

  if (!looksLikeMarkdown(text)) {
    return { lines: toTailLines(text, maxLines), renderedAsMarkdown: false };
  }

  try {
    const markdown = new Markdown(text, 0, 0, getMarkdownTheme());
    const rendered = markdown.render(Math.max(LIVE_MARKDOWN_PREVIEW_MIN_WIDTH, width));
    if (rendered.length === 0) {
      return { lines: toTailLines(text, maxLines), renderedAsMarkdown: false };
    }
    if (rendered.length <= maxLines) {
      return { lines: rendered, renderedAsMarkdown: true };
    }
    return { lines: rendered.slice(rendered.length - maxLines), renderedAsMarkdown: true };
  } catch {
    return { lines: toTailLines(text, maxLines), renderedAsMarkdown: false };
  }
}
```

**依存**: looksLikeMarkdown, toTailLines, getMarkdownTheme, Markdown

**統合計画**: `.pi/lib/markdown-utils.ts`に移動（looksLikeMarkdownと共に）

**優先度**: 中

---

### 1.5 appendTail

**ファイル**:
- `.pi/extensions/agent-teams.ts:248`
- `.pi/extensions/subagents.ts:184`

**実装コード**:
```typescript
function appendTail(current: string, chunk: string, maxLength = LIVE_TAIL_LIMIT): string {
  if (!chunk) return current;
  const next = `${current}${chunk}`;
  if (next.length <= maxLength) return next;
  return next.slice(next.length - maxLength);
}
```

**定数依存**: LIVE_TAIL_LIMIT（各ファイルで別途定義）

**統合計画**: `.pi/lib/tail-utils.ts`に移動

**優先度**: 中

---

### 1.6 countOccurrences

**ファイル**:
- `.pi/extensions/agent-teams.ts:256`
- `.pi/extensions/subagents.ts:192`

**実装コード**:
```typescript
function countOccurrences(input: string, target: string): number {
  if (!input || !target) return 0;
  let count = 0;
  let index = 0;
  while (index < input.length) {
    const found = input.indexOf(target, index);
    if (found < 0) break;
    count += 1;
    index = found + target.length;
  }
  return count;
}
```

**統合計画**: `.pi/lib/string-utils.ts`に移動

**優先度**: 低

---

### 1.7 estimateLineCount

**ファイル**:
- `.pi/extensions/agent-teams.ts:284`
- `.pi/extensions/subagents.ts:220`

**実装コード**:
```typescript
function estimateLineCount(bytes: number, newlineCount: number, endsWithNewline: boolean): number {
  if (bytes <= 0) return 0;
  return newlineCount + (endsWithNewline ? 0 : 1);
}
```

**統合計画**: `.pi/lib/string-utils`に移動（countOccurrencesと共に）

**優先度**: 低

---

### 1.8 ensureDir

**ファイル**:
- `.pi/extensions/agent-teams.ts:1819`
- `.pi/extensions/agent-usage-tracker.ts:135`
- `.pi/extensions/subagents.ts:1300`

**実装コード**:
```typescript
function ensureDir(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}
```

**依存**: existsSync, mkdirSync（node:fs）

**統合計画**: `.pi/lib/storage-lock.ts`に追加（既存のファイル操作ユーティリティ群と統合）

**優先度**: 中（3ファイルで使用される基礎ユーティリティ）

---

### 1.9 formatDuration

**ファイル**:
- `.pi/extensions/loop.ts:2465`
- `.pi/extensions/rsa.ts:1483`

**実装コード**:
```typescript
function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0ms";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}
```

**統合計画**: `.pi/lib/format-utils.ts`に移動

**優先度**: 中

---

### 1.10 formatDurationMs

**ファイル**:
- `.pi/extensions/agent-teams.ts:343`
- `.pi/extensions/subagents.ts:277`

**実装コード**:
```typescript
function formatDurationMs(item: TeamLiveItem): string {
  if (!item.startedAtMs) return "-";
  const endMs = item.finishedAtMs ?? Date.now();
  const durationMs = Math.max(0, endMs - item.startedAtMs);
  return `${(durationMs / 1000).toFixed(1)}s`;
}
```

**注意**: `TeamLiveItem`はagent-teams.ts、`SubagentLiveItem`はsubagents.tsの型。型は異なるが構造は同じ。

**統合計画**: `.pi/lib/format-utils.ts`に移動（formatDurationと共に）

**優先度**: 中

---

### 1.11 classifyPressureError

**ファイル**:
- `.pi/extensions/agent-teams.ts:1000`
- `.pi/extensions/subagents.ts:730`

**実装コード**:
```typescript
function classifyPressureError(error: unknown): "rate_limit" | "timeout" | "capacity" | "other" {
  const message = toErrorMessage(error).toLowerCase();
  if (message.includes("runtime limit reached") || message.includes("capacity")) return "capacity";
  if (message.includes("timed out") || message.includes("timeout")) return "timeout";
  const statusCode = extractStatusCodeFromMessage(error);
  if (statusCode === 429 || message.includes("rate limit") || message.includes("too many requests")) {
    return "rate_limit";
  }
  return "other";
}
```

**依存**: toErrorMessage, extractStatusCodeFromMessage

**統合計画**: `.pi/lib/error-utils.ts`に移動（toErrorMessageと共に）

**優先度**: 中

---

### 1.12 isCancelledErrorMessage

**ファイル**:
- `.pi/extensions/agent-teams.ts:1011`
- `.pi/extensions/subagents.ts:741`

**実装コード**:
```typescript
function isCancelledErrorMessage(error: unknown): boolean {
  const message = toErrorMessage(error).toLowerCase();
  return (
    message.includes("aborted") ||
    message.includes("cancelled") ||
    message.includes("canceled") ||
    message.includes("中断") ||
    message.includes("キャンセル")
  );
}
```

**依存**: toErrorMessage

**統合計画**: `.pi/lib/error-utils.ts`に移動

**優先度**: 低

---

### 1.13 isTimeoutErrorMessage

**ファイル**:
- `.pi/extensions/agent-teams.ts:1022`
- `.pi/extensions/subagents.ts:752`

**実装コード**:
```typescript
function isTimeoutErrorMessage(error: unknown): boolean {
  const message = toErrorMessage(error).toLowerCase();
  return (
    message.includes("timed out") ||
    message.includes("timeout") ||
    message.includes("time out") ||
    message.includes("時間切れ")
  );
}
```

**依存**: toErrorMessage

**統合計画**: `.pi/lib/error-utils.ts`に移動

**優先度**: 低

---

### 1.14 extractStatusCodeFromMessage

**ファイル**:
- `.pi/extensions/agent-teams.ts:992`
- `.pi/extensions/subagents.ts:722`

**実装コード**:
```typescript
function extractStatusCodeFromMessage(error: unknown): number | undefined {
  const message = toErrorMessage(error);
  const codeMatch = message.match(/\b(429|5\d{2})\b/);
  if (!codeMatch) return undefined;
  const code = Number(codeMatch[1]);
  return Number.isFinite(code) ? code : undefined;
}
```

**依存**: toErrorMessage

**統合計画**: `.pi/lib/error-utils.ts`に移動

**優先度**: 中（classifyPressureErrorの依存）

---

## 2. 類似実装

### 2.1 toTailLines

**ファイル**:
- `.pi/extensions/agent-teams.ts:332`
- `.pi/extensions/subagents.ts:268`

**実装コード**:

agent-teams.ts:
```typescript
function toTailLines(tail: string, limit: number): string[] {
  const lines = tail
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+$/g, ""));
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  if (lines.length <= limit) return lines;
  return lines.slice(lines.length - limit);
}
```

subagents.ts:
```typescript
function toTailLines(tail: string, limit: number): string[] {
  const lines = tail
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);
  if (lines.length <= limit) return lines;
  return lines.slice(lines.length - limit);
}
```

**差異**:
- agent-teams.ts: 末尾の空白を削除後、空文字列を1つだけ削除
- subagents.ts: 末尾の空白を削除後、**すべての空行を削除**（filter(Boolean)）

**影響**:
- agent-teams.ts: 最後の空行を維持する可能性がある
- subagents.ts: 全ての空行を削除

**依存**: renderPreviewWithMarkdownで使用

**統合計画**: 統一された動作を決定する必要がある。
- オプションA: agent-teams.ts版を採用（空行を維持）
- オプションB: subagents.ts版を採用（空行を削除）
- オプションC: オプションパラメータを追加して制御可能にする

**推奨**: オプションC（下位互換性を考慮）

**優先度**: 高（挙動の違いにより予期せぬバグの可能性）

---

### 2.2 toFiniteNumber

**ファイル**:
- `.pi/extensions/agent-usage-tracker.ts:437`
- `.pi/extensions/context-usage-dashboard.ts:72`
- `.pi/lib/retry-with-backoff.ts:82`

**実装コード**:

agent-usage-tracker.ts:
```typescript
function toFiniteNumber(value: unknown): number | undefined {
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return n;
}
```

retry-with-backoff.ts:
```typescript
function toFiniteNumber(value: unknown): number | undefined {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}
```

context-usage-dashboard.ts:
```typescript
function toFiniteNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return 0;
}
```

**差異**:
- agent-usage-tracker.ts / retry-with-backoff.ts: 戻り値 `number | undefined`、無効な値は`undefined`
- context-usage-dashboard.ts: 戻り値 `number`、無効な値は`0`

**型チェック**:
- agent-usage-tracker.ts: Number()で型変換
- retry-with-backoff.ts: Number()で型変換
- context-usage-dashboard.ts: typeof value === "number" で事前チェック

**統合計画**:
- ユースケースに応じて2つのバージョンを提供
- `toFiniteNumber(value: unknown): number | undefined` - 戻り値が無効の場合はundefined
- `toFiniteNumberOrZero(value: unknown): number` - 戻り値が無効の場合は0

**優先度**: 高（戻り値の型の違いにより型エラーの可能性）

---

## 3. 影響範囲の分析

### 3.1 ファイル別影響度

| ファイル | 重複関数数 | 影響度 |
|---------|-----------|--------|
| agent-teams.ts | 11 | 高 |
| subagents.ts | 10 | 高 |
| loop.ts | 3 | 中 |
| rsa.ts | 3 | 中 |
| agent-usage-tracker.ts | 2 | 中 |
| context-usage-dashboard.ts | 1 | 低 |
| retry-with-backoff.ts | 1 | 低 |

### 3.2 関連性の分析

**密接に関連する関数グループ**:
1. **Markdown処理**: looksLikeMarkdown, renderPreviewWithMarkdown, toTailLines
2. **エラー処理**: toErrorMessage, classifyPressureError, isCancelledErrorMessage, isTimeoutErrorMessage, extractStatusCodeFromMessage
3. **フォーマット**: formatDuration, formatDurationMs
4. **ストレージ**: ensureDir
5. **バリデーション**: toBoundedInteger, toFiniteNumber
6. **テキスト処理**: appendTail, countOccurrences, estimateLineCount

---

## 4. 統合計画の提案

### 4.1 新規ユーティリティファイルの構造

```
.pi/lib/
├── error-utils.ts          (エラー処理ユーティリティ)
│   ├── toErrorMessage
│   ├── classifyPressureError
│   ├── isCancelledErrorMessage
│   ├── isTimeoutErrorMessage
│   └── extractStatusCodeFromMessage
├── markdown-utils.ts       (Markdown処理ユーティリティ)
│   ├── looksLikeMarkdown
│   ├── renderPreviewWithMarkdown
│   └── toTailLines
├── format-utils.ts         (フォーマットユーティリティ)
│   ├── formatDuration
│   └── formatDurationMs
├── string-utils.ts         (文字列処理ユーティリティ)
│   ├── countOccurrences
│   └── estimateLineCount
├── storage-utils.ts        (ストレージユーティリティ)
│   └── ensureDir (storage-lock.tsに追加)
├── validation-utils.ts     (バリデーションユーティリティ)
│   ├── toBoundedInteger
│   └── toFiniteNumber
│   └── toFiniteNumberOrZero
└── tail-utils.ts           (テール処理ユーティリティ)
    └── appendTail
```

### 4.2 実装ステップ

**Phase 2: 実装設計**
1. ユーティリティファイルの作成
2. 関数の移動とエクポート
3. 既存ファイルからのインポートに書き換え
4. テストの作成

**Phase 3: 品質レビュー**
1. 型チェック
2. 機能テスト
3. レビューと承認

### 4.3 優先順位

| 優先度 | 関数 | 理由 |
|-------|------|------|
| 高 | toErrorMessage | 4ファイルで使用される基礎ユーティリティ |
| 高 | toTailLines | 挙動の違いにより予期せぬバグの可能性 |
| 高 | toFiniteNumber | 戻り値の型の違いにより型エラーの可能性 |
| 中 | ensureDir | 3ファイルで使用される |
| 中 | toBoundedInteger | 2つの主要拡張機能で使用 |
| 中 | formatDuration, formatDurationMs | 2つのファイルで使用 |
| 中 | looksLikeMarkdown, renderPreviewWithMarkdown | 関連する関数のセットで統合推奨 |
| 中 | classifyPressureError, extractStatusCodeFromMessage | エラー処理関連のセット |
| 低 | appendTail | 影響範囲が限定的 |
| 低 | countOccurrences, estimateLineCount | 影響範囲が限定的 |
| 低 | isCancelledErrorMessage, isTimeoutErrorMessage | 影響範囲が限定的 |

---

## 5. リスク評価

### 5.1 統合によるリスク

| リスク | 説明 | 緩和策 |
|-------|------|--------|
| 破壊的変更 | 既存コードの動作が変わる可能性 | 包括的なテストカバレッジ |
| 循環依存 | ファイル間の依存関係が複雑になる | 依存関係の慎重な設計 |
| 型エラー | toFiniteNumberの型の違い | 型別の関数を提供 |
| 挙動の違い | toTailLinesの空行処理の違い | オプションパラメータを追加 |

### 5.2 統合しない場合のリスク

| リスク | 説明 |
|-------|------|
| メンテナンス性の低下 | バグ修正時に全ての重複箇所を修正する必要がある |
| 不整合の発生 | ファイルごとに微妙な実装の違いが生じる可能性 |
| コードの肥大化 | 同じコードが複数箇所に存在する |

---

## 6. 推奨事項

1. **toTailLinesの挙動を統一する**
   - 空行削除の挙動をオプションで制御可能にする
   - デフォルト値は慎重に決定する

2. **toFiniteNumberの型を明確にする**
   - `toFiniteNumber(value: unknown): number | undefined`
   - `toFiniteNumberOrZero(value: unknown): number`
   - の2つの関数を提供する

3. **関連する関数をまとめて移動する**
   - Markdown関連の関数はセットで移動
   - エラー処理関連の関数はセットで移動
   - フォーマット関連の関数はセットで移動

4. **包括的なテストを用意する**
   - 各ユーティリティ関数の単体テスト
   - 統合後の挙動を検証する統合テスト

5. **段階的な統合を実施する**
   - 高優先度の関数から順に統合
   - 各フェーズで動作検証を実施

---

## 7. まとめ

本カタログでは、14種類の完全一致の重複実装と2種類の類似実装を特定し、詳細な分析を行いました。特に以下の点が重要です：

1. **toTailLines**: 空行処理のロジックに違いがあり、予期せぬバグの可能性がある
2. **toFiniteNumber**: 戻り値の型に違いがあり、型エラーの可能性がある
3. **toErrorMessage**: 4ファイルで使用される基礎ユーティリティであり、最も優先度が高い

これらの重複実装を統合することで、コードのメンテナンス性を向上させ、バグのリスクを低減することができます。

---

## 8. 次のステップ

1. Phase 2で統合実装を開始する
2. 高優先度の関数から順に統合を進める
3. 各ユーティリティファイルの実装とテストを作成する
4. 既存ファイルからのインポートに書き換える
5. 品質レビューを実施する
