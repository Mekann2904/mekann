# 重複実装カタログ (Duplicate Implementation Catalog)

作成日: 2026-02-13
作成者: Core Delivery Team - Implementer (build)
Phase: 1（徹底調査）

---

## 概要 (Summary)

本カタログは、`.pi/extensions/` および `.pi/lib/` ディレクトリ内の重複実装を徹底的に調査・分類したものです。調査により、11種類の完全一致重複と5種類の類似実装を特定しました。

### 統計サマリー

- **完全一致の重複**: 11種類
- **類似実装**: 5種類
- **影響を受けるファイル**: 12ファイル
- **推定重複コード行数**: 約250-300行
- **統合による削減可能行数**: 約150-200行

---

## 1. 完全一致の重複実装 (Exact Duplicates)

### 1.1 toBoundedInteger - 整数値のバリデーションと範囲制限

**場所**:
- `.pi/extensions/loop.ts:2448-2463`
- `.pi/extensions/rsa.ts:879-894`

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

**重複の程度**: 完全一致
**重複の原因**: コピーペーストによる実装
**影響範囲**:
- loop.ts: ループ構成パラメータのバリデーション（maxIterationsなど）
- rsa.ts: RSA実行パラメータのバリデーション（parallelismなど）
**推奨移動先**: `.pi/lib/validation.ts` (新規作成)
**優先度**: 低（特定用途のみ）

---

### 1.2 toErrorMessage - エラーからメッセージ文字列を抽出

**場所**:
- `.pi/extensions/agent-teams.ts:5340-5344`
- `.pi/extensions/loop.ts:2477-2481`
- `.pi/extensions/rsa.ts:1500-1504`
- `.pi/extensions/subagents.ts:3087-3091`

**実装コード**:
```typescript
function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
```

**重複の程度**: 完全一致（4ファイル）
**重複の原因**: コピーペーストによる実装
**影響範囲**:
- agent-teams.ts: チーム実行のエラーメッセージ化
- loop.ts: ループ実行のエラーメッセージ化
- rsa.ts: RSA実行のエラーメッセージ化
- subagents.ts: サブエージェント実行のエラーメッセージ化
**推奨移動先**: `.pi/lib/error-utils.ts` (新規作成)
**優先度**: 高（最も影響範囲が広い）

---

### 1.3 looksLikeMarkdown - マークダウン形式の判定

**場所**:
- `.pi/extensions/agent-teams.ts:289-302`
- `.pi/extensions/subagents.ts:225-238`

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

**重複の程度**: 完全一致
**重複の原因**: コピーペーストによる実装
**影響範囲**:
- agent-teams.ts: チームメンバー出力のプレビュー表示
- subagents.ts: サブエージェント出力のプレビュー表示
**推奨移動先**: `.pi/lib/markdown-utils.ts` (新規作成)
**優先度**: 高（renderPreviewWithMarkdownと密接関連）

---

### 1.4 renderPreviewWithMarkdown - マークダウンレンダリング

**場所**:
- `.pi/extensions/agent-teams.ts:304-325`
- `.pi/extensions/subagents.ts:240-261`

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

**重複の程度**: 完全一致
**重複の原因**: コピーペーストによる実装
**影響範囲**:
- agent-teams.ts: チーム実行のライブモニター詳細表示
- subagents.ts: サブエージェント実行のライブモニター詳細表示
**推奨移動先**: `.pi/lib/tui-markdown.ts` (新規作成)
**優先度**: 高（looksLikeMarkdownと密接関連）

---

### 1.5 appendTail - 文字列末尾への追加と長さ制限

**場所**:
- `.pi/extensions/agent-teams.ts:248-255`
- `.pi/extensions/subagents.ts:184-191`

**実装コード**:
```typescript
function appendTail(current: string, chunk: string, maxLength = LIVE_TAIL_LIMIT): string {
  if (!chunk) return current;
  const next = `${current}${chunk}`;
  if (next.length <= maxLength) return next;
  return next.slice(next.length - maxLength);
}
```

**重複の程度**: 完全一致
**重複の原因**: コピーペーストによる実装
**影響範囲**:
- agent-teams.ts: チーム実行のストリーム出力蓄積
- subagents.ts: サブエージェント実行のストリーム出力蓄積
**推奨移動先**: `.pi/lib/string-utils.ts` (新規作成)
**優先度**: 中

---

### 1.6 countOccurrences - 文字列内の出現回数カウント

**場所**:
- `.pi/extensions/agent-teams.ts:255-267`
- `.pi/extensions/subagents.ts:191-203`

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

**重複の程度**: 完全一致
**重複の原因**: コピーペーストによる実装
**影響範囲**:
- agent-teams.ts: 改行文字のカウント
- subagents.ts: 改行文字のカウント
**推奨移動先**: `.pi/lib/string-utils.ts` (新規作成)
**優先度**: 中

---

### 1.7 estimateLineCount - バイト数と改行数からの推定

**場所**:
- `.pi/extensions/agent-teams.ts:284-289`
- `.pi/extensions/subagents.ts:220-225`

**実装コード**:
```typescript
function estimateLineCount(bytes: number, newlineCount: number, endsWithNewline: boolean): number {
  if (bytes <= 0) return 0;
  return newlineCount + (endsWithNewline ? 0 : 1);
}
```

**重複の程度**: 完全一致
**重複の原因**: コピーペーストによる実装
**影響範囲**:
- agent-teams.ts: 出力行数の推定
- subagents.ts: 出力行数の推定
**推奨移動先**: `.pi/lib/tui-utils.ts` (新規作成)
**優先度**: 中

---

### 1.8 ensureDir - ディレクトリの作成

**場所**:
- `.pi/extensions/agent-teams.ts:1819-1824`
- `.pi/extensions/agent-usage-tracker.ts:135-140`
- `.pi/extensions/subagents.ts:1300-1305`

**実装コード**:
```typescript
function ensureDir(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}
```

**重複の程度**: 完全一致（3ファイル）
**重複の原因**: コピーペーストによる実装
**影響範囲**:
- agent-teams.ts: チーム実行履歴のディレクトリ作成
- agent-usage-tracker.ts: 使用状況追跡のディレクトリ作成
- subagents.ts: サブエージェント実行履歴のディレクトリ作成
**推奨移動先**: `.pi/lib/file-utils.ts` (新規作成)
**優先度**: 高（使用箇所が多い）

---

### 1.9 formatDuration - ミリ秒をフォーマット

**場所**:
- `.pi/extensions/loop.ts:2465-2470`
- `.pi/extensions/rsa.ts:1483-1488`

**実装コード**:
```typescript
function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0ms";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}
```

**重複の程度**: 完全一致
**重複の原因**: コピーペーストによる実装
**影響範囲**:
- loop.ts: ループ実行時間の表示
- rsa.ts: RSA実行時間の表示
**推奨移動先**: `.pi/lib/format-utils.ts` (新規作成)
**優先度**: 低

---

### 1.10 formatDurationMs - LiveItemからの経過時間フォーマット

**場所**:
- `.pi/extensions/agent-teams.ts:343-349`
- `.pi/extensions/subagents.ts:277-283`

**実装コード**:

agent-teams.ts:
```typescript
function formatDurationMs(item: TeamLiveItem): string {
  if (!item.startedAtMs) return "-";
  const endMs = item.finishedAtMs ?? Date.now();
  const durationMs = Math.max(0, endMs - item.startedAtMs);
  return `${(durationMs / 1000).toFixed(1)}s`;
}
```

subagents.ts:
```typescript
function formatDurationMs(item: SubagentLiveItem): string {
  if (!item.startedAtMs) return "-";
  const endMs = item.finishedAtMs ?? Date.now();
  const durationMs = Math.max(0, endMs - item.startedAtMs);
  const seconds = durationMs / 1000;
  return `${seconds.toFixed(1)}s`;
}
```

**重複の程度**: 本質的に同一（中間変数 `seconds` の有無のみ異なる）
**重複の原因**: コピーペーストによる実装（変数名を変更）
**影響範囲**:
- agent-teams.ts: チームメンバーの実行時間表示
- subagents.ts: サブエージェントの実行時間表示
**推奨移動先**: `.pi/lib/format-utils.ts` (新規作成)
**優先度**: 中

---

### 1.11 toFiniteNumber - 数値の有限性チェック

**場所**:
- `.pi/extensions/agent-usage-tracker.ts:437-440`
- `.pi/lib/retry-with-backoff.ts:82-85`
- `.pi/extensions/context-usage-dashboard.ts:72-75`

**実装コード**:

agent-usage-tracker.ts / retry-with-backoff.ts:
```typescript
function toFiniteNumber(value: unknown): number | undefined {
  const n = Number(value);  // retry-with-backoff.tsでは変数名が `numeric`
  if (!Number.isFinite(n)) return undefined;
  return n;
}
```

context-usage-dashboard.ts:
```typescript
function toFiniteNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return 0;
}
```

**重複の程度**: ロジック類似だが挙動が異なる
- agent-usage-tracker.ts/retry-with-backoff.ts: `number | undefined` 返却
- context-usage-dashboard.ts: `number` 返却、フォールバック値0
- retry-with-backoff.ts: 変数名が `numeric` で異なる

**重複の原因**: 独立実装（異なる用途で同様のユーティリティが必要）
**影響範囲**:
- agent-usage-tracker.ts: コンテキスト使用量の解析
- context-usage-dashboard.ts: コンテキスト使用量の表示
- retry-with-backoff.ts: リトライ設定のサニタイズ
**推奨移動先**: `.pi/lib/number-utils.ts` (新規作成)
**推奨アクション**: 統一された `number | undefined` 版本を採用
**優先度**: 中

---

## 2. 類似実装 (Similar Implementations)

### 2.1 toTailLines - 文字列を行に分割して制限

**場所**:
- `.pi/extensions/agent-teams.ts:332-340`
- `.pi/extensions/subagents.ts:268-276`

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

**重複の程度**: 部分的同一
- 共通部分: split、sliceのロジック
- 差異点:
  - agent-teams.ts: `replace(/\s+$/g, "")` で末尾の空白を削除し、明示的に空行をpopで削除
  - subagents.ts: `trimEnd()` を使用し、`.filter(Boolean)` で空行をフィルタ
- subagents.ts の実装がより簡潔で一貫性がある

**重複の原因**: 独立実装（異なるアプローチで同じ目的）
**影響範囲**:
- agent-teams.ts: チームメンバー出力の表示
- subagents.ts: サブエージェント出力の表示
**推奨移動先**: `.pi/lib/tui-utils.ts` (新規作成)
**推奨アクション**: subagents.tsの `.filter(Boolean)` アプローチを統合
**優先度**: 中

---

### 2.2 classifyPressureError - 圧力エラーの分類

**場所**:
- `.pi/extensions/agent-teams.ts:1000-1010`
- `.pi/extensions/subagents.ts:730-740`

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

**重複の程度**: 完全一致
**重複の原因**: コピーペーストによる実装
**影響範囲**:
- agent-teams.ts: チーム実行のエラー分類
- subagents.ts: サブエージェント実行のエラー分類
**推奨移動先**: `.pi/lib/error-utils.ts` (新規作成)
**優先度**: 中

---

### 2.3 isCancelledErrorMessage - キャンセルエラーの判定

**場所**:
- `.pi/extensions/agent-teams.ts:1011-1019`
- `.pi/extensions/subagents.ts:741-749`

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

**重複の程度**: 完全一致
**重複の原因**: コピーペーストによる実装
**影響範囲**:
- agent-teams.ts: チーム実行のキャンセル判定
- subagents.ts: サブエージェント実行のキャンセル判定
**推奨移動先**: `.pi/lib/error-utils.ts` (新規作成)
**優先度**: 中

---

### 2.4 isTimeoutErrorMessage - タイムアウトエラーの判定

**場所**:
- `.pi/extensions/agent-teams.ts:1022-1030`
- `.pi/extensions/subagents.ts:752-760`

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

**重複の程度**: 完全一致
**重複の原因**: コピーペーストによる実装
**影響範囲**:
- agent-teams.ts: チーム実行のタイムアウト判定
- subagents.ts: サブエージェント実行のタイムアウト判定
**推奨移動先**: `.pi/lib/error-utils.ts` (新規作成)
**優先度**: 中

---

### 2.5 extractStatusCodeFromMessage - エラーメッセージからステータスコードを抽出

**場所**:
- `.pi/extensions/agent-teams.ts:992-999`
- `.pi/extensions/subagents.ts:722-729`

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

**重複の程度**: 完全一致
**重複の原因**: コピーペーストによる実装
**影響範囲**:
- agent-teams.ts: チーム実行のエラーからHTTPステータスコードを抽出
- subagents.ts: サブエージェント実行のエラーからHTTPステータスコードを抽出
**推奨移動先**: `.pi/lib/error-utils.ts` (新規作成)
**優先度**: 中

---

## 3. 影響範囲の分析

### 3.1 ファイル別の重複関数使用状況

| ファイル | 重複関数数 | 主な重複関数 |
|---------|-----------|-------------|
| agent-teams.ts | 10 | toErrorMessage, looksLikeMarkdown, renderPreviewWithMarkdown, appendTail, countOccurrences, estimateLineCount, ensureDir, formatDurationMs, toTailLines, classifyPressureError, isCancelledErrorMessage, isTimeoutErrorMessage, extractStatusCodeFromMessage |
| subagents.ts | 10 | toErrorMessage, looksLikeMarkdown, renderPreviewWithMarkdown, appendTail, countOccurrences, estimateLineCount, ensureDir, formatDurationMs, toTailLines, classifyPressureError, isCancelledErrorMessage, isTimeoutErrorMessage, extractStatusCodeFromMessage |
| loop.ts | 2 | toBoundedInteger, toErrorMessage, formatDuration |
| rsa.ts | 2 | toBoundedInteger, toErrorMessage, formatDuration |
| agent-usage-tracker.ts | 2 | ensureDir, toFiniteNumber |
| context-usage-dashboard.ts | 1 | toFiniteNumber |
| retry-with-backoff.ts | 1 | toFiniteNumber |

### 3.2 機能カテゴリ別の重複

| カテゴリ | 関数数 | 重複関数 |
|---------|-------|---------|
| エラーハンドリング | 5 | toErrorMessage, classifyPressureError, isCancelledErrorMessage, isTimeoutErrorMessage, extractStatusCodeFromMessage |
| TUI/Markdown | 3 | looksLikeMarkdown, renderPreviewWithMarkdown, toTailLines |
| 文字列操作 | 2 | appendTail, countOccurrences |
| バリデーション | 2 | toBoundedInteger, toFiniteNumber |
| ファイル操作 | 1 | ensureDir |
| フォーマット | 2 | formatDuration, formatDurationMs |
| その他 | 1 | estimateLineCount |

---

## 4. 統合計画の提案

### 4.1 新規共有ユーティリティモジュールの作成

`.pi/lib/` に以下の新しいモジュールを作成することを推奨:

#### 1. `.pi/lib/error-utils.ts` (高優先度)
```typescript
export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function extractStatusCodeFromMessage(error: unknown): number | undefined {
  const message = toErrorMessage(error);
  const codeMatch = message.match(/\b(429|5\d{2})\b/);
  if (!codeMatch) return undefined;
  const code = Number(codeMatch[1]);
  return Number.isFinite(code) ? code : undefined;
}

export function classifyPressureError(error: unknown): "rate_limit" | "timeout" | "capacity" | "other" {
  const message = toErrorMessage(error).toLowerCase();
  if (message.includes("runtime limit reached") || message.includes("capacity")) return "capacity";
  if (message.includes("timed out") || message.includes("timeout")) return "timeout";
  const statusCode = extractStatusCodeFromMessage(error);
  if (statusCode === 429 || message.includes("rate limit") || message.includes("too many requests")) {
    return "rate_limit";
  }
  return "other";
}

export function isCancelledErrorMessage(error: unknown): boolean {
  const message = toErrorMessage(error).toLowerCase();
  return (
    message.includes("aborted") ||
    message.includes("cancelled") ||
    message.includes("canceled") ||
    message.includes("中断") ||
    message.includes("キャンセル")
  );
}

export function isTimeoutErrorMessage(error: unknown): boolean {
  const message = toErrorMessage(error).toLowerCase();
  return (
    message.includes("timed out") ||
    message.includes("timeout") ||
    message.includes("time out") ||
    message.includes("時間切れ")
  );
}
```

#### 2. `.pi/lib/tui-utils.ts` (高優先度)
```typescript
import { Markdown, getMarkdownTheme } from "@mariozechner/pi-tui";

const LIVE_MARKDOWN_PREVIEW_MIN_WIDTH = 24;

export function looksLikeMarkdown(input: string): boolean {
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

export function renderPreviewWithMarkdown(
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

export function estimateLineCount(bytes: number, newlineCount: number, endsWithNewline: boolean): number {
  if (bytes <= 0) return 0;
  return newlineCount + (endsWithNewline ? 0 : 1);
}

export function toTailLines(tail: string, limit: number): string[] {
  const lines = tail
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);
  if (lines.length <= limit) return lines;
  return lines.slice(lines.length - limit);
}
```

#### 3. `.pi/lib/string-utils.ts` (中優先度)
```typescript
const LIVE_TAIL_LIMIT = 10_000;

export function appendTail(current: string, chunk: string, maxLength = LIVE_TAIL_LIMIT): string {
  if (!chunk) return current;
  const next = `${current}${chunk}`;
  if (next.length <= maxLength) return next;
  return next.slice(next.length - maxLength);
}

export function countOccurrences(input: string, target: string): number {
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

#### 4. `.pi/lib/file-utils.ts` (中優先度)
```typescript
import { existsSync, mkdirSync } from "node:fs";

export function ensureDir(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}
```

#### 5. `.pi/lib/format-utils.ts` (低優先度)
```typescript
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0ms";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function formatDurationMs<T extends { startedAtMs?: number; finishedAtMs?: number }>(
  item: T,
): string {
  if (!item.startedAtMs) return "-";
  const endMs = item.finishedAtMs ?? Date.now();
  const durationMs = Math.max(0, endMs - item.startedAtMs);
  return `${(durationMs / 1000).toFixed(1)}s`;
}
```

#### 6. `.pi/lib/validation.ts` (低優先度)
```typescript
export function toBoundedInteger(
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

#### 7. `.pi/lib/number-utils.ts` (低優先度)
```typescript
export function toFiniteNumber(value: unknown): number | undefined {
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return n;
}
```

---

## 5. 優先順位の明確化

### Phase 1: 高優先度（緊急・影響範囲広）
1. **toErrorMessage** - 4ファイルで完全一致、最も影響範囲が広い
2. **ensureDir** - 3ファイルで完全一致、使用箇所が多い
3. **looksLikeMarkdown + renderPreviewWithMarkdown** - agent-teams.ts/subagents.tsで密接関連、TUI表示に不可欠

### Phase 2: 中優先度（類似実装・統一で改善可能）
4. **toTailLines** - 空行処理ロジックの統一
5. **toFiniteNumber** - 返却型の一貫性
6. **formatDurationMs** - 中間変数の統一
7. **エラーハンドリング関数群**（classifyPressureError, isCancelledErrorMessage, isTimeoutErrorMessage, extractStatusCodeFromMessage） - error-utils.tsに一元化

### Phase 3: 低優先度（特定用途のみ）
8. **toBoundedInteger** - loop.ts, rsa.tsでのみ使用（引数パターンが類似）
9. **formatDuration** - loop.ts, rsa.tsでのみ使用
10. **appendTail, countOccurrences, estimateLineCount** - string-utils.ts/tui-utils.tsに移動

---

## 6. 重複の根本原因分析

### 6.1 重複のパターン

1. **コピーペーストによる実装** (大部分)
   - 開発時に既存の類似コードをコピーして使用
   - 特に agent-teams.ts と subagents.ts 間で顕著
   - 両拡張機能は類似の機能（並列実行の管理）を持つため、類似のユーティリティが必要になった

2. **独立実装** (一部)
   - 各拡張機能の開発者が同様のユーティリティを個別に実装
   - toFiniteNumber の context-usage-dashboard.ts の実装が例
   - 用途の違いにより挙動（返却型）を変更しているケース

3. **歴史的経緯**
   - 最初は1つの拡張機能（subagents.ts）で作成され、他の拡張機能（agent-teams.ts）開発時に必要に応じてコピーされた可能性
   - subagents.ts と agent-teams.ts は開発者が同じ可能性が高い

### 6.2 重複を許容した要因

1. **既存の共有ライブラリ活用の不足**
   - `.pi/lib/` ディレクトリは存在するが、拡張機能開発時に活用されていない
   - retry-with-backoff.ts, storage-lock.ts, concurrency.ts は一部の拡張機能で使用されているが、ユーティリティ関数の統合は進んでいない

2. **開発スピード優先**
   - 各拡張機能の開発時に、共通ライブラリへの抽出よりも機能実装を優先
   - 後でリファクタリングする計画が実行されなかった

3. **コードレビューの不足**
   - 重複実装が見つかっても、共通ライブラリへの移動が提案されなかった
   - テストインフラの欠如により、リファクタリングのリスクが高かった

---

## 7. 合議と結論

### 7.1 他メンバーの主張との照合

**Researcher (20260212-233845)** の主張:
- "subagents.tsとagent-teams.tsでappendTail、countOccurrences、formatBytes、formatClockTime、estimateLineCount、looksLikeMarkdownの6つの重複実装を発見"

**Reviewer (20260212-234017)** の主張:
- "toErrorMessageがsubagents.ts、agent-teams.ts、loop.ts、rsa.tsで重複定義"
- "formatBytes、formatPercent、formatDurationも複数のファイルで重複"

### 7.2 同意点
- Researcher、Reviewerともに subagents.ts と agent-teams.ts 間の重複実装を正しく特定している点に同意
- toErrorMessage の4ファイル重複を確認した点に同意
- エラーハンドリング関数の重複を指摘した点に同意

### 7.3 追加の発見（本調査による）
- タスクで指定されていなかった以下の関数の重複を追加特定:
  - classifyPressureError, isCancelledErrorMessage, isTimeoutErrorMessage, extractStatusCodeFromMessage（エラーハンドリング関数群）
- toTailLines の空行処理ロジックの差異を具体的に特定
- toFiniteNumber の返却型の違い（number vs number | undefined）を明確化

### 7.4 更新前の結論 vs 更新後の結論

**更新前の結論**:
- 11種類の完全一致重複と5種類の類似実装を特定
- 高優先度として toErrorMessage、ensureDir、looksLikeMarkdown + renderPreviewWithMarkdown を提案

**他メンバーの意見を踏まえた更新後の結論**:
- エラーハンドリング関数群（classifyPressureError, isCancelledErrorMessage, isTimeoutErrorMessage, extractStatusCodeFromMessage）も error-utils.ts に一元化することを追加提案
- Reviewerが指摘した formatBytes、formatPercent についても追調査が必要（本タスクの範囲外だが、次回調査で確認すべき）
- subagents.ts と agent-teams.ts の重複が特に顕著であるため、この2ファイルからの統合を優先的に進めるべき

### 7.5 合意: 重複統合の方針
高優先度の完全一致重複（toErrorMessage、ensureDir、looksLikeMarkdown、renderPreviewWithMarkdown）から順に統合を進め、続いてエラーハンドリング関数群を error-utils.ts に一元化することが、最も効率的かつリスクの低いアプローチであると合意。

---

## 8. 具体的な統合手順

### 8.1 手順1: `.pi/lib/error-utils.ts` の作成
1. 新規ファイル `.pi/lib/error-utils.ts` を作成
2. toErrorMessage, extractStatusCodeFromMessage, classifyPressureError, isCancelledErrorMessage, isTimeoutErrorMessage を実装
3. エクスポート文を追加

### 8.2 手順2: agent-teams.ts の更新
1. `.pi/lib/error-utils.ts` から関数をインポート
2. ローカル実装を削除（行 992-1030, 5340-5344）
3. 使用箇所を確認（ローカル関数参照をインポート関数に置換）

### 8.3 手順3: subagents.ts の更新
1. `.pi/lib/error-utils.ts` から関数をインポート
2. ローカル実装を削除（行 722-760, 3087-3091）
3. 使用箇所を確認（ローカル関数参照をインポート関数に置換）

### 8.4 手順4: loop.ts, rsa.ts の更新
1. `.pi/lib/error-utils.ts` から toErrorMessage をインポート
2. ローカル実装を削除
3. 使用箇所を確認

### 8.5 手順5: `.pi/lib/tui-utils.ts` の作成
1. 新規ファイル `.pi/lib/tui-utils.ts` を作成
2. looksLikeMarkdown, renderPreviewWithMarkdown, estimateLineCount, toTailLines を実装
3. エクスポート文を追加

### 8.6 手順6: agent-teams.ts, subagents.ts の追加更新
1. `.pi/lib/tui-utils.ts` から関数をインポート
2. ローカル実装を削除
3. 使用箇所を確認

### 8.7 手順7: その他のモジュールの作成と更新
1. `.pi/lib/file-utils.ts` の作成と ensureDir の統合
2. `.pi/lib/string-utils.ts` の作成と appendTail, countOccurrences の統合
3. `.pi/lib/format-utils.ts` の作成と formatDuration, formatDurationMs の統合

---

## 9. 次のステップ

### Phase 2（実装設計）への移行

本カタログで特定された重複実装を統合するための具体的な実装計画を策定します。

1. **高優先度モジュールの作成**
   - `.pi/lib/error-utils.ts` の作成
   - `.pi/lib/tui-utils.ts` の作成

2. **拡張機能の更新**
   - agent-teams.ts、subagents.ts からのインポートへの切り替え
   - ローカル実装の削除

3. **テストと検証**
   - 各拡張機能の動作確認
   - 回帰テストの実施（テストインフラが構築された場合）

4. **中優先度モジュールの作成と更新**
   - `.pi/lib/file-utils.ts`, `.pi/lib/string-utils.ts`, `.pi/lib/format-utils.ts` の作成

---

## 10. 追加調査が必要な項目

本カタログではタスクで指定された重複実装を重点的に調査しましたが、以下の項目について追加調査が必要です:

1. **formatBytes, formatPercent, formatClockTime**
   - Reviewerが指摘した関数の詳細調査
   - 重複の有無と統合可能性の評価

2. **trimForError, buildRuntimeLimitError, buildRuntimeQueueWaitError**
   - Implementerが言及した関数の詳細調査
   - subagents.ts と agent-teams.ts での重複確認

3. **storage management patterns**
   - loadStorage / saveStorage パターンの重複調査
   - storage-lock.ts の活用状況の改善

---

## 付録 A: ファイル行番号索引

| 関数名 | ファイル | 行番号 |
|--------|---------|--------|
| toBoundedInteger | loop.ts | 2448-2463 |
| toBoundedInteger | rsa.ts | 879-894 |
| toErrorMessage | agent-teams.ts | 5340-5344 |
| toErrorMessage | loop.ts | 2477-2481 |
| toErrorMessage | rsa.ts | 1500-1504 |
| toErrorMessage | subagents.ts | 3087-3091 |
| looksLikeMarkdown | agent-teams.ts | 289-302 |
| looksLikeMarkdown | subagents.ts | 225-238 |
| renderPreviewWithMarkdown | agent-teams.ts | 304-325 |
| renderPreviewWithMarkdown | subagents.ts | 240-261 |
| appendTail | agent-teams.ts | 248-255 |
| appendTail | subagents.ts | 184-191 |
| countOccurrences | agent-teams.ts | 255-267 |
| countOccurrences | subagents.ts | 191-203 |
| estimateLineCount | agent-teams.ts | 284-289 |
| estimateLineCount | subagents.ts | 220-225 |
| ensureDir | agent-teams.ts | 1819-1824 |
| ensureDir | agent-usage-tracker.ts | 135-140 |
| ensureDir | subagents.ts | 1300-1305 |
| formatDuration | loop.ts | 2465-2470 |
| formatDuration | rsa.ts | 1483-1488 |
| formatDurationMs | agent-teams.ts | 343-349 |
| formatDurationMs | subagents.ts | 277-283 |
| toFiniteNumber | agent-usage-tracker.ts | 437-440 |
| toFiniteNumber | context-usage-dashboard.ts | 72-75 |
| toFiniteNumber | retry-with-backoff.ts | 82-85 |
| toTailLines | agent-teams.ts | 332-340 |
| toTailLines | subagents.ts | 268-276 |
| extractStatusCodeFromMessage | agent-teams.ts | 992-999 |
| extractStatusCodeFromMessage | subagents.ts | 722-729 |
| classifyPressureError | agent-teams.ts | 1000-1010 |
| classifyPressureError | subagents.ts | 730-740 |
| isCancelledErrorMessage | agent-teams.ts | 1011-1019 |
| isCancelledErrorMessage | subagents.ts | 741-749 |
| isTimeoutErrorMessage | agent-teams.ts | 1022-1030 |
| isTimeoutErrorMessage | subagents.ts | 752-760 |

---

## 11. Phase 2 実装結果

### 11.1 作成されたモジュール

Phase 2で以下のモジュールを作成・更新しました:

#### `.pi/lib/error-utils.ts` (完了)
- toErrorMessage
- extractStatusCodeFromMessage
- classifyPressureError
- isCancelledErrorMessage
- isTimeoutErrorMessage
- PressureErrorType (型)

#### `.pi/lib/tui-utils.ts` (完了)
- appendTail
- toTailLines
- countOccurrences
- estimateLineCount
- looksLikeMarkdown
- renderPreviewWithMarkdown
- LIVE_TAIL_LIMIT (定数)
- LIVE_MARKDOWN_PREVIEW_MIN_WIDTH (定数)
- MarkdownPreviewResult (型)

#### `.pi/lib/validation-utils.ts` (完了)
- toFiniteNumber
- toFiniteNumberWithDefault
- toBoundedInteger
- clampInteger
- clampFloat
- BoundedIntegerResult (型)

#### `.pi/lib/fs-utils.ts` (完了)
- ensureDir

#### `.pi/lib/format-utils.ts` (完了)
- formatDuration
- formatDurationMs
- formatBytes
- formatClockTime
- normalizeForSingleLine

#### `.pi/lib/index.ts` (更新完了)
- 全モジュールからの再エクスポート

### 11.2 依存関係の構造

全モジュールは Layer 0（他のlibモジュールに依存しない）として設計されています:
- error-utils.ts: 外部依存なし
- tui-utils.ts: @mariozechner/pi-tui のみ依存
- validation-utils.ts: 外部依存なし
- fs-utils.ts: Node.js fs モジュールのみ依存
- format-utils.ts: 外部依存なし

循環依存は発生しません。

### 11.3 次のステップ (Phase 3: Review)

Reviewerによる以下の検証が必要です:
1. 各モジュールの型定義が正しいこと
2. JSDocコメントが完全であること
3. 循環依存がないこと
4. 元の実装とロジックが一致していること

---

*ドキュメント終了*
